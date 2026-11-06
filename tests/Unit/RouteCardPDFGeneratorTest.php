<?php
/**
 * Tests for Route_Card_PDF_Generator.
 */

declare(strict_types=1);

namespace EMSRoute\Tests\Unit;

use EMSRoute\Tests\TestCase;
use EMSRoute\Core\PDF\Route_Card_PDF_Generator;
use Brain\Monkey\Functions;

class RouteCardPDFGeneratorTest extends TestCase {

    protected function setUp(): void {
        parent::setUp();

        Functions\when( 'esc_html' )->returnArg();
        Functions\when( 'esc_attr' )->returnArg();
    }

    public function test_generate_html_contains_metadata_and_legs(): void {
        $card = [
            'id'          => 1,
            'day_number'  => 1,
            'route_title' => 'Pentland Hills Expedition',
            'header_data' => [
                'aim'                        => 'Study vegetation and erosion patterns',
                'date'                       => '2026-11-08',
                'dayOfWeek'                  => 'Sunday',
                'unitName'                   => 'Pentland District Scouts',
                'teamName'                   => 'Team Alpha',
                'teamMembers'                => [ 'Alice', 'Bob', 'Charlie' ],
                'supervisorName'             => 'John Leader',
                'supervisorPhone'            => '07700 900123',
                'backupName'                 => 'Jane Home',
                'backupPhone'                => '07700 900456',
                'settingOutTime'             => '09:30',
                'baseWalkingSpeedKmh'        => 4.0,
                'elevationPenaltyMinsPer10m' => 1.0,
                'startPointDescription'      => 'Bonaly Car Park',
                'startGridRef'               => 'NT 212 677',
                'emergencyPlan'              => 'Descend to nearest farm road and call base',
            ],
            'legs_data'   => [
                [
                    'leg_number'        => 1,
                    'start_name'        => 'Bonaly Car Park',
                    'start_grid_ref'    => 'NT 212 677',
                    'end_name'          => 'Bonaly Reservoir',
                    'end_grid_ref'      => 'NT 210 655',
                    'distance_km'       => 2.5,
                    'ascent_m'          => 120,
                    'rest_minutes'      => 10,
                    'activity_minutes'  => 0,
                    'route_description' => 'Follow tarmac road to gate then gravel track',
                    'escape_route'      => 'Retrace route back to car park',
                ],
            ],
        ];

        $html = Route_Card_PDF_Generator::generate_html( $card );

        // Main table & metadata assertions
        $this->assertStringContainsString( 'DofE Expedition Route Card &mdash; Day 1', $html );
        $this->assertStringContainsString( 'Pentland Hills Expedition', $html );
        $this->assertStringContainsString( 'Study vegetation and erosion patterns', $html );
        $this->assertStringContainsString( 'Team Alpha', $html );
        $this->assertStringContainsString( 'Alice, Bob, Charlie', $html );
        $this->assertStringContainsString( 'Bonaly Car Park', $html );
        $this->assertStringContainsString( 'Bonaly Reservoir', $html );
        $this->assertStringContainsString( '09:30', $html );
        $this->assertStringContainsString( 'Retrace route back to car park', $html );
        $this->assertStringContainsString( 'Aim / Project Goal Activity', $html );
        $this->assertStringContainsString( 'Emergency Plan &amp; Abort Strategy', $html );
        $this->assertStringContainsString( 'Start Time', $html );
        $this->assertStringContainsString( 'End Time (inc stops)', $html );

        // No ETA / ETD jargon in table headers
        $this->assertStringNotContainsString( '>ETA<', $html );
        $this->assertStringNotContainsString( '>ETD<', $html );

        // Sections B and D removed, Section A integrated into main table
        $this->assertStringNotContainsString( 'Navigation Vectors, Elevation &amp; Compass Bearings', $html );
        $this->assertStringNotContainsString( 'Supervisor &amp; Assessor Check-in Record', $html );
    }

    public function test_generate_pdf_compiles_valid_pdf_stream(): void {
        $card = [
            'id'          => 2,
            'day_number'  => 2,
            'route_title' => 'Cairngorms Plateau',
            'header_data' => [
                'aim'                 => 'Alpine navigation practice',
                'settingOutTime'      => '09:00',
                'baseWalkingSpeedKmh' => 4.0,
            ],
            'legs_data'   => [
                [
                    'leg_number'        => 1,
                    'start_name'        => 'Coire Cas',
                    'start_grid_ref'    => 'NH 989 061',
                    'end_name'          => 'Ptarmigan',
                    'end_grid_ref'      => 'NH 998 058',
                    'distance_km'       => 1.8,
                    'ascent_m'          => 350,
                    'rest_minutes'      => 15,
                    'route_description' => 'Follow zigzag mountain path',
                    'escape_route'      => 'Descend via funicular tracks',
                ],
            ],
        ];

        $pdfBytes = Route_Card_PDF_Generator::generate_pdf( $card );

        $this->assertNotEmpty( $pdfBytes );
        // PDF magic header
        $this->assertStringStartsWith( '%PDF-', $pdfBytes );
    }

    public function test_generate_html_resolves_legs_from_route_data_or_legs_key(): void {
        $cardWithRouteData = [
            'id'          => 3,
            'day_number'  => 1,
            'route_title' => 'Route Data Test',
            'header_data' => [ 'settingOutTime' => '10:00' ],
            'route_data'  => [
                'legs' => [
                    [
                        'leg_number'        => 1,
                        'start_name'        => 'Castle Point',
                        'start_grid_ref'    => 'NT 123 456',
                        'end_name'          => 'Harbour View',
                        'end_grid_ref'      => 'NT 128 460',
                        'distance_km'       => 3.2,
                        'ascent_m'          => 50,
                        'route_description' => 'Follow coastal path eastward',
                    ],
                ],
            ],
        ];

        $html = Route_Card_PDF_Generator::generate_html( $cardWithRouteData );
        $this->assertStringContainsString( 'Castle Point', $html );
        $this->assertStringContainsString( 'Harbour View', $html );
        $this->assertStringContainsString( 'NT 123 456', $html );
        $this->assertStringContainsString( 'Follow coastal path eastward', $html );
    }
}
