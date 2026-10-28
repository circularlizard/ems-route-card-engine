<?php
/**
 * Tests for Terrain_Tile_Compiler.
 */

declare(strict_types=1);

namespace EMSRoute\Tests\Unit;

use EMSRoute\Tests\TestCase;
use EMSRoute\Core\DEM\Terrain_Tile_Compiler;
use InvalidArgumentException;
use RuntimeException;
use ZipArchive;

class TerrainTileCompilerTest extends TestCase {
    private string $tempDir;
    private Terrain_Tile_Compiler $compiler;

    protected function setUp(): void {
        parent::setUp();
        $this->compiler = new Terrain_Tile_Compiler();
        $this->tempDir  = sys_get_temp_dir() . '/ems_dem_test_' . bin2hex( random_bytes( 4 ) );
        mkdir( $this->tempDir, 0755, true );
    }

    protected function tearDown(): void {
        $this->deleteRecursive( $this->tempDir );
        parent::tearDown();
    }

    public function test_get_square_origin_calculates_correct_coordinates(): void {
        $this->assertSame( [ 300000, 600000 ], $this->compiler->getSquareOrigin( 'NT' ) );
        $this->assertSame( [ 200000, 700000 ], $this->compiler->getSquareOrigin( 'NN' ) );
        $this->assertSame( [ 300000, 500000 ], $this->compiler->getSquareOrigin( 'NY' ) );
        $this->assertSame( [ 200000, 600000 ], $this->compiler->getSquareOrigin( 'NS' ) );
        $this->assertSame( [ 500000, 100000 ], $this->compiler->getSquareOrigin( 'TQ' ) );
    }

    public function test_get_square_origin_throws_on_invalid_square(): void {
        $this->expectException( InvalidArgumentException::class );
        $this->compiler->getSquareOrigin( 'ZZ' ); // 'Z' is not in standard OSGB grid
    }

    public function test_compile_square_throws_on_invalid_square_name(): void {
        $this->expectException( InvalidArgumentException::class );
        $this->compiler->compileSquare( $this->tempDir, 'INVALID', $this->tempDir . '/out.bin' );
    }

    public function test_compile_square_throws_when_no_tiles_exist(): void {
        $squareDir = $this->tempDir . '/nt';
        mkdir( $squareDir );

        $this->expectException( RuntimeException::class );
        $this->expectExceptionMessage( 'No OS Terrain 50 tile archives' );
        $this->compiler->compileSquare( $this->tempDir, 'NT', $this->tempDir . '/out.bin' );
    }

    public function test_compiles_mock_ascii_tile_into_valid_binary_tile(): void {
        $squareDir = $this->tempDir . '/nt';
        mkdir( $squareDir );

        // Create a mock 10km tile for NT27
        // In NT27: tileCol = 2, tileRow = 7
        // Header: ncols 200, nrows 200, xllcorner 320000, yllcorner 670000, cellsize 50
        $ascContent = "ncols 200\n" .
                      "nrows 200\n" .
                      "xllcorner 320000\n" .
                      "yllcorner 670000\n" .
                      "cellsize 50\n";

        // Build 200 rows of 200 values
        // Let's put a peak of 245.1m at ASCII row 140, col 150
        for ( $r = 0; $r < 200; $r++ ) {
            $rowVals = [];
            for ( $c = 0; $c < 200; $c++ ) {
                if ( 140 === $r && 150 === $c ) {
                    $rowVals[] = '245.1';
                } else {
                    $rowVals[] = '10.0';
                }
            }
            $ascContent .= implode( ' ', $rowVals ) . "\n";
        }

        // Pack it into a mock zip: nt27_OST50GRID_20260529.zip containing NT27.asc
        $zipPath = $squareDir . '/nt27_OST50GRID_20260529.zip';
        $zip     = new ZipArchive();
        $this->assertTrue( $zip->open( $zipPath, ZipArchive::CREATE ) );
        $zip->addFromString( 'NT27.asc', $ascContent );
        $zip->close();

        $outputBin = $this->tempDir . '/NT.bin';
        $stats     = $this->compiler->compileSquare( $this->tempDir, 'NT', $outputBin );

        // 1. Assert exact 8,000,000 bytes
        $this->assertSame( 8000000, $stats['file_size'] );
        $this->assertSame( 8000000, filesize( $outputBin ) );
        $this->assertSame( 1, $stats['tiles_found'] );
        $this->assertEqualsWithDelta( 245.1, $stats['max_elevation_m'], 0.1 );

        // 2. Read back the peak point
        // Local row in ASCII is 140 -> local row from south is (199 - 140) = 59
        // Grid col = 2 * 200 + 150 = 550
        // Grid row = 7 * 200 + 59 = 1459
        // Easting relative to NT origin: 550 * 50 = 27500
        // Northing relative to NT origin: 1459 * 50 = 72950
        $peakEle = $this->compiler->readPoint( $outputBin, 27500, 72950 );
        $this->assertEqualsWithDelta( 245.1, $peakEle, 0.1 );

        // 3. Read an un-populated point (missing tile) - should be 0.0m (sea level)
        $seaEle = $this->compiler->readPoint( $outputBin, 500, 500 );
        $this->assertEqualsWithDelta( 0.0, $seaEle, 0.01 );
    }

    private function deleteRecursive( string $dir ): void {
        if ( ! is_dir( $dir ) ) {
            return;
        }
        $items = scandir( $dir ) ?: [];
        foreach ( $items as $item ) {
            if ( '.' === $item || '..' === $item ) {
                continue;
            }
            $path = $dir . '/' . $item;
            is_dir( $path ) ? $this->deleteRecursive( $path ) : unlink( $path );
        }
        rmdir( $dir );
    }
}
