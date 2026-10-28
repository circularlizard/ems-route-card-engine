<?php
/**
 * OS Terrain 50 Binary Reader.
 *
 * Provides ultra-fast O(1) random-access elevation queries from pre-compiled
 * 8,000,000-byte binary tiles (int16_le, decimetres) with bilinear interpolation.
 */

declare(strict_types=1);

namespace EMSRoute\Core\DEM;

use InvalidArgumentException;
use RuntimeException;

class OS_Terrain_Binary_Reader {
    public const GRID_DIMENSION   = 2000;
    public const CELL_SIZE_METRES = 50;

    private string $storageDir;

    /**
     * Cache of open file handles keyed by square code.
     *
     * @var array<string, resource>
     */
    private array $openHandles = [];

    public function __construct( ?string $customStorageDir = null ) {
        if ( null !== $customStorageDir ) {
            $this->storageDir = rtrim( $customStorageDir, '/' );
        } elseif ( defined( 'DOFE_DEM_DATA_DIR' ) ) {
            $this->storageDir = rtrim( constant( 'DOFE_DEM_DATA_DIR' ), '/' );
        } elseif ( defined( 'WP_CONTENT_DIR' ) ) {
            $this->storageDir = rtrim( constant( 'WP_CONTENT_DIR' ), '/' ) . '/dofe-dem-data';
        } else {
            $wpEnvPath = dirname( __DIR__, 4 ) . '/wordpress-env/wordpress/wp-content/dofe-dem-data';
            $this->storageDir = is_dir( dirname( $wpEnvPath ) ) ? $wpEnvPath : ( dirname( __DIR__, 3 ) . '/dem-data' );
        }
    }

    public function __destruct() {
        $this->closeAllHandles();
    }

    public function closeAllHandles(): void {
        foreach ( $this->openHandles as $fp ) {
            if ( is_resource( $fp ) ) {
                fclose( $fp );
            }
        }
        $this->openHandles = [];
    }

    /**
     * Queries elevation in metres at National Grid Easting and Northing.
     *
     * @param float $easting British National Grid Easting in metres
     * @param float $northing British National Grid Northing in metres
     * @param bool $interpolate Whether to use 4-point bilinear interpolation
     * @return float|null Elevation in metres, or null if tile is missing
     */
    public function getElevation( float $easting, float $northing, bool $interpolate = true ): ?float {
        $square = $this->getSquareFromCoordinates( $easting, $northing );
        if ( null === $square ) {
            return null;
        }

        $origin = $this->getSquareOrigin( $square );
        if ( null === $origin ) {
            return null;
        }

        $relE = $easting - $origin[0];
        $relN = $northing - $origin[1];

        // Bounds check inside the 100km square
        if ( $relE < 0 || $relE >= 100000 || $relN < 0 || $relN >= 100000 ) {
            return null;
        }

        if ( ! $interpolate ) {
            $col = min( (int) round( $relE / self::CELL_SIZE_METRES ), self::GRID_DIMENSION - 1 );
            $row = min( (int) round( $relN / self::CELL_SIZE_METRES ), self::GRID_DIMENSION - 1 );
            return $this->readNodeElevation( $square, $col, $row );
        }

        // 4-point bilinear interpolation
        $col0 = min( (int) floor( $relE / self::CELL_SIZE_METRES ), self::GRID_DIMENSION - 1 );
        $row0 = min( (int) floor( $relN / self::CELL_SIZE_METRES ), self::GRID_DIMENSION - 1 );
        $col1 = min( $col0 + 1, self::GRID_DIMENSION - 1 );
        $row1 = min( $row0 + 1, self::GRID_DIMENSION - 1 );

        $dx = ( $col0 === $col1 ) ? 0.0 : min( 1.0, max( 0.0, ( $relE - $col0 * self::CELL_SIZE_METRES ) / (float) self::CELL_SIZE_METRES ) );
        $dy = ( $row0 === $row1 ) ? 0.0 : min( 1.0, max( 0.0, ( $relN - $row0 * self::CELL_SIZE_METRES ) / (float) self::CELL_SIZE_METRES ) );

        $z00 = $this->readNodeElevation( $square, $col0, $row0 );
        $z10 = $this->readNodeElevation( $square, $col1, $row0 );
        $z01 = $this->readNodeElevation( $square, $col0, $row1 );
        $z11 = $this->readNodeElevation( $square, $col1, $row1 );

        if ( null === $z00 || null === $z10 || null === $z01 || null === $z11 ) {
            return $z00; // Fallback if near border of missing tile
        }

        $interpolated = ( 1.0 - $dx ) * ( 1.0 - $dy ) * $z00
                      + $dx * ( 1.0 - $dy ) * $z10
                      + ( 1.0 - $dx ) * $dy * $z01
                      + $dx * $dy * $z11;

        return round( $interpolated, 1 );
    }

