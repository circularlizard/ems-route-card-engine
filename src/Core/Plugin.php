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
    }

    public static function register_rest_routes(): void {
        // Will register /ems-route/v1 routes
    }
}
