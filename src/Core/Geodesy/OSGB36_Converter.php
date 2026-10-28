<?php
/**
 * OSGB36 & British National Grid Geodesy Converter.
 *
 * Implements pure mathematical transformation between WGS84 (GPS latitude/longitude)
 * and British National Grid OSGB36 (Easting/Northing) using the standard 7-parameter Helmert
 * datum transformation and Transverse Mercator projection.
 */

declare(strict_types=1);

namespace EMSRoute\Core\Geodesy;

use InvalidArgumentException;

class OSGB36_Converter {
    // Airy 1830 Ellipsoid (OSGB36)
    private const AIRY_A = 6377563.396;
    private const AIRY_B = 6356256.909;

    // WGS84 Ellipsoid
    private const WGS_A = 6378137.0;
    private const WGS_B = 6356752.314245;

    // British National Grid Transverse Mercator Projection parameters
    private const TM_F0 = 0.9996012717; // Central meridian scale factor
    private const TM_E0 = 400000.0;      // False Easting (metres)
    private const TM_N0 = -100000.0;     // False Northing (metres)
    private const TM_LAT0 = 49.0;        // Latitude of true origin (49° N)
    private const TM_LON0 = -2.0;        // Longitude of true origin (2° W)

    // Helmert 7-parameter transformation (WGS84 -> OSGB36)
    private const HELMERT_TX = -446.448;
    private const HELMERT_TY = 125.157;
    private const HELMERT_TZ = -542.060;
    private const HELMERT_S  = 20.4894e-6; // ppm
    private const HELMERT_RX = -0.1502;    // arcseconds
    private const HELMERT_RY = -0.2470;    // arcseconds
    private const HELMERT_RZ = -0.8421;    // arcseconds

