<?php
/**
 * GPX Parsing & Track Enrichment Service.
 *
 * Ingests GPX files/strings, performs 25m segment densification, converts coordinates
 * to OSGB36 Easting/Northing, enriches vertices with DEM elevation, maps waypoints
 * to leg checkpoints, and calculates Naismith timings and bearings.
 */

declare(strict_types=1);

namespace EMSRoute\Core\GPX;

use EMSRoute\Core\Geodesy\OSGB36_Converter;
use EMSRoute\Core\DEM\OS_Terrain_Binary_Reader;
use EMSRoute\Core\Timing\Naismith_Calculator;
use InvalidArgumentException;
use RuntimeException;
use SimpleXMLElement;

class GPX_Enrichment_Service {
    public const MAX_SEGMENT_DISTANCE_M = 25.0; // Interpolate vertices if gap > 25m

    private OSGB36_Converter $converter;
    private OS_Terrain_Binary_Reader $demReader;
    private Naismith_Calculator $timingCalculator;

    public function __construct(
        ?OSGB36_Converter $converter = null,
        ?OS_Terrain_Binary_Reader $demReader = null,
        ?Naismith_Calculator $timingCalculator = null
    ) {
        $this->converter        = $converter ?? new OSGB36_Converter();
        $this->demReader        = $demReader ?? new OS_Terrain_Binary_Reader();
        $this->timingCalculator = $timingCalculator ?? new Naismith_Calculator();
    }

    /**
     * Parses and enriches a GPX XML string.
     *
     * @param string $gpxContent Raw GPX XML string or path to GPX file
     * @return array{
     *     route_title: string,
     *     total_distance_km: float,
     *     total_ascent_m: float,
     *     total_descent_m: float,
     *     estimated_walking_minutes: int,
     *     vertex_count: int,
     *     legs: array<int, array<string, mixed>>,
     *     vertices: array<int, array<string, mixed>>,
     *     suggested_split_indices: array<int>,
     *     warnings: array<int, string>
     * }
     */
    public function enrichGpx( string $gpxContent ): array {
        // If passed a valid file path, read file contents
        if ( strlen( $gpxContent ) < 4096 && file_exists( $gpxContent ) ) {
            $gpxContent = file_get_contents( $gpxContent ) ?: '';
        }

        if ( empty( trim( $gpxContent ) ) ) {
            throw new InvalidArgumentException( 'GPX content is empty.' );
        }

        // Safe XML parsing with internal error handling
        $prevErrors = libxml_use_internal_errors( true );

        try {
            $xml = simplexml_load_string( $gpxContent );
        } finally {
            libxml_use_internal_errors( $prevErrors );
        }

        if ( false === $xml ) {
            throw new RuntimeException( 'Failed to parse GPX XML content.' );
        }

        // 1. Extract Route Title
        $routeTitle = '';
        if ( isset( $xml->metadata->name ) ) {
            $routeTitle = (string) $xml->metadata->name;
        } elseif ( isset( $xml->trk->name ) ) {
            $routeTitle = (string) $xml->trk->name;
        } elseif ( isset( $xml->rte->name ) ) {
            $routeTitle = (string) $xml->rte->name;
        }

        // 2. Extract Raw Coordinates (<trkpt> or <rtept>)
        $rawPoints = $this->extractTrackPoints( $xml );
        if ( count( $rawPoints ) < 2 ) {
            throw new RuntimeException( 'GPX contains fewer than 2 coordinate points.' );
        }

        // 3. Extract Waypoints (<wpt>)
        $waypoints = $this->extractWaypoints( $xml );

        // 4. Densify track segments (interpolate vertices spaced > 25m apart)
        $densifiedPoints = $this->densifyTrack( $rawPoints, self::MAX_SEGMENT_DISTANCE_M );

        // 5. Enrich Vertices with OSGB36 coordinates, 6/8-fig grid refs, and DEM elevation
        $enrichedVertices = $this->enrichVertices( $densifiedPoints );

        // 6. Associate Waypoints with closest track vertices to define initial Legs
        $legBoundaries = $this->resolveLegBoundaries( $enrichedVertices, $waypoints );

        // 7. Calculate Leg Metrics (bearings, distances, ascent, Naismith timing)
        $legs = $this->buildLegs( $enrichedVertices, $legBoundaries );

        // 8. Run Pre-flight coaching checks
        $warnings = $this->generateWarnings( $legs );

        // Calculate summary totals
        $totalDistKm   = 0.0;
        $totalAscentM  = 0.0;
        $totalDescentM = 0.0;
        $totalWalkMins = 0;

        foreach ( $legs as $leg ) {
            $totalDistKm   += $leg['distance_km'];
            $totalAscentM  += $leg['ascent_m'];
            $totalDescentM += $leg['descent_m'];
            $totalWalkMins += $leg['walking_minutes'];
        }

        // Suggested split points (unnamed waypoints)
        $suggestedSplitIndices = [];
        foreach ( $waypoints as $wpt ) {
            if ( $wpt['is_shaping_point'] && isset( $wpt['matched_vertex_index'] ) ) {
                $suggestedSplitIndices[] = $wpt['matched_vertex_index'];
            }
        }

        return [
            'route_title'               => $routeTitle,
            'total_distance_km'         => round( $totalDistKm, 2 ),
            'total_ascent_m'            => round( $totalAscentM, 1 ),
            'total_descent_m'           => round( $totalDescentM, 1 ),
            'estimated_walking_minutes' => $totalWalkMins,
            'vertex_count'              => count( $enrichedVertices ),
            'legs'                      => $legs,
            'vertices'                  => $enrichedVertices,
            'suggested_split_indices'   => array_values( array_unique( $suggestedSplitIndices ) ),
            'warnings'                  => $warnings,
        ];
    }

