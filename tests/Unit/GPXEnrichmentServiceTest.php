<?php
/**
 * Tests for GPX_Enrichment_Service.
 */

declare(strict_types=1);

namespace EMSRoute\Tests\Unit;

use EMSRoute\Tests\TestCase;
use EMSRoute\Core\GPX\GPX_Enrichment_Service;
use EMSRoute\Core\Geodesy\OSGB36_Converter;
use EMSRoute\Core\DEM\OS_Terrain_Binary_Reader;
use EMSRoute\Core\Timing\Naismith_Calculator;
use InvalidArgumentException;
use RuntimeException;

class GPXEnrichmentServiceTest extends TestCase {
    private GPX_Enrichment_Service $service;

    protected function setUp(): void {
        parent::setUp();
        // Use local dem-data or shared dem-data directory if available
        $demPath = dirname( __DIR__, 3 ) . '/wordpress-env/wordpress/wp-content/dofe-dem-data';
        if ( ! is_dir( $demPath ) ) {
            $demPath = dirname( __DIR__, 2 ) . '/dem-data';
        }

        $converter  = new OSGB36_Converter();
        $demReader  = new OS_Terrain_Binary_Reader( $demPath );
        $calculator = new Naismith_Calculator();

        $this->service = new GPX_Enrichment_Service( $converter, $demReader, $calculator );
    }

    public function test_throws_on_empty_content(): void {
        $this->expectException( InvalidArgumentException::class );
        $this->service->enrichGpx( '' );
    }

    public function test_throws_on_invalid_xml(): void {
        $this->expectException( RuntimeException::class );
        $this->service->enrichGpx( '<not valid xml' );
    }

    public function test_enriches_real_gold_practice_day1_gpx(): void {
        $gpxFile = dirname( __DIR__, 2 ) . '/mockdata/2024_GoldPracticeDay1.gpx';
        $this->assertFileExists( $gpxFile );

        $result = $this->service->enrichGpx( $gpxFile );

        // 1. Route Title
        $this->assertSame( '2024_Gold Practice Day 1', $result['route_title'] );

        // 2. Vertices & Densification
        $this->assertGreaterThan( 50, $result['vertex_count'] );
        $firstV = $result['vertices'][0];

        $this->assertArrayHasKey( 'lat', $firstV );
        $this->assertArrayHasKey( 'lon', $firstV );
        $this->assertArrayHasKey( 'easting', $firstV );
        $this->assertArrayHasKey( 'northing', $firstV );
        $this->assertArrayHasKey( 'grid_ref_6', $firstV );
        $this->assertArrayHasKey( 'grid_ref_8', $firstV );
        $this->assertArrayHasKey( 'ele_dem', $firstV );
        $this->assertSame( 0.0, $firstV['dist_from_start_m'] );

        // First point should be around NT 244 405 (actual GPS coordinates)
        $this->assertStringStartsWith( 'NT 24', $firstV['grid_ref_6'] );

        // 3. Legs
        $this->assertNotEmpty( $result['legs'] );
        $leg1 = $result['legs'][0];

        $this->assertSame( 1, $leg1['leg_number'] );
        $this->assertGreaterThan( 0.0, $leg1['distance_km'] );
        $this->assertGreaterThan( 0, $leg1['walking_minutes'] );
        $this->assertArrayHasKey( 'grid_bearing', $leg1 );
        $this->assertArrayHasKey( 'magnetic_bearing', $leg1 );

        // Check tunnel detection
        $hasTunnelLeg = false;
        foreach ( $result['legs'] as $leg ) {
            if ( $leg['flat_override'] ) {
                $hasTunnelLeg = true;
                break;
            }
        }
        $this->assertTrue( $hasTunnelLeg, 'Expected at least one leg marked with flat_override for the tunnel' );

        // 4. Totals
        $this->assertGreaterThan( 5.0, $result['total_distance_km'] );
        $this->assertGreaterThan( 0, $result['estimated_walking_minutes'] );
    }

    public function test_simple_minimal_gpx(): void {
        $simpleGpx = '<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Test">
    <trk>
        <name>Mini Test Track</name>
        <trkseg>
            <trkpt lat="55.944111" lon="-3.161806"><ele>245.0</ele></trkpt>
            <trkpt lat="55.954111" lon="-3.161806"><ele>200.0</ele></trkpt>
        </trkseg>
    </trk>
</gpx>';

        $res = $this->service->enrichGpx( $simpleGpx );
        $this->assertSame( 'Mini Test Track', $res['route_title'] );
        $this->assertCount( 1, $res['legs'] );
        $this->assertGreaterThan( 2, $res['vertex_count'] ); // densified from 2 points
    }
}