    /**
     * Converts WGS84 latitude/longitude to British National Grid OSGB36 Easting and Northing.
     *
     * @param float $lat Latitude in decimal degrees (e.g. 55.9441)
     * @param float $lon Longitude in decimal degrees (e.g. -3.1618)
     * @param float $height Ellipsoidal height in metres (defaults to 0.0)
     * @return array{easting: float, northing: float}
     */
    public function wgs84ToOsgb36( float $lat, float $lon, float $height = 0.0 ): array {
        $deg2rad = M_PI / 180.0;

        // 1. Convert WGS84 geodetic coordinates to Cartesian (X, Y, Z)
        $e2_wgs = 1.0 - ( self::WGS_B * self::WGS_B ) / ( self::WGS_A * self::WGS_A );
        $phi    = $lat * $deg2rad;
        $lambda = $lon * $deg2rad;

        $sinPhi    = sin( $phi );
        $cosPhi    = cos( $phi );
        $sinLambda = sin( $lambda );
        $cosLambda = cos( $lambda );

        $nu = self::WGS_A / sqrt( 1.0 - $e2_wgs * $sinPhi * $sinPhi );

        $x1 = ( $nu + $height ) * $cosPhi * $cosLambda;
        $y1 = ( $nu + $height ) * $cosPhi * $sinLambda;
        $z1 = ( ( 1.0 - $e2_wgs ) * $nu + $height ) * $sinPhi;

        // 2. Apply Helmert 7-parameter transformation WGS84 -> OSGB36
        $sec2rad = $deg2rad / 3600.0;
        $rx      = self::HELMERT_RX * $sec2rad;
        $ry      = self::HELMERT_RY * $sec2rad;
        $rz      = self::HELMERT_RZ * $sec2rad;
        $s       = self::HELMERT_S;

        $x2 = self::HELMERT_TX + ( 1.0 + $s ) * $x1 + ( -$rz ) * $y1 + ( $ry ) * $z1;
        $y2 = self::HELMERT_TY + ( $rz ) * $x1 + ( 1.0 + $s ) * $y1 + ( -$rx ) * $z1;
        $z2 = self::HELMERT_TZ + ( -$ry ) * $x1 + ( $rx ) * $y1 + ( 1.0 + $s ) * $z1;

        // 3. Cartesian to OSGB36 ellipsoidal coordinates (Airy 1830)
        $e2_airy = 1.0 - ( self::AIRY_B * self::AIRY_B ) / ( self::AIRY_A * self::AIRY_A );
        $p       = sqrt( $x2 * $x2 + $y2 * $y2 );
        $phi_os  = atan2( $z2, $p * ( 1.0 - $e2_airy ) );

        for ( $i = 0; $i < 10; $i++ ) {
            $sinPhi_os = sin( $phi_os );
            $nu_os     = self::AIRY_A / sqrt( 1.0 - $e2_airy * $sinPhi_os * $sinPhi_os );
            $phi_os    = atan2( $z2 + $e2_airy * $nu_os * $sinPhi_os, $p );
        }
        $lambda_os = atan2( $y2, $x2 );

        // 4. Project OSGB36 ellipsoidal coords to British National Grid (Transverse Mercator)
        $phi0    = self::TM_LAT0 * $deg2rad;
        $lambda0 = self::TM_LON0 * $deg2rad;
        $af0     = self::AIRY_A * self::TM_F0;
        $bf0     = self::AIRY_B * self::TM_F0;
        $e2      = 1.0 - ( $bf0 * $bf0 ) / ( $af0 * $af0 );
        $n       = ( $af0 - $bf0 ) / ( $af0 + $bf0 );
        $n2      = $n * $n;
        $n3      = $n * $n * $n;

        $cosPhi_os = cos( $phi_os );
        $sinPhi_os = sin( $phi_os );
        $tanPhi_os = tan( $phi_os );
        $tan2Phi   = $tanPhi_os * $tanPhi_os;
        $tan4Phi   = $tan2Phi * $tan2Phi;

        $nu_tm = $af0 / sqrt( 1.0 - $e2 * $sinPhi_os * $sinPhi_os );
        $rho   = $af0 * ( 1.0 - $e2 ) / pow( 1.0 - $e2 * $sinPhi_os * $sinPhi_os, 1.5 );
        $eta2  = ( $nu_tm / $rho ) - 1.0;

        $p_diff = $lambda_os - $lambda0;
        $p2     = $p_diff * $p_diff;
        $p3     = $p2 * $p_diff;
        $p4     = $p2 * $p2;
        $p5     = $p4 * $p_diff;
        $p6     = $p3 * $p3;

        // Meridional arc M
        $m = $bf0 * (
            ( 1.0 + $n + 1.25 * ( $n2 + $n3 ) ) * ( $phi_os - $phi0 )
            - ( 3.0 * $n + 3.0 * $n2 + 2.625 * $n3 ) * sin( $phi_os - $phi0 ) * cos( $phi_os + $phi0 )
            + ( 1.875 * ( $n2 + $n3 ) ) * sin( 2.0 * ( $phi_os - $phi0 ) ) * cos( 2.0 * ( $phi_os + $phi0 ) )
            - ( ( 35.0 / 24.0 ) * $n3 ) * sin( 3.0 * ( $phi_os - $phi0 ) ) * cos( 3.0 * ( $phi_os + $phi0 ) )
        );

        $i_term    = $m + self::TM_N0;
        $ii_term   = ( $nu_tm / 2.0 ) * $sinPhi_os * $cosPhi_os;
        $iii_term  = ( $nu_tm / 24.0 ) * $sinPhi_os * pow( $cosPhi_os, 3.0 ) * ( 5.0 - $tan2Phi + 9.0 * $eta2 );
        $iiia_term = ( $nu_tm / 720.0 ) * $sinPhi_os * pow( $cosPhi_os, 5.0 ) * ( 61.0 - 58.0 * $tan2Phi + $tan4Phi );

        $iv_term = $nu_tm * $cosPhi_os;
        $v_term  = ( $nu_tm / 6.0 ) * pow( $cosPhi_os, 3.0 ) * ( ( $nu_tm / $rho ) - $tan2Phi );
        $vi_term = ( $nu_tm / 120.0 ) * pow( $cosPhi_os, 5.0 ) * ( 5.0 - 18.0 * $tan2Phi + $tan4Phi + 14.0 * $eta2 - 58.0 * $tan2Phi * $eta2 );

        $northing = $i_term + $ii_term * $p2 + $iii_term * $p4 + $iiia_term * $p6;
        $easting  = self::TM_E0 + $iv_term * $p_diff + $v_term * $p3 + $vi_term * $p5;

        return [
            'easting'  => round( $easting, 2 ),
            'northing' => round( $northing, 2 ),
        ];
    }

    /**
     * Converts British National Grid Easting and Northing to a formatted National Grid Reference.
     *
     * @param float $easting Metres Easting
     * @param float $northing Metres Northing
     * @param int $digits 6 for 'NT 249 398' or 8 for 'NT 2491 3984'
     * @param bool $spaces Whether to separate components with spaces
     * @return string
     */
    public function toGridReference( float $easting, float $northing, int $digits = 6, bool $spaces = true ): string {
        if ( 6 !== $digits && 8 !== $digits && 10 !== $digits ) {
            $digits = 6;
        }

        $e = (int) floor( $easting );
        $n = (int) floor( $northing );

        if ( $e < 0 || $e > 700000 || $n < 0 || $n > 1300000 ) {
            return '';
        }

        // Determine 500km and 100km square letters
        $col500 = (int) floor( $e / 500000 );
        $row500 = (int) floor( $n / 500000 );

        // 500km square index (0 to 24, where S is (0,0), T is (1,0), N is (0,1), H is (0,2))
        $colIdx1 = $col500 + 2;
        $rowIdx1 = 3 - $row500;
        $idx1    = $rowIdx1 * 5 + $colIdx1;

        $col100 = (int) floor( ( $e % 500000 ) / 100000 );
        $row100 = (int) floor( ( $n % 500000 ) / 100000 );
        $colIdx2 = $col100;
        $rowIdx2 = 4 - $row100;
        $idx2    = $rowIdx2 * 5 + $colIdx2;

        $letters = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'; // 25 letters, skipping 'I'

        if ( $idx1 < 0 || $idx1 >= 25 || $idx2 < 0 || $idx2 >= 25 ) {
            return '';
        }

        $c1 = $letters[ $idx1 ];
        $c2 = $letters[ $idx2 ];
        $square = $c1 . $c2;

        $remE = $e % 100000;
        $remN = $n % 100000;

        $halfDigits = (int) ( $digits / 2 );
        $divisor    = (int) pow( 10, 5 - $halfDigits );

        $ePart = str_pad( (string) (int) floor( $remE / $divisor ), $halfDigits, '0', STR_PAD_LEFT );
        $nPart = str_pad( (string) (int) floor( $remN / $divisor ), $halfDigits, '0', STR_PAD_LEFT );

        if ( $spaces ) {
            return "{$square} {$ePart} {$nPart}";
        }

        return "{$square}{$ePart}{$nPart}";
    }

