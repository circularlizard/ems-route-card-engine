<?php
/**
 * OS Terrain 50 Binary Tile Compiler.
 *
 * Compiles OS Terrain 50 ASCII Grid files (.asc or zipped .asc) for a 100km OS Grid square
 * into a single headerless row-major binary file (int16_le, decimetres, 8,000,000 bytes).
 */

declare(strict_types=1);

namespace EMSRoute\Core\DEM;

use RuntimeException;
use InvalidArgumentException;
use ZipArchive;

class Terrain_Tile_Compiler {
    public const EXPECTED_FILE_SIZE = 8000000; // 2000 x 2000 x 2 bytes
    public const GRID_DIMENSION     = 2000;    // 2000 x 2000 points
    public const TILE_DIMENSION     = 200;     // 200 x 200 points per 10km tile
    public const TILE_COUNT_AXIS    = 10;      // 10 x 10 tiles per 100km square
    public const CELL_SIZE_METRES   = 50;

    /**
     * Known UK mountain benchmarks for verification.
     * Coordinates in National Grid Easting/Northing (metres).
     *
     * @var array<string, array{name: string, easting: int, northing: int, expected_ele: float, tolerance: float}>
     */
    public const BENCHMARKS = [
        'NT' => [
            'name'         => "Arthur's Seat (Edinburgh)",
            'easting'      => 327500,
            'northing'     => 672900,
            'expected_ele' => 245.0, // Discrete 50m cell sample ~245m, interpolated ~251m
            'tolerance'    => 10.0,
        ],
        'NN' => [
            'name'         => 'Ben Nevis Summit',
            'easting'      => 216650,
            'northing'     => 771250,
            'expected_ele' => 1345.0,
            'tolerance'    => 5.0,
        ],
        'NY' => [
            'name'         => 'Scafell Pike Summit',
            'easting'      => 321500,
            'northing'     => 507200,
            'expected_ele' => 970.0,
            'tolerance'    => 15.0,
        ],
        'NS' => [
            'name'         => 'Cairn Table (Muirkirk)',
            'easting'      => 272400,
            'northing'     => 630500,
            'expected_ele' => 590.0,
            'tolerance'    => 15.0,
        ],
    ];