    /**
     * Extracts raw points from GPX XML.
     *
     * @return array<int, array{lat: float, lon: float, ele_gpx: ?float}>
     */
    private function extractTrackPoints( SimpleXMLElement $xml ): array {
        $points = [];

        // Check for <trk><trkseg><trkpt>
        if ( isset( $xml->trk ) ) {
            foreach ( $xml->trk as $trk ) {
                foreach ( $trk->trkseg as $seg ) {
                    foreach ( $seg->trkpt as $pt ) {
                        $points[] = [
                            'lat'     => (float) $pt['lat'],
                            'lon'     => (float) $pt['lon'],
                            'ele_gpx' => isset( $pt->ele ) ? (float) $pt->ele : null,
                        ];
                    }
                }
            }
        }

        // Fallback to <rte><rtept>
        if ( empty( $points ) && isset( $xml->rte ) ) {
            foreach ( $xml->rte as $rte ) {
                foreach ( $rte->rtept as $pt ) {
                    $points[] = [
                        'lat'     => (float) $pt['lat'],
                        'lon'     => (float) $pt['lon'],
                        'ele_gpx' => isset( $pt->ele ) ? (float) $pt->ele : null,
                    ];
                }
            }
        }

        return $points;
    }

    /**
     * Extracts waypoints (<wpt>) from GPX XML.
     *
     * @return array<int, array{lat: float, lon: float, name: string, desc: string, is_shaping_point: bool}>
     */
    private function extractWaypoints( SimpleXMLElement $xml ): array {
        $waypoints = [];
        if ( ! isset( $xml->wpt ) ) {
            return [];
        }

        foreach ( $xml->wpt as $wpt ) {
            $name = isset( $wpt->name ) ? trim( (string) $wpt->name ) : '';
            $desc = isset( $wpt->desc ) ? trim( (string) $wpt->desc ) : '';

            // An unnamed waypoint or empty tag is an intermediate shaping point
            $isShaping = empty( $name );

            $waypoints[] = [
                'lat'              => (float) $wpt['lat'],
                'lon'              => (float) $wpt['lon'],
                'name'             => $name,
                'desc'             => $desc,
                'is_shaping_point' => $isShaping,
            ];
        }

        return $waypoints;
    }

