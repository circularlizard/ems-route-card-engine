<?php
/**
 * Plugin initialization and constants unit tests.
 */

declare(strict_types=1);

namespace EMSRoute\Tests\Unit;

use EMSRoute\Tests\TestCase;
use EMSRoute\Core\Plugin;
use Brain\Monkey\Functions;

class PluginTest extends TestCase {
    public function test_plugin_defines_constants(): void {
        $this->assertTrue( defined( 'EMS_ROUTE_CARD_VERSION' ) );
        $this->assertTrue( defined( 'EMS_ROUTE_CARD_PATH' ) );
        $this->assertTrue( defined( 'EMS_ROUTE_CARD_URL' ) );
        $this->assertTrue( defined( 'DOFE_DEM_DATA_DIR' ) );
    }

    public function test_plugin_init_registers_hooks(): void {
        Functions\when( 'is_admin' )->justReturn( true );

        Plugin::init();

        $this->assertTrue( has_action( 'admin_menu' ) );
        $this->assertTrue( has_action( 'rest_api_init' ) );
    }
}