    /**
     * Compiles a single 100km square from source directory into destination binary tile.
     *
     * @param string $inputDir Path to root data dir (e.g. data/) or specific square dir (e.g. data/nt/).
     * @param string $square 2-letter uppercase square identifier (e.g. 'NT').
     * @param string $outputFilePath Full path to output binary file (e.g. /path/to/NT.bin).
     * @param callable|null $progressCallback Optional callback receiving (int $processed, int $total, string $tileName).
     * @return array{
     *     square: string,
     *     output_file: string,
     *     tiles_found: int,
     *     min_elevation_m: float,
     *     max_elevation_m: float,
     *     file_size: int,
     *     md5: string,
     *     duration_s: float
     * }
     */
    public function compileSquare(
        string $inputDir,
        string $square,
        string $outputFilePath,
        ?callable $progressCallback = null
    ): array {
        $startTime = microtime( true );
        $square    = strtoupper( trim( $square ) );

        if ( 2 !== strlen( $square ) || ! ctype_alpha( $square ) ) {
            throw new InvalidArgumentException( "Invalid OS Grid square code: '{$square}'. Must be 2 letters." );
        }

        $squareDir = $this->resolveSquareDirectory( $inputDir, $square );
        if ( ! is_dir( $squareDir ) ) {
            throw new RuntimeException( "Source directory for square '{$square}' not found in '{$inputDir}'." );
        }

        // Ensure output parent directory exists
        $outputDir = dirname( $outputFilePath );
        if ( ! is_dir( $outputDir ) && ! mkdir( $outputDir, 0755, true ) && ! is_dir( $outputDir ) ) {
            throw new RuntimeException( "Failed to create output directory: {$outputDir}" );
        }

        // Locate tile source files (either .zip or .asc)
        $tiles = $this->locateTiles( $squareDir, $square );
        if ( empty( $tiles ) ) {
            throw new RuntimeException( "No OS Terrain 50 tile archives (.zip) or grids (.asc) found in '{$squareDir}'." );
        }

        // Pre-allocate the 8,000,000-byte output file filled with 0 (sea level / missing tiles)
        $tmpOutputFile = $outputFilePath . '.tmp.' . bin2hex( random_bytes( 4 ) );
        $outHandle     = fopen( $tmpOutputFile, 'w+b' );
        if ( ! $outHandle ) {
            throw new RuntimeException( "Cannot open destination file for writing: {$tmpOutputFile}" );
        }

        // Zero-fill in 64KB chunks (8,000,000 bytes total)
        $zeroChunk = str_repeat( "\x00", 65536 );
        $remaining = self::EXPECTED_FILE_SIZE;
        while ( $remaining > 0 ) {
            $writeSize = min( $remaining, 65536 );
            fwrite( $outHandle, $zeroChunk, $writeSize );
            $remaining -= $writeSize;
        }

        $minElevationM = 99999.0;
        $maxElevationM = -99999.0;
        $totalTiles    = count( $tiles );
        $processed     = 0;

        foreach ( $tiles as $tileCoord => $tileSource ) {
            $coordStr = sprintf( '%02d', (int) $tileCoord );
            $colDigit = (int) $coordStr[0];
            $rowDigit = (int) $coordStr[1];

            $tileStats = $this->ingestTile( $outHandle, $tileSource, $square, $colDigit, $rowDigit );

            if ( $tileStats['min_ele'] < $minElevationM ) {
                $minElevationM = $tileStats['min_ele'];
            }
            if ( $tileStats['max_ele'] > $maxElevationM ) {
                $maxElevationM = $tileStats['max_ele'];
            }

            $processed++;
            if ( null !== $progressCallback ) {
                $progressCallback( $processed, $totalTiles, $square . $tileCoord );
            }
        }

        fclose( $outHandle );

        // Verify exact file size
        $finalSize = filesize( $tmpOutputFile );
        if ( self::EXPECTED_FILE_SIZE !== $finalSize ) {
            unlink( $tmpOutputFile );
            throw new RuntimeException(
                "Compiled tile size mismatch: expected " . self::EXPECTED_FILE_SIZE . " bytes, got {$finalSize} bytes."
            );
        }

        // Rename atomically to final path
        if ( ! rename( $tmpOutputFile, $outputFilePath ) ) {
            unlink( $tmpOutputFile );
            throw new RuntimeException( "Failed to move temporary file to target path: {$outputFilePath}" );
        }

        $duration = round( microtime( true ) - $startTime, 3 );
        $md5      = md5_file( $outputFilePath ) ?: '';

        return [
            'square'          => $square,
            'output_file'     => $outputFilePath,
            'tiles_found'     => $processed,
            'min_elevation_m' => ( $minElevationM < 99999.0 ) ? $minElevationM : 0.0,
            'max_elevation_m' => ( $maxElevationM > -99999.0 ) ? $maxElevationM : 0.0,
            'file_size'       => $finalSize,
            'md5'             => $md5,
            'duration_s'      => $duration,
        ];
    }

    /**
     * Reads a single elevation point directly from compiled binary tile.
     *
     * @param string $binaryFilePath Path to compiled .bin tile.
     * @param int $relativeEasting Metres from West edge of 100km square (0..99950).
     * @param int $relativeNorthing Metres from South edge of 100km square (0..99950).
     * @return float Elevation in metres.
     */
    public function readPoint( string $binaryFilePath, int $relativeEasting, int $relativeNorthing ): float {
        if ( ! file_exists( $binaryFilePath ) ) {
            throw new RuntimeException( "Binary tile not found: {$binaryFilePath}" );
        }

        $col = (int) floor( $relativeEasting / self::CELL_SIZE_METRES );
        $row = (int) floor( $relativeNorthing / self::CELL_SIZE_METRES );

        if ( $col < 0 || $col >= self::GRID_DIMENSION || $row < 0 || $row >= self::GRID_DIMENSION ) {
            throw new InvalidArgumentException( "Coordinates outside 100km square bounds: E={$relativeEasting}, N={$relativeNorthing}" );
        }

        $byteOffset = ( $row * self::GRID_DIMENSION + $col ) * 2;

        $fp = fopen( $binaryFilePath, 'rb' );
        if ( ! $fp ) {
            throw new RuntimeException( "Cannot open binary tile: {$binaryFilePath}" );
        }

        fseek( $fp, $byteOffset, SEEK_SET );
        $bytes = fread( $fp, 2 );
        fclose( $fp );

        if ( 2 !== strlen( $bytes ) ) {
            throw new RuntimeException( "Failed to read 2 bytes at offset {$byteOffset}" );
        }

        // Unpack unsigned 16-bit little-endian and convert to signed 16-bit
        $unpacked = unpack( 'v', $bytes );
        $val      = (int) ( $unpacked[1] ?? 0 );
        if ( $val >= 32768 ) {
            $val -= 65536;
        }

        return $val / 10.0;
    }