    /**
     * Linearly densifies track segments that exceed the maximum distance threshold.
     *
     * @param array<int, array{lat: float, lon: float, ele_gpx: ?float}> $points
     * @return array<int, array{lat: float, lon: float, ele_gpx: ?float}>
     */
    private function densifyTrack( array $points, float $maxDistanceM ): array {
        $densified = [];
        $count     = count( $points );

        for ( $i = 0; $i < $count; $i++ ) {
            $p1 = $points[ $i ];
            $densified[] = $p1;

            if ( $i < $count - 1 ) {
                $p2   = $points[ $i + 1 ];
                $dist = $this->haversineDistance( $p1['lat'], $p1['lon'], $p2['lat'], $p2['lon'] );

                if ( $dist > $maxDistanceM ) {
                    $numSegments = (int) ceil( $dist / $maxDistanceM );
                    for ( $s = 1; $s < $numSegments; $s++ ) {
                        $fraction = $s / (float) $numSegments;
                        $interpLat = $p1['lat'] + ( $p2['lat'] - $p1['lat'] ) * $fraction;
                        $interpLon = $p1['lon'] + ( $p2['lon'] - $p1['lon'] ) * $fraction;

                        $interpEle = null;
                        if ( null !== $p1['ele_gpx'] && null !== $p2['ele_gpx'] ) {
                            $interpEle = $p1['ele_gpx'] + ( $p2['ele_gpx'] - $p1['ele_gpx'] ) * $fraction;
                        }

                        $densified[] = [
                            'lat'     => $interpLat,
                            'lon'     => $interpLon,
                            'ele_gpx' => $interpEle,
                        ];
                    }
                }
            }
        }

        return $densified;
    }

    /**
     * Enriches vertices with Easting, Northing, Grid References, DEM elevation, and cumulative stats.
     *
     * @param array<int, array{lat: float, lon: float, ele_gpx: ?float}> $points
     * @return array<int, array{
     *     index: int,
     *     lat: float,
     *     lon: float,
     *     easting: float,
     *     northing: float,
     *     grid_ref_6: string,
     *     grid_ref_8: string,
     *     ele_dem: float,
     *     dist_from_start_m: float,
     *     ascent_from_start_m: float,
     *     descent_from_start_m: float
     * }>
     */
    private function enrichVertices( array $points ): array {
        $enriched        = [];
        $cumDistM        = 0.0;
        $cumAscentM      = 0.0;
        $cumDescentM     = 0.0;
        $prevE           = null;
        $prevN           = null;
        $prevEle         = null;

        foreach ( $points as $idx => $pt ) {
            $osCoords = $this->converter->wgs84ToOsgb36( $pt['lat'], $pt['lon'] );
            $easting  = $osCoords['easting'];
            $northing = $osCoords['northing'];

            $gridRef6 = $this->converter->toGridReference( $easting, $northing, 6 );
            $gridRef8 = $this->converter->toGridReference( $easting, $northing, 8 );

            // Sample DEM elevation
            $demEle = $this->demReader->getElevation( $easting, $northing, true );
            $ele    = $demEle ?? ( $pt['ele_gpx'] ?? 0.0 );

            if ( null !== $prevE && null !== $prevN && null !== $prevEle ) {
                $dx = $easting - $prevE;
                $dy = $northing - $prevN;
                $stepDist = sqrt( $dx * $dx + $dy * $dy );
                $cumDistM += $stepDist;

                $dEle = $ele - $prevEle;
                if ( $dEle > 0.0 ) {
                    $cumAscentM += $dEle;
                } else {
                    $cumDescentM += abs( $dEle );
                }
            }

            $prevE   = $easting;
            $prevN   = $northing;
            $prevEle = $ele;

            $enriched[] = [
                'index'                 => $idx,
                'lat'                   => round( $pt['lat'], 6 ),
                'lon'                   => round( $pt['lon'], 6 ),
                'easting'               => round( $easting, 1 ),
                'northing'              => round( $northing, 1 ),
                'grid_ref_6'            => $gridRef6,
                'grid_ref_8'            => $gridRef8,
                'ele_dem'               => round( $ele, 1 ),
                'dist_from_start_m'     => round( $cumDistM, 1 ),
                'ascent_from_start_m'   => round( $cumAscentM, 1 ),
                'descent_from_start_m'  => round( $cumDescentM, 1 ),
            ];
        }

        return $enriched;
    }

