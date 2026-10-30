<?php
/**
 * REST API Controller for Plugin Settings & OS Maps API credentials.
 */

declare(strict_types=1);

namespace EMSRoute\Core\REST;

use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

class Settings_Controller {
    public const REST_NAMESPACE = 'ems-route/v1';

    public function register_routes(): void {
        register_rest_route( self::REST_NAMESPACE, '/settings', [
            [
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => [ $this, 'get_settings' ],
                'permission_callback' => [ $this, 'check_admin_permission' ],
            ],
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => [ $this, 'save_settings' ],
                'permission_callback' => [ $this, 'check_admin_permission' ],
                'args'                => [
                    'os_maps_api_key'    => [
                        'required'          => false,
                        'type'              => 'string',
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                    'os_maps_api_secret' => [
                        'required'          => false,
                        'type'              => 'string',
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                ],
            ],
        ] );
    }

    public function check_admin_permission(): bool {
        return current_user_can( 'manage_options' );
    }

    public function get_settings( WP_REST_Request $request ): WP_REST_Response {
        $hasConstant = defined( 'EMS_OS_MAPS_API_KEY' );
        $osApiKey    = $hasConstant
            ? constant( 'EMS_OS_MAPS_API_KEY' )
            : get_option( 'ems_os_maps_api_key', '' );

        $osApiSecret = defined( 'EMS_OS_MAPS_API_SECRET' )
            ? constant( 'EMS_OS_MAPS_API_SECRET' )
            : get_option( 'ems_os_maps_api_secret', '' );

        return new WP_REST_Response( [
            'success'  => true,
            'settings' => [
                'os_maps_api_key'       => (string) $osApiKey,
                'os_maps_api_secret'    => (string) $osApiSecret,
                'has_constant_override' => $hasConstant,
            ],
        ], 200 );
    }

    public function save_settings( WP_REST_Request $request ): WP_REST_Response {
        $apiKey    = $request->get_param( 'os_maps_api_key' );
        $apiSecret = $request->get_param( 'os_maps_api_secret' );

        if ( null !== $apiKey ) {
            update_option( 'ems_os_maps_api_key', sanitize_text_field( (string) $apiKey ) );
        }

        if ( null !== $apiSecret ) {
            update_option( 'ems_os_maps_api_secret', sanitize_text_field( (string) $apiSecret ) );
        }

        $hasConstant = defined( 'EMS_OS_MAPS_API_KEY' );
        $effectiveKey = $hasConstant
            ? constant( 'EMS_OS_MAPS_API_KEY' )
            : get_option( 'ems_os_maps_api_key', '' );

        $effectiveSecret = defined( 'EMS_OS_MAPS_API_SECRET' )
            ? constant( 'EMS_OS_MAPS_API_SECRET' )
            : get_option( 'ems_os_maps_api_secret', '' );

        return new WP_REST_Response( [
            'success'  => true,
            'message'  => __( 'API settings saved successfully.', 'ems-route-card-engine' ),
            'settings' => [
                'os_maps_api_key'       => (string) $effectiveKey,
                'os_maps_api_secret'    => (string) $effectiveSecret,
                'has_constant_override' => $hasConstant,
            ],
        ], 200 );
    }
}
