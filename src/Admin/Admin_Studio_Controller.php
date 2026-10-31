<?php
/**
 * Standalone Admin Studio Controller
 */

declare(strict_types=1);

namespace EMSRoute\Admin;

class Admin_Studio_Controller {
    public static function init(): void {
        add_action( 'admin_menu', [ self::class, 'register_admin_menu' ] );
        add_action( 'admin_enqueue_scripts', [ self::class, 'enqueue_assets' ] );
    }

    public static function register_admin_menu(): void {
        add_management_page(
            __( 'DofE Route Card Engine', 'ems-route-card-engine' ),
            __( 'Route Card Engine', 'ems-route-card-engine' ),
            'manage_options',
            'ems-route-card-studio',
            [ self::class, 'render_studio_page' ]
        );
    }

    public static function enqueue_assets( string $hook ): void {
        if ( 'tools_page_ems-route-card-studio' !== $hook ) {
            return;
        }

        $script_path = EMS_ROUTE_CARD_PATH . 'assets/js/route-card-studio.js';
        $style_path  = EMS_ROUTE_CARD_PATH . 'assets/js/route-card-studio.css';

        if ( file_exists( $script_path ) ) {
            $ver = (string) filemtime( $script_path );
            wp_enqueue_script(
                'ems-route-card-studio',
                EMS_ROUTE_CARD_URL . 'assets/js/route-card-studio.js',
                [ 'wp-element' ],
                $ver,
                true
            );

            $osApiKey    = defined( 'EMS_OS_MAPS_API_KEY' ) ? constant( 'EMS_OS_MAPS_API_KEY' ) : get_option( 'ems_os_maps_api_key', '' );
            $osApiSecret = defined( 'EMS_OS_MAPS_API_SECRET' ) ? constant( 'EMS_OS_MAPS_API_SECRET' ) : get_option( 'ems_os_maps_api_secret', '' );

            wp_localize_script( 'ems-route-card-studio', 'emsRouteCardStudioConfig', [
                'root_url'           => esc_url_raw( rest_url( 'ems-route/v1' ) ),
                'nonce'              => wp_create_nonce( 'wp_rest' ),
                'os_maps_api_key'    => sanitize_text_field( (string) $osApiKey ),
                'os_maps_api_secret' => sanitize_text_field( (string) $osApiSecret ),
            ] );
        }

        if ( file_exists( $style_path ) ) {
            $style_ver = (string) filemtime( $style_path );
            wp_enqueue_style(
                'ems-route-card-studio',
                EMS_ROUTE_CARD_URL . 'assets/js/route-card-studio.css',
                [],
                $style_ver
            );
        }
    }

    public static function render_studio_page(): void {
        echo '<div class="wrap">';
        echo '<h1>' . esc_html__( 'DofE Route Card & Terrain Studio', 'ems-route-card-engine' ) . '</h1>';
        echo '<div id="ems-route-card-studio-root"></div>';
        echo '</div>';
    }
}
