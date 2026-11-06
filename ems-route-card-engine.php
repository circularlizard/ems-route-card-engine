<?php
/**
 * Plugin Name: EMS Route Card & Terrain Engine
 * Plugin URI:  https://github.com/circularlizard/ems-route-card-engine
 * Description: Local terrain engine, GPX route card builder, and Naismith calculator for DofE expeditions.
 * Version:     0.1.8
 * Author:      Expedition Management System Team
 * License:     GPL-2.0-or-later
 * Text Domain: ems-route-card-engine
 */

declare(strict_types=1);

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

define( 'EMS_ROUTE_CARD_VERSION', '0.1.8' );
define( 'EMS_ROUTE_CARD_FILE', __FILE__ );
define( 'EMS_ROUTE_CARD_PATH', plugin_dir_path( __FILE__ ) );
define( 'EMS_ROUTE_CARD_URL', plugin_dir_url( __FILE__ ) );

if ( ! defined( 'DOFE_DEM_DATA_DIR' ) ) {
    define( 'DOFE_DEM_DATA_DIR', WP_CONTENT_DIR . '/dofe-dem-data' );
}

// Load Composer autoloader
if ( file_exists( EMS_ROUTE_CARD_PATH . 'vendor/autoload.php' ) ) {
    require_once EMS_ROUTE_CARD_PATH . 'vendor/autoload.php';
}

// Plugin activation & deactivation hooks
register_activation_hook( __FILE__, [ \EMSRoute\Core\Table_Installer::class, 'install' ] );

// Initialize plugin
add_action( 'plugins_loaded', function() {
    \EMSRoute\Core\Plugin::init();
} );
