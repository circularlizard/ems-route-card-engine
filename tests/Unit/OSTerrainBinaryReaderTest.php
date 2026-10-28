<?php
/**
 * Tests for OS_Terrain_Binary_Reader.
 */

declare(strict_types=1);

namespace EMSRoute\Tests\Unit;

use EMSRoute\Tests\TestCase;
use EMSRoute\Core\DEM\OS_Terrain_Binary_Reader;
use EMSRoute\Core\DEM\Terrain_Tile_Compiler;

class OSTerrainBinaryReaderTest extends TestCase {
    private string $tempDir;
    private OS_Terrain_Binary_Reader $reader;

    protected function setUp(): void {
        parent::setUp();
        $this->tempDir = sys_get_temp_dir() . '/ems_reader_test_' . bin2hex( random_bytes( 4 ) );
        mkdir( $this->tempDir, 0755, true );

        // Create an 8MB dummy tile for NT with a peak at node (550, 1459) of 245.1m (2451 decimetres)
        $ntBin = $this->tempDir . '/NT.bin';
        $fp = fopen( $ntBin, 'w+b' );
        $chunk = str_repeat( "\x00", 65536 );
        for ( $i = 0; $i < 122; $i++ ) {
            fwrite( $fp, $chunk );
        }
        fwrite( $fp, str_repeat( "\x00", 8000000 - ( 122 * 65536 ) ) );

        // Write 2451 decimetres at node row=1459, col=550
        $offset = ( 1459 * 2000 + 550 ) * 2;
        fseek( $fp, $offset, SEEK_SET );
        fwrite( $fp, pack( 'v', 2451 ) );
        fclose( $fp );

        $this->reader = new OS_Terrain_Binary_Reader( $this->tempDir );
    }

    protected function tearDown(): void {
        $this->reader->closeAllHandles();
        $this->deleteRecursive( $this->tempDir );
        parent::tearDown();
    }

    public function test_get_square_from_coordinates(): void {
        // (327500, 672950) -> NT
        $this->assertSame( 'NT', $this->reader->getSquareFromCoordinates( 327500, 672950 ) );
        // (216650, 771250) -> NN
        $this->assertSame( 'NN', $this->reader->getSquareFromCoordinates( 216650, 771250 ) );
        // (321500, 507200) -> NY
        $this->assertSame( 'NY', $this->reader->getSquareFromCoordinates( 321500, 507200 ) );
    }

    public function test_read_discrete_node_elevation(): void {
        $ele = $this->reader->readNodeElevation( 'NT', 550, 1459 );
        $this->assertEqualsWithDelta( 245.1, $ele, 0.05 );

        // Read unpopulated node (0.0m)
        $zeroEle = $this->reader->readNodeElevation( 'NT', 0, 0 );
        $this->assertEqualsWithDelta( 0.0, $zeroEle, 0.01 );

        // Out of bounds node
        $this->assertNull( $this->reader->readNodeElevation( 'NT', 2001, 10 ) );
    }

    public function test_get_elevation_exact_and_interpolated(): void {
        // NT origin is (300000, 600000)
        // Col 550 corresponds to relative E = 550 * 50 = 27500 -> absolute E = 327500
        // Row 1459 corresponds to relative N = 1459 * 50 = 72950 -> absolute N = 672950
        $exactEle = $this->reader->getElevation( 327500.0, 672950.0, false );
        $this->assertEqualsWithDelta( 245.1, $exactEle, 0.05 );

        // Bilinear interpolation halfway to neighbouring 0m node
        $interpEle = $this->reader->getElevation( 327525.0, 672950.0, true );
        $this->assertNotNull( $interpEle );
        $this->assertLessThan( 245.1, $interpEle );
        $this->assertGreaterThan( 0.0, $interpEle );
    }

    public function test_returns_null_for_missing_tile(): void {
        $ele = $this->reader->getElevation( 216650.0, 771250.0 ); // NN is not in this tempDir
        $this->assertNull( $ele );
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