    /**
     * Verifies a compiled binary tile against known benchmarks.
     *
     * @param string $binaryFilePath Path to compiled .bin tile.
     * @param string $square 2-letter square code.
     * @return array{
     *     passed: bool,
     *     benchmark_name: string,
     *     expected_m: float,
     *     observed_m: float,
     *     difference_m: float,
     *     tolerance_m: float,
     *     message: string
     * }|null
     */
    public function verifyBenchmark( string $binaryFilePath, string $square ): ?array {
        $square = strtoupper( $square );
        if ( ! isset( self::BENCHMARKS[ $square ] ) ) {
            return null;
        }

        $bm     = self::BENCHMARKS[ $square ];
        $origin = $this->getSquareOrigin( $square );

        $relE = $bm['easting'] - $origin[0];
        $relN = $bm['northing'] - $origin[1];

        $observedEle = $this->readPoint( $binaryFilePath, $relE, $relN );
        $diff        = abs( $observedEle - $bm['expected_ele'] );
        $passed      = $diff <= $bm['tolerance'];

        return [
            'passed'         => $passed,
            'benchmark_name' => $bm['name'],
            'expected_m'     => $bm['expected_ele'],
            'observed_m'     => $observedEle,
            'difference_m'   => round( $diff, 2 ),
            'tolerance_m'    => $bm['tolerance'],
            'message'        => $passed
                ? sprintf( 'Benchmark %s: %.1fm (expected ~%.1fm, diff %.1fm within +/-%.1fm)', $bm['name'], $observedEle, $bm['expected_ele'], $diff, $bm['tolerance'] )
                : sprintf( 'Benchmark %s FAILED: %.1fm (expected ~%.1fm, diff %.1fm exceeded +/-%.1fm)', $bm['name'], $observedEle, $bm['expected_ele'], $diff, $bm['tolerance'] ),
        ];
    }