    /**
     * Reads elevation at a discrete grid node (col: 0..1999, row: 0..1999) from the binary file.
     *
     * @param string $square 2-letter uppercase square
     * @param int $col Column index (0..1999)
     * @param int $row Row index (0..1999)
     * @return float|null Elevation in metres, or null if file missing
     */
    public function readNodeElevation( string $square, int $col, int $row ): ?float {
        if ( $col < 0 || $col >= self::GRID_DIMENSION || $row < 0 || $row >= self::GRID_DIMENSION ) {
            return null;
        }

        $fp = $this->getFileHandle( $square );
        if ( null === $fp ) {
            return null;
        }

        $byteOffset = ( $row * self::GRID_DIMENSION + $col ) * 2;
        if ( 0 !== fseek( $fp, $byteOffset, SEEK_SET ) ) {
            return null;
        }

        $bytes = fread( $fp, 2 );
        if ( 2 !== strlen( $bytes ) ) {
            return null;
        }

        $unpacked = unpack( 'v', $bytes );
        $val      = (int) ( $unpacked[1] ?? 0 );
        if ( $val >= 32768 ) {
            $val -= 65536;
        }

        return $val / 10.0;
    }

    /**
     * Resolves and returns a cached file handle for the specified square.
     *
     * @return resource|null
     */
    private function getFileHandle( string $square ) {
        $square = strtoupper( $square );
        if ( isset( $this->openHandles[ $square ] ) ) {
            return $this->openHandles[ $square ];
        }

        $filePath = $this->storageDir . '/' . $square . '.bin';
        if ( ! file_exists( $filePath ) ) {
            return null;
        }

        $fp = fopen( $filePath, 'rb' );
        if ( ! $fp ) {
            return null;
        }

        $this->openHandles[ $square ] = $fp;
        return $fp;
    }

    /**
     * Resolves the 2-letter OS Grid square for a given Easting and Northing.
     */
    public function getSquareFromCoordinates( float $easting, float $northing ): ?string {
        $e = (int) floor( $easting );
        $n = (int) floor( $northing );

        if ( $e < 0 || $e > 700000 || $n < 0 || $n > 1300000 ) {
            return null;
        }

        $col500 = (int) floor( $e / 500000 );
        $row500 = (int) floor( $n / 500000 );

        $colIdx1 = $col500 + 2;
        $rowIdx1 = 3 - $row500;
        $idx1    = $rowIdx1 * 5 + $colIdx1;

        $col100  = (int) floor( ( $e % 500000 ) / 100000 );
        $row100  = (int) floor( ( $n % 500000 ) / 100000 );
        $colIdx2 = $col100;
        $rowIdx2 = 4 - $row100;
        $idx2    = $rowIdx2 * 5 + $colIdx2;

        $letters = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';

        if ( $idx1 < 0 || $idx1 >= 25 || $idx2 < 0 || $idx2 >= 25 ) {
            return null;
        }

        return $letters[ $idx1 ] . $letters[ $idx2 ];
    }

    /**
     * Helper to get square origin coordinates.
     *
     * @return array{0: int, 1: int}|null
     */
    public function getSquareOrigin( string $square ): ?array {
        $square = strtoupper( $square );
        if ( 2 !== strlen( $square ) ) {
            return null;
        }

        $c1 = $square[0];
        $c2 = $square[1];

        $valid500 = 'HNSTO';
        $letters  = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';

        if ( false === strpos( $valid500, $c1 ) || false === strpos( $letters, $c2 ) ) {
            return null;
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
