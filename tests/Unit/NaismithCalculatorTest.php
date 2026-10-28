<?php
/**
 * Tests for Naismith_Calculator.
 */

declare(strict_types=1);

namespace EMSRoute\Tests\Unit;

use EMSRoute\Tests\TestCase;
use EMSRoute\Core\Timing\Naismith_Calculator;

class NaismithCalculatorTest extends TestCase {
    private Naismith_Calculator $calc;

    protected function setUp(): void {
        parent::setUp();
        $this->calc = new Naismith_Calculator();
    }

    public function test_standard_flat_walking_pace(): void {
        // 5 km on flat terrain at standard 5 km/h = exactly 60 minutes
        $res = $this->calc->calculateLeg( 5000.0, 0.0, 0.0 );
        $this->assertSame( 5.0, $res['distance_km'] );
        $this->assertSame( 0.0, $res['ascent_m'] );
        $this->assertSame( 60, $res['base_walk_minutes'] );
        $this->assertSame( 0, $res['climb_minutes'] );
        $this->assertSame( 60, $res['total_walking_minutes'] );
        $this->assertSame( 60, $res['total_leg_minutes'] );
    }

    public function test_naismith_ascent_penalty(): void {
        // 2 km with 300m ascent:
        // Base walk: (2 / 5) * 60 = 24 minutes
        // Ascent: 300 / 10 = 30 minutes
        // Total walking = 54 minutes
        $res = $this->calc->calculateLeg( 2000.0, 300.0, 0.0 );
        $this->assertSame( 2.0, $res['distance_km'] );
        $this->assertSame( 300.0, $res['ascent_m'] );
        $this->assertSame( 24, $res['base_walk_minutes'] );
        $this->assertSame( 30, $res['climb_minutes'] );
        $this->assertSame( 54, $res['total_walking_minutes'] );
    }

    public function test_flat_override_ignores_climb(): void {
        // Leg through a tunnel: 1 km with 200m hill above it, flatOverride = true
        // Base walk: 12 minutes
        // Climb: 0 minutes (overridden)
        $res = $this->calc->calculateLeg( 1000.0, 200.0, 0.0, 0, 0, true );
        $this->assertSame( 12, $res['total_walking_minutes'] );
        $this->assertSame( 0, $res['climb_minutes'] );
    }

    public function test_rest_and_exploration_times(): void {
        // 2 km flat (24m walk) + 15m rest + 20m project work = 59m
        $res = $this->calc->calculateLeg( 2000.0, 0.0, 0.0, 15, 20 );
        $this->assertSame( 24, $res['total_walking_minutes'] );
        $this->assertSame( 15, $res['rest_minutes'] );
        $this->assertSame( 20, $res['exploration_minutes'] );
        $this->assertSame( 59, $res['total_leg_minutes'] );
    }

    public function test_format_minutes_and_eta(): void {
        $this->assertSame( '1h 15m', $this->calc->formatMinutes( 75 ) );
        $this->assertSame( '45m', $this->calc->formatMinutes( 45 ) );
        $this->assertSame( '2h', $this->calc->formatMinutes( 120 ) );

        $this->assertSame( '10:15', $this->calc->calculateEta( '09:00', 75 ) );
        $this->assertSame( '11:30', $this->calc->calculateEta( '09:45', 105 ) );
    }
}