    /**
     * Resolves leg boundary vertex indices based on waypoints.
     *
     * @param array<int, array<string, mixed>> $vertices
     * @param array<int, array<string, mixed>> $waypoints
     * @return array<int, array{vertex_index: int, name: string, desc: string}>
     */
    private function resolveLegBoundaries( array $vertices, array &$waypoints ): array {
        $lastIdx = count( $vertices ) - 1;
        $namedBoundaries = [];

        // Match waypoints to closest vertices
        foreach ( $waypoints as &$wpt ) {
            $closestIdx  = 0;
            $closestDist = 999999.0;

            foreach ( $vertices as $vIdx => $v ) {
                $d = $this->haversineDistance( $wpt['lat'], $wpt['lon'], $v['lat'], $v['lon'] );
                if ( $d < $closestDist ) {
                    $closestDist = $d;
                    $closestIdx  = $vIdx;
                }
            }

            $wpt['matched_vertex_index'] = $closestIdx;

            if ( ! $wpt['is_shaping_point'] ) {
                $namedBoundaries[] = [
                    'vertex_index' => $closestIdx,
                    'name'         => $wpt['name'],
                    'desc'         => $wpt['desc'],
                ];
            }
        }
        unset( $wpt );

        // Ensure start (index 0) and end (last index) are included
        usort( $namedBoundaries, fn( $a, $b ) => $a['vertex_index'] <=> $b['vertex_index'] );

        $indices = array_column( $namedBoundaries, 'vertex_index' );

        if ( ! in_array( 0, $indices, true ) ) {
            array_unshift( $namedBoundaries, [
                'vertex_index' => 0,
                'name'         => 'Start',
                'desc'         => 'Expedition Day Start',
            ] );
        }

        if ( ! in_array( $lastIdx, $indices, true ) ) {
            $namedBoundaries[] = [
                'vertex_index' => $lastIdx,
                'name'         => 'Finish',
                'desc'         => 'Expedition Day Finish / Camp',
            ];
        }

        // Deduplicate adjacent boundaries that match the same vertex
        $deduped = [];
        $seen = [];
        foreach ( $namedBoundaries as $b ) {
            if ( ! isset( $seen[ $b['vertex_index'] ] ) ) {
                $seen[ $b['vertex_index'] ] = true;
                $deduped[] = $b;
            }
        }

        return $deduped;
    }

