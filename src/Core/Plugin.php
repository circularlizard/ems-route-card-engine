<?php
/**
 * Main plugin coordinator.
 */

declare(strict_types=1);

namespace EMSRoute\Core;

class Plugin {
    private static bool $initialized = false;

    public static function init(): void {
        if ( self::$initialized ) {
            return;
        }
        self::$initialized = true;

        if ( is_admin() ) {
            \EMSRoute\Admin\Admin_Studio_Controller::init();
        }

        add_action( 'rest_api_init', [ self::class, 'register_rest_routes' ] );
        add_shortcode( 'ems_route_card_studio', [ self::class, 'render_studio_shortcode' ] );
    }

    public static function register_rest_routes(): void {
        $demController = new \EMSRoute\Core\REST\DEM_Management_Controller();
        $demController->register_routes();

        $routeCardController = new \EMSRoute\Core\REST\Route_Card_Controller();
        $routeCardController->register_routes();
    }

    /**
     * Renders the frontend Route Card Studio shortcode.
     *
     * Usage: [ems_route_card_studio expedition_id="1" team_id="2" day="1"]
     *
     * @param array<string, mixed>|string $atts Shortcode attributes.
     * @return string HTML mount container.
     */
    public static function render_studio_shortcode( $atts ): string {
        $a = shortcode_atts( [
            'expedition_id' => 1,
            'team_id'       => 1,
            'day'           => 1,
        ], is_array( $atts ) ? $atts : [] );

        // Enqueue React bundle on frontend
        $script_path = EMS_ROUTE_CARD_PATH . 'assets/js/route-card-studio.js';
        $style_path  = EMS_ROUTE_CARD_PATH . 'assets/js/route-card-studio.css';

        if ( file_exists( $script_path ) ) {
            wp_enqueue_script(
                'ems-route-card-studio',
                EMS_ROUTE_CARD_URL . 'assets/js/route-card-studio.js',
                [ 'wp-element' ],
                EMS_ROUTE_CARD_VERSION,
                true
            );

            $osApiKey = defined( 'EMS_OS_MAPS_API_KEY' ) ? constant( 'EMS_OS_MAPS_API_KEY' ) : get_option( 'ems_os_maps_api_key', '' );

            wp_localize_script( 'ems-route-card-studio', 'emsRouteCardStudioConfig', [
                'root_url'        => esc_url_raw( rest_url( 'ems-route/v1' ) ),
                'nonce'           => wp_create_nonce( 'wp_rest' ),
                'expedition_id'   => (int) $a['expedition_id'],
                'team_id'         => (int) $a['team_id'],
                'day_number'      => (int) $a['day'],
                'is_shortcode'    => true,
                'os_maps_api_key' => sanitize_text_field( (string) $osApiKey ),
            ] );
        }

        if ( file_exists( $style_path ) ) {
            wp_enqueue_style(
                'ems-route-card-studio',
                EMS_ROUTE_CARD_URL . 'assets/js/route-card-studio.css',
                [],
                EMS_ROUTE_CARD_VERSION
            );
        }

        return sprintf(
            '<div id="ems-route-card-studio-root" data-expedition="%d" data-team="%d" data-day="%d" data-shortcode="true"></div>',
            (int) $a['expedition_id'],
            (int) $a['team_id'],
            (int) $a['day']
        );
    }
}