    /**
     * Returns the National Grid false origin (Easting, Northing) in metres for a 100km square.
     *
     * @param string $square 2-letter uppercase square identifier.
     * @return array{0: int, 1: int} [Easting, Northing]
     */
    public function getSquareOrigin( string $square ): array {
        $square = strtoupper( $square );
        if ( 2 !== strlen( $square ) ) {
            throw new InvalidArgumentException( "Invalid grid square: {$square}. Must be 2 letters." );
        }

        $c1 = $square[0];
        $c2 = $square[1];

        $valid500 = 'HNSTO';
        $letters  = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'; // 25 letters (no 'I')

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

    /**
     * Ingests a single 10km tile (.zip or .asc) into the destination binary file handle.
     *
     * @param resource $outHandle
     * @param array{type: string, path: string, internal_file?: string} $tileSource
     * @param string $square
     * @param int $tileCol 0..9
     * @param int $tileRow 0..9
     * @return array{min_ele: float, max_ele: float}
     */
    private function ingestTile(
        $outHandle,
        array $tileSource,
        string $square,
        int $tileCol,
        int $tileRow
    ): array {
        $stream = null;
        $zip    = null;

        if ( 'zip' === $tileSource['type'] ) {
            $zip = new ZipArchive();
            if ( true !== $zip->open( $tileSource['path'] ) ) {
                throw new RuntimeException( "Cannot open zip archive: {$tileSource['path']}" );
            }
            $stream = $zip->getStream( $tileSource['internal_file'] );
            if ( ! $stream ) {
                $zip->close();
                throw new RuntimeException( "Cannot find '{$tileSource['internal_file']}' inside {$tileSource['path']}" );
            }
        } else {
            $stream = fopen( $tileSource['path'], 'r' );
            if ( ! $stream ) {
                throw new RuntimeException( "Cannot open ASCII tile: {$tileSource['path']}" );
            }
        }

        // Parse ESRI header (ncols, nrows, xllcorner, yllcorner, cellsize, optional NODATA_value)
        // Consume header lines that begin with text keywords; capture the first numeric line as row 0
        $firstDataRowLine = null;
        for ( $h = 0; $h < 10; $h++ ) {
            $line = fgets( $stream );
            if ( false === $line ) {
                break;
            }
            $trimmed = trim( $line );
            if ( '' === $trimmed ) {
                continue;
            }
            if ( preg_match( '/^[a-z_]+/i', $trimmed ) ) {
                continue; // Header keyword (e.g. ncols, nrows, xllcorner, yllcorner, cellsize, NODATA_value)
            }
            // First row of numbers encountered
            $firstDataRowLine = $line;
            break;
        }

        $minEle = 99999.0;
        $maxEle = -99999.0;

        // In standard ESRI ASCII grids:
        // Row 0 is the northern-most row (y = 199 from South)
        // Row 199 is the southern-most row (y = 0 from South)
        for ( $asciiRow = 0; $asciiRow < self::TILE_DIMENSION; $asciiRow++ ) {
            $rowLine = ( 0 === $asciiRow && null !== $firstDataRowLine ) ? $firstDataRowLine : fgets( $stream );
            if ( false === $rowLine ) {
                break;
            }

            $values = preg_split( '/\s+/', trim( $rowLine ) );
            if ( ! is_array( $values ) || count( $values ) < self::TILE_DIMENSION ) {
                continue;
            }

            // Invert row: North row 0 maps to local south index 199
            $localRowFromSouth = ( self::TILE_DIMENSION - 1 ) - $asciiRow;
            $gridRow           = $tileRow * self::TILE_DIMENSION + $localRowFromSouth;
            $startGridCol      = $tileCol * self::TILE_DIMENSION;

            $packedUnsigned = [];
            for ( $c = 0; $c < self::TILE_DIMENSION; $c++ ) {
                $ele = (float) $values[ $c ];
                if ( $ele < -9000.0 ) {
                    $ele = 0.0; // Filter NODATA values to sea level
                }

                if ( $ele < $minEle ) {
                    $minEle = $ele;
                }
                if ( $ele > $maxEle ) {
                    $maxEle = $ele;
                }

                // Scale to decimetres (metres * 10)
                $decimetres = (int) round( $ele * 10 );
                if ( $decimetres < -32768 ) {
                    $decimetres = -32768;
                } elseif ( $decimetres > 32767 ) {
                    $decimetres = 32767;
                }

                // Two's complement unsigned representation for little-endian 'v'
                $packedUnsigned[] = ( $decimetres < 0 ) ? ( $decimetres + 65536 ) : $decimetres;
            }

            // Pack 200 signed 16-bit integers in little-endian format (400 bytes)
            $binaryChunk = pack( 'v*', ...$packedUnsigned );

            // Seek to offset in 2000x2000 binary tile
            $byteOffset = ( $gridRow * self::GRID_DIMENSION + $startGridCol ) * 2;
            fseek( $outHandle, $byteOffset, SEEK_SET );
            fwrite( $outHandle, $binaryChunk, 400 );
        }

        fclose( $stream );
        if ( null !== $zip ) {
            $zip->close();
        }

        return [
            'min_ele' => $minEle,
            'max_ele' => $maxEle,
        ];
    }

    /**
     * Resolves the directory containing tiles for the requested square.
     */
    private function resolveSquareDirectory( string $inputDir, string $square ): string {
        $cleanInput = rtrim( $inputDir, '/' );

        // Direct square path provided: data/nt or data/NT
        if ( strtolower( basename( $cleanInput ) ) === strtolower( $square ) ) {
            return $cleanInput;
        }

        // Subdirectory check: data/nt or data/NT
        $lowerSub = $cleanInput . '/' . strtolower( $square );
        if ( is_dir( $lowerSub ) ) {
            return $lowerSub;
        }

        $upperSub = $cleanInput . '/' . strtoupper( $square );
        if ( is_dir( $upperSub ) ) {
            return $upperSub;
        }

        return $cleanInput;
    }

    /**
     * Locates all 10km tile archives (.zip) or grids (.asc) for a 100km square.
     *
     * @return array<string, array{type: string, path: string, internal_file?: string}> Map of '00'..'99' => source
     */
    private function locateTiles( string $squareDir, string $square ): array {
        $tiles = [];
        $files = scandir( $squareDir );
        if ( false === $files ) {
            return [];
        }

        $sqLower = strtolower( $square );
        $sqUpper = strtoupper( $square );

        foreach ( $files as $file ) {
            if ( '.' === $file || '..' === $file ) {
                continue;
            }

            $fullPath = $squareDir . '/' . $file;
            if ( ! is_file( $fullPath ) ) {
                continue;
            }

            // Match .zip archives (e.g. nt27_OST50GRID_20260529.zip or NT27.zip)
            if ( preg_match( '/^' . $sqLower . '([0-9]{2})/i', $file, $matches ) && str_ends_with( strtolower( $file ), '.zip' ) ) {
                $coord                = $matches[1];
                $internalAsc          = $sqUpper . $coord . '.asc';
                $tiles[ $coord ]      = [
                    'type'          => 'zip',
                    'path'          => $fullPath,
                    'internal_file' => $internalAsc,
                ];
                continue;
            }

            // Match raw .asc files (e.g. nt27.asc or NT27.asc)
            if ( preg_match( '/^' . $sqLower . '([0-9]{2})\.asc$/i', $file, $matches ) ) {
                $coord           = $matches[1];
                $tiles[ $coord ] = [
                    'type' => 'asc',
                    'path' => $fullPath,
                ];
            }
        }

        ksort( $tiles );
        return $tiles;
    }
}
