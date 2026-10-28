<?php
/**
 * REST API Controller for DEM Tile Management.
 */

declare(strict_types=1);

namespace EMSRoute\Core\REST;

use EMSRoute\Core\DEM\DEM_Storage_Manager;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;
use WP_Error;
use Throwable;

class DEM_Management_Controller {
    public const REST_NAMESPACE = 'ems-route/v1';

    private DEM_Storage_Manager $storageManager;

    public function __construct( ?DEM_Storage_Manager $storageManager = null ) {
        $this->storageManager = $storageManager ?? new DEM_Storage_Manager();
    }

    public function register_routes(): void {
        register_rest_route( self::REST_NAMESPACE, '/dem/tiles', [
            [
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => [ $this, 'get_tiles' ],
                'permission_callback' => [ $this, 'check_admin_permission' ],
            ],
        ] );

        register_rest_route( self::REST_NAMESPACE, '/dem/upload', [
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => [ $this, 'upload_tile' ],
                'permission_callback' => [ $this, 'check_admin_permission' ],
            ],
        ] );

        register_rest_route( self::REST_NAMESPACE, '/dem/(?P<square>[a-zA-Z]{2})', [
            [
                'methods'             => WP_REST_Server::DELETABLE,
                'callback'            => [ $this, 'delete_tile' ],
                'permission_callback' => [ $this, 'check_admin_permission' ],
                'args'                => [
                    'square' => [
                        'required'          => true,
                        'validate_callback' => fn( $param ) => is_string( $param ) && 2 === strlen( $param ),
                        'sanitize_callback' => 'strtoupper',
                    ],
                ],
            ],
        ] );

        register_rest_route( self::REST_NAMESPACE, '/dem/benchmark/(?P<square>[a-zA-Z]{2})', [
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => [ $this, 'run_benchmark' ],
                'permission_callback' => [ $this, 'check_admin_permission' ],
                'args'                => [
                    'square' => [
                        'required'          => true,
                        'validate_callback' => fn( $param ) => is_string( $param ) && 2 === strlen( $param ),
                        'sanitize_callback' => 'strtoupper',
                    ],
                ],
            ],
        ] );
    }

    public function check_admin_permission(): bool {
        return current_user_can( 'manage_options' );
    }

    /**
     * Returns all UK tiles and overall storage statistics.
     */
    public function get_tiles( WP_REST_Request $request ): WP_REST_Response {
        $tiles = $this->storageManager->listTiles();

        $installedCount = 0;
        $totalBytes     = 0;
        $validCount     = 0;

        foreach ( $tiles as $t ) {
            if ( $t['installed'] ) {
                $installedCount++;
                $totalBytes += $t['file_size'];
                if ( $t['is_valid_size'] ) {
                    $validCount++;
                }
            }
        }

        return new WP_REST_Response( [
            'success'      => true,
            'storage_dir'  => $this->storageManager->getStorageDir(),
            'total_tiles'  => count( $tiles ),
            'installed'    => $installedCount,
            'valid'        => $validCount,
            'total_bytes'  => $totalBytes,
            'total_size_mb'=> round( $totalBytes / 1048576, 2 ),
            'tiles'        => array_values( $tiles ),
        ], 200 );
    }

    /**
     * Handles upload of a .bin file or a .zip file containing .bin files.
     */
    public function upload_tile( WP_REST_Request $request ): WP_REST_Response {
        $files = $request->get_file_params();
        if ( empty( $files['file'] ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'message' => 'No file was provided in the upload request.',
            ], 400 );
        }

        $fileEntry = $files['file'];
        if ( ! empty( $fileEntry['error'] ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'message' => 'PHP file upload error code: ' . $fileEntry['error'],
            ], 400 );
        }

        $tmpPath        = $fileEntry['tmp_name'];
        $origName       = $fileEntry['name'];
        $overrideSquare = $request->get_param( 'square' );

        try {
            $savedTiles = $this->storageManager->saveUploadedFile(
                $tmpPath,
                $origName,
                is_string( $overrideSquare ) ? $overrideSquare : null
            );

            return new WP_REST_Response( [
                'success'     => true,
                'message'     => sprintf( 'Successfully uploaded and installed %d DEM tile(s).', count( $savedTiles ) ),
                'saved_tiles' => $savedTiles,
            ], 200 );
        } catch ( Throwable $e ) {
            return new WP_REST_Response( [
                'success' => false,
                'message' => $e->getMessage(),
            ], 400 );
        }
    }

    /**
     * Deletes a tile.
     */
    public function delete_tile( WP_REST_Request $request ): WP_REST_Response {
        $square = (string) $request->get_param( 'square' );

        $deleted = $this->storageManager->deleteTile( $square );
        if ( ! $deleted ) {
            return new WP_REST_Response( [
                'success' => false,
                'message' => "Tile for square {$square} was not found or could not be deleted.",
            ], 404 );
        }

        return new WP_REST_Response( [
            'success'   => true,
            'message'   => "Successfully deleted {$square}.bin tile.",
            'tile_info' => $this->storageManager->getTileInfo( $square ),
        ], 200 );
    }

    /**
     * Runs benchmark on demand for a tile.
     */
    public function run_benchmark( WP_REST_Request $request ): WP_REST_Response {
        $square = (string) $request->get_param( 'square' );

        try {
            $info = $this->storageManager->getTileInfo( $square );

            if ( ! $info['installed'] ) {
                return new WP_REST_Response( [
                    'success' => false,
                    'message' => "Tile {$square}.bin is not installed.",
                ], 404 );
            }

            return new WP_REST_Response( [
                'success'   => true,
                'tile_info' => $info,
            ], 200 );
        } catch ( Throwable $e ) {
            return new WP_REST_Response( [
                'success' => false,
                'message' => $e->getMessage(),
            ], 400 );
        }
    }
}