    /**
     * Constructs leg metadata between boundary checkpoints.
     *
     * @param array<int, array<string, mixed>> $vertices
     * @param array<int, array{vertex_index: int, name: string, desc: string}> $boundaries
     * @return array<int, array<string, mixed>>
     */
    private function buildLegs( array $vertices, array $boundaries ): array {
        $legs = [];
        $count = count( $boundaries );

        for ( $i = 0; $i < $count - 1; $i++ ) {
            $startB = $boundaries[ $i ];
            $endB   = $boundaries[ $i + 1 ];

            $startV = $vertices[ $startB['vertex_index'] ];
            $endV   = $vertices[ $endB['vertex_index'] ];

            $legDistM   = $endV['dist_from_start_m'] - $startV['dist_from_start_m'];
            $legAscentM = $endV['ascent_from_start_m'] - $startV['ascent_from_start_m'];
            $legDescM   = $endV['descent_from_start_m'] - $startV['descent_from_start_m'];

            $bearings = $this->converter->calculateBearing(
                $startV['easting'],
                $startV['northing'],
                $endV['easting'],
                $endV['northing']
            );

            // Check if user description notes tunnel / flat
            $combinedText = $startB['desc'] . ' ' . $endB['desc'] . ' ' . $startB['name'] . ' ' . $endB['name'];
            $isTunnel = (bool) preg_match( '/\b(tunnel|viaduct)\b/i', $combinedText );

            $timing = $this->timingCalculator->calculateLeg(
                $legDistM,
                $legAscentM,
                $legDescM,
                0,
                0,
                $isTunnel
            );

            $legs[] = [
                'leg_number'          => $i + 1,
                'start_vertex_index'  => $startB['vertex_index'],
                'end_vertex_index'    => $endB['vertex_index'],
                'checkpoint_from'     => $startB['name'],
                'checkpoint_to'       => $endB['name'],
                'start_grid_ref_6'    => $startV['grid_ref_6'],
                'start_grid_ref_8'    => $startV['grid_ref_8'],
                'end_grid_ref_6'      => $endV['grid_ref_6'],
                'end_grid_ref_8'      => $endV['grid_ref_8'],
                'grid_bearing'        => $bearings['grid_bearing'],
                'magnetic_bearing'    => $bearings['magnetic_bearing'],
                'distance_km'         => $timing['distance_km'],
                'ascent_m'            => $timing['ascent_m'],
                'descent_m'           => $timing['descent_m'],
                'walking_minutes'     => $timing['total_walking_minutes'],
                'rest_minutes'        => 0,
                'exploration_minutes' => 0,
                'total_minutes'       => $timing['total_leg_minutes'],
                'flat_override'       => $isTunnel,
                'description'         => $endB['desc'],
                'escape_route'        => '',
            ];
        }

        return $legs;
    }

    /**
     * Generates pre-flight coaching checks / warnings.
     *
     * @param array<int, array<string, mixed>> $legs
     * @return array<int, string>
     */
    private function generateWarnings( array $legs ): array {
        $warnings = [];

        foreach ( $legs as $leg ) {
            $num = $leg['leg_number'];

            if ( $leg['distance_km'] > 3.0 ) {
                $warnings[] = sprintf( 'Leg %d is %.1f km long without a checkpoint. DofE recommended maximum is 3.0 km.', $num, $leg['distance_km'] );
            }

            if ( $leg['walking_minutes'] > 60 ) {
                $warnings[] = sprintf( 'Leg %d takes %d minutes walking time. Consider splitting legs exceeding 60 minutes.', $num, $leg['walking_minutes'] );
            }

            if ( $leg['ascent_m'] > 150.0 ) {
                $warnings[] = sprintf( 'Leg %d involves a steep ascent of %.0f m. Ensure pacing and rest intervals are noted.', $num, $leg['ascent_m'] );
            }
        }

        return $warnings;
    }

    /**
     * Haversine distance in metres between two lat/lon points.
     */
    private function haversineDistance( float $lat1, float $lon1, float $lat2, float $lon2 ): float {
        $earthRadiusM = 6371000.0;
        $dLat = deg2rad( $lat2 - $lat1 );
        $dLon = deg2rad( $lon2 - $lon1 );

        $a = sin( $dLat / 2.0 ) * sin( $dLat / 2.0 )
           + cos( deg2rad( $lat1 ) ) * cos( deg2rad( $lat2 ) ) * sin( $dLon / 2.0 ) * sin( $dLon / 2.0 );

        $c = 2.0 * atan2( sqrt( $a ), sqrt( 1.0 - $a ) );
        return $earthRadiusM * $c;
    }
}
