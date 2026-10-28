<?php
/**
 * Tests for DEM_Storage_Manager.
 */

declare(strict_types=1);

namespace EMSRoute\Tests\Unit;

use EMSRoute\Tests\TestCase;
use EMSRoute\Core\DEM\DEM_Storage_Manager;
use EMSRoute\Core\DEM\Terrain_Tile_Compiler;
use InvalidArgumentException;
use RuntimeException;
use ZipArchive;

class DEMStorageManagerTest extends TestCase {
    private string $tempStorageDir;
    private DEM_Storage_Manager $manager;

    protected function setUp(): void {
        parent::setUp();
        $this->tempStorageDir = sys_get_temp_dir() . '/ems_dem_storage_test_' . bin2hex( random_bytes( 4 ) );
        mkdir( $this->tempStorageDir, 0755, true );
        $this->manager = new DEM_Storage_Manager( $this->tempStorageDir );
    }

    protected function tearDown(): void {
        $this->deleteRecursive( $this->tempStorageDir );
        parent::tearDown();
    }

    public function test_ensure_directory_creates_dir_and_security_files(): void {
        $subDir = $this->tempStorageDir . '/nested/dofe-dem-data';
        $mgr    = new DEM_Storage_Manager( $subDir );

        $this->assertTrue( $mgr->ensureDirectory() );
        $this->assertFileExists( $subDir . '/index.php' );
        $this->assertFileExists( $subDir . '/.htaccess' );
    }

    public function test_list_tiles_returns_all_55_uk_squares(): void {
        $tiles = $this->manager->listTiles();

        $this->assertCount( 55, $tiles );
        $this->assertArrayHasKey( 'NT', $tiles );
        $this->assertArrayHasKey( 'NN', $tiles );
        $this->assertArrayHasKey( 'NY', $tiles );
        $this->assertArrayHasKey( 'TQ', $tiles );

        $this->assertFalse( $tiles['NT']['installed'] );
        $this->assertSame( 0, $tiles['NT']['file_size'] );
    }

    public function test_save_uploaded_bin_file_validates_size(): void {
        // Create an invalid size file (100 bytes)
        $invalidUpload = $this->tempStorageDir . '/invalid_upload.bin';
        file_put_contents( $invalidUpload, str_repeat( 'X', 100 ) );

        $this->expectException( RuntimeException::class );
        $this->expectExceptionMessage( 'Invalid binary DEM file size' );
        $this->manager->saveUploadedFile( $invalidUpload, 'NT.bin' );
    }

    public function test_save_uploaded_valid_bin_file(): void {
        // Create a valid 8MB dummy file
        $validUpload = $this->tempStorageDir . '/valid_upload.bin';
        $fp = fopen( $validUpload, 'wb' );
        $chunk = str_repeat( "\x00", 65536 );
        for ( $i = 0; $i < 122; $i++ ) {
            fwrite( $fp, $chunk );
        }
        fwrite( $fp, str_repeat( "\x00", 8000000 - ( 122 * 65536 ) ) );
        fclose( $fp );

        $this->assertSame( Terrain_Tile_Compiler::EXPECTED_FILE_SIZE, filesize( $validUpload ) );

        $result = $this->manager->saveUploadedFile( $validUpload, 'NT.bin' );
        $this->assertCount( 1, $result );
        $this->assertSame( 'NT', $result[0]['square'] );
        $this->assertTrue( $result[0]['installed'] );
        $this->assertTrue( $result[0]['is_valid_size'] );

        $tileInfo = $this->manager->getTileInfo( 'NT' );
        $this->assertTrue( $tileInfo['installed'] );
        $this->assertSame( 8000000, $tileInfo['file_size'] );

        // Delete tile
        $deleted = $this->manager->deleteTile( 'NT' );
        $this->assertTrue( $deleted );
        $this->assertFalse( $this->manager->getTileInfo( 'NT' )['installed'] );
    }

    public function test_save_uploaded_zip_file_extracts_tiles(): void {
        // Create a zip with NN.bin (8MB)
        $zipPath = $this->tempStorageDir . '/bundle.zip';
        $zip = new ZipArchive();
        $this->assertTrue( $zip->open( $zipPath, ZipArchive::CREATE ) );

        // 8MB empty binary tile
        $tileData = str_repeat( "\x00", 8000000 );
        $zip->addFromString( 'NN.bin', $tileData );
        $zip->close();

        $saved = $this->manager->saveUploadedFile( $zipPath, 'bundle.zip' );
        $this->assertCount( 1, $saved );
        $this->assertSame( 'NN', $saved[0]['square'] );
        $this->assertTrue( $this->manager->getTileInfo( 'NN' )['installed'] );
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
