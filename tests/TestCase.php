<?php
/**
 * Base TestCase for ems-route-card-engine
 */

declare(strict_types=1);

namespace EMSRoute\Tests;

use PHPUnit\Framework\TestCase as PHPUnitTestCase;
use Brain\Monkey;
use Brain\Monkey\Functions;

abstract class TestCase extends PHPUnitTestCase {
    protected function setUp(): void {
        parent::setUp();
        Monkey\setUp();

        // Stub standard WordPress functions
        Functions\when( '__' )->returnArg( 1 );
        Functions\when( 'esc_html__' )->returnArg( 1 );
        Functions\when( 'esc_attr__' )->returnArg( 1 );
        Functions\when( 'sanitize_text_field' )->returnArg( 1 );
        Functions\when( 'current_user_can' )->justReturn( true );
        Functions\when( 'get_current_user_id' )->justReturn( 1 );
        Functions\when( 'add_shortcode' )->justReturn( true );
        Functions\when( 'shortcode_atts' )->alias( function( $pairs, $atts ) {
            return array_merge( $pairs, (array) $atts );
        } );
    }

    protected function tearDown(): void {
        Monkey\tearDown();
        parent::tearDown();
    }
}