    /**
     * Parses a standard National Grid Reference (e.g. 'NT 249 398', 'NT249398', 'NT 2491 3984') into Easting and Northing.
     *
     * @param string $gridRef
     * @return array{easting: float, northing: float, square: string}
     */
    public function fromGridReference( string $gridRef ): array {
        $clean = strtoupper( preg_replace( '/\s+/', '', $gridRef ) ?: '' );

        if ( ! preg_match( '/^([A-Z]{2})([0-9]{2,10})$/', $clean, $matches ) ) {
            throw new InvalidArgumentException( "Invalid National Grid Reference format: '{$gridRef}'" );
        }

        $square  = $matches[1];
        $numbers = $matches[2];
        $len     = strlen( $numbers );

        if ( 0 !== $len % 2 ) {
            throw new InvalidArgumentException( "Grid Reference digits must be even in length: '{$gridRef}'" );
        }

        $halfLen = (int) ( $len / 2 );
        $eStr    = substr( $numbers, 0, $halfLen );
        $nStr    = substr( $numbers, $halfLen );

        // Normalise to 5 digits (metres within 100km square)
        $eLocal = (int) str_pad( $eStr, 5, '0', STR_PAD_RIGHT );
        $nLocal = (int) str_pad( $nStr, 5, '0', STR_PAD_RIGHT );

        $origin = $this->getSquareOrigin( $square );

        return [
            'easting'  => (float) ( $origin[0] + $eLocal ),
            'northing' => (float) ( $origin[1] + $nLocal ),
            'square'   => $square,
        ];
    }

    /**
     * Calculates grid distance, grid bearing (0..359°), and magnetic bearing between two points.
     *
     * @param float $e1 Easting of origin
     * @param float $n1 Northing of origin
     * @param float $e2 Easting of destination
     * @param float $n2 Northing of destination
     * @return array{grid_bearing: int, magnetic_bearing: int, distance_m: float}
     */
    public function calculateBearing( float $e1, float $n1, float $e2, float $n2 ): array {
        $dx = $e2 - $e1;
        $dy = $n2 - $n1;
        $dist = sqrt( $dx * $dx + $dy * $dy );

        if ( $dist < 0.0001 ) {
            return [
                'grid_bearing'     => 0,
                'magnetic_bearing' => 0,
                'distance_m'       => 0.0,
            ];
        }

        $rad2deg = 180.0 / M_PI;
        $theta = atan2( $dx, $dy ) * $rad2deg;
        $gridBearing = ( (int) round( $theta ) + 360 ) % 360;

        // Grid Magnetic Angle (GMA) in Scotland/Northern England currently averages approx 1.5° West
        // Magnetic = (Grid - GMA) -> For West variation: Magnetic Bearing is approximately Grid + 1° to 2°
        // or Grid Bearing minus (-1.5°) = Grid + 1.5°
        $gma = 1.5;
        $magBearing = ( (int) round( $gridBearing + $gma ) + 360 ) % 360;

        return [
            'grid_bearing'     => $gridBearing,
            'magnetic_bearing' => $magBearing,
            'distance_m'       => round( $dist, 1 ),
        ];
    }

    /**
     * Helper to resolve the National Grid false origin in metres for a 100km square.
     *
     * @return array{0: int, 1: int} [Easting, Northing]
     */
    public function getSquareOrigin( string $square ): array {
        $square = strtoupper( $square );
        if ( 2 !== strlen( $square ) ) {
            throw new InvalidArgumentException( "Invalid grid square: {$square}" );
        }

        $c1 = $square[0];
        $c2 = $square[1];

        $valid500 = 'HNSTO';
        $letters  = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';

        if ( false === strpos( $valid500, $c1 ) || false === strpos( $letters, $c2 ) ) {
            throw new InvalidArgumentException( "Invalid OS National Grid square: {$square}" );
        }

        $idx1 = strpos( $letters, $c1 );
        $idx2 = strpos( $letters, $c2 );

        $col500 = ( $idx1 % 5 ) - 2;
        $row500 = 3 - intdiv( $idx1, 5 );

        $col100 = $idx2 % 5;
        $row100 = 4 - intdiv( $idx2, 5 );

        $e = $col500 * 500000 + $col100 * 100000;
        $n = $row500 * 500000 + $row100 * 100000;

        return [ $e, $n ];
    }
}
