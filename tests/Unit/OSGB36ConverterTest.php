<?php
/**
 * Tests for OSGB36_Converter.
 */

declare(strict_types=1);

namespace EMSRoute\Tests\Unit;

use EMSRoute\Tests\TestCase;
use EMSRoute\Core\Geodesy\OSGB36_Converter;
use InvalidArgumentException;

class OSGB36ConverterTest extends TestCase {
    private OSGB36_Converter $converter;

    protected function setUp(): void {
        parent::setUp();
        $this->converter = new OSGB36_Converter();
    }

    public function test_wgs84_to_osgb36_arthurs_seat(): void {
        // Arthur's Seat: Lat 55.944111, Lon -3.161806
        $coords = $this->converter->wgs84ToOsgb36( 55.944111, -3.161806 );

        // Expected Easting ~327534, Northing ~672950
        $this->assertEqualsWithDelta( 327534.0, $coords['easting'], 50.0 );
        $this->assertEqualsWithDelta( 672950.0, $coords['northing'], 50.0 );
    }

    public function test_to_grid_reference_6_and_8_figures(): void {
        // Arthur's Seat (E: 327534, N: 672950)
        $grid6 = $this->converter->toGridReference( 327534.0, 672950.0, 6 );
        $this->assertSame( 'NT 275 729', $grid6 );

        $grid8 = $this->converter->toGridReference( 327534.0, 672950.0, 8 );
        $this->assertSame( 'NT 2753 7295', $grid8 );
    }

    public function test_from_grid_reference_roundtrip(): void {
        $parsed = $this->converter->fromGridReference( 'NT 275 729' );
        $this->assertSame( 'NT', $parsed['square'] );
        $this->assertEqualsWithDelta( 327500.0, $parsed['easting'], 1.0 );
        $this->assertEqualsWithDelta( 672900.0, $parsed['northing'], 1.0 );

        $parsed8 = $this->converter->fromGridReference( 'NT 2753 7295' );
        $this->assertEqualsWithDelta( 327530.0, $parsed8['easting'], 1.0 );
        $this->assertEqualsWithDelta( 672950.0, $parsed8['northing'], 1.0 );
    }

    public function test_from_grid_reference_throws_on_invalid(): void {
        $this->expectException( InvalidArgumentException::class );
        $this->converter->fromGridReference( 'INVALID' );
    }

    public function test_calculate_bearing(): void {
        // Origin: (300000, 600000), Destination due North: (300000, 601000)
        $dueNorth = $this->converter->calculateBearing( 300000, 600000, 300000, 601000 );
        $this->assertSame( 0, $dueNorth['grid_bearing'] );
        $this->assertSame( 1000.0, $dueNorth['distance_m'] );

        // Due East: (301000, 600000)
        $dueEast = $this->converter->calculateBearing( 300000, 600000, 301000, 600000 );
        $this->assertSame( 90, $dueEast['grid_bearing'] );
        $this->assertSame( 1000.0, $dueEast['distance_m'] );
    }
}
