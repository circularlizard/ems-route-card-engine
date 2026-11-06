<?php
/**
 * Route Card PDF Generator using Dompdf.
 *
 * Produces official 2-page landscape DofE Route Cards per day:
 * - Page 1: Administrative Metadata + 11-Column Core Timings & Route Legs Table + Totals
 * - Page 2: Aim / Goal Activity Log + Compass Bearings & Elevation Breakdown + Emergency Strategy + Supervisor Check-in Record
 */

declare(strict_types=1);

namespace EMSRoute\Core\PDF;

use Dompdf\Dompdf;
use Dompdf\Options;
use Throwable;

class Route_Card_PDF_Generator {

    /**
     * Generates complete HTML markup for a single day or multi-day expedition route card.
     *
     * @param array<string, mixed>|array<int, array<string, mixed>> $cardOrCards Single day card array or array of day cards
     */
    public static function generate_html( array $cardOrCards ): string {
        // Determine if passing a single card or array of cards
        $cards = isset( $cardOrCards['day_number'] ) || isset( $cardOrCards['legs_data'] ) || isset( $cardOrCards['legs'] ) || isset( $cardOrCards['route_data'] )
            ? [ $cardOrCards ]
            : $cardOrCards;

        $bodyHtml = '';
        $isFirst = true;

        foreach ( $cards as $card ) {
            if ( ! is_array( $card ) ) {
                continue;
            }

            if ( ! $isFirst ) {
                $bodyHtml .= '<div class="page-break"></div>';
            }
            $isFirst = false;

            $bodyHtml .= self::generate_day_html( $card );
        }

        return "
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset=\"utf-8\">
            <title>DofE Expedition Route Card</title>
            <style>
                @page {
                    size: A4 landscape;
                    margin: 7mm 8mm;
                }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                    color: #0f172a;
                    font-size: 7.5pt;
                    line-height: 1.25;
                    margin: 0;
                    padding: 0;
                }
                .page-break {
                    page-break-before: always;
                }
                .header-banner {
                    border-bottom: 2px solid #1e3a8a;
                    padding-bottom: 3px;
                    margin-bottom: 6px;
                }
                .header-title {
                    font-size: 12pt;
                    font-weight: bold;
                    color: #1e3a8a;
                    margin: 0;
                }
                .header-sub {
                    font-size: 7.5pt;
                    color: #475569;
                    margin: 1px 0 0 0;
                }
                .meta-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 6px;
                }
                .meta-table td {
                    padding: 3px 5px;
                    vertical-align: top;
                    font-size: 7pt;
                    border: 1px solid #cbd5e1;
                    background: #f8fafc;
                }
                .meta-label {
                    font-weight: bold;
                    color: #475569;
                    text-transform: uppercase;
                    font-size: 6pt;
                    display: block;
                    margin-bottom: 1px;
                }
                .route-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 6.8pt;
                    margin-bottom: 6px;
                }
                .route-table th {
                    background: #1e3a8a;
                    color: #ffffff;
                    padding: 3.5px 3.5px;
                    font-weight: bold;
                    text-align: left;
                    font-size: 6.2pt;
                    text-transform: uppercase;
                    border: 1px solid #1e3a8a;
                }
                .route-table td {
                    border: 1px solid #94a3b8;
                    padding: 2.5px 3.5px;
                    vertical-align: top;
                }
                .route-table tr:nth-child(even) td {
                    background: #f8fafc;
                }
                .text-center { text-align: center; }
                .font-mono { font-family: monospace; }
                .font-bold { font-weight: bold; }
                .grid-ref { font-family: monospace; font-size: 6.2pt; color: #475569; }
                .escape-note {
                    color: #92400e;
                    background: #fef3c7;
                    padding: 1.5px 3px;
                    border-radius: 2px;
                    margin-top: 1.5px;
                    font-size: 6.2pt;
                }
                .total-row td {
                    background: #e2e8f0 !important;
                    font-weight: bold;
                    border-top: 2px solid #1e3a8a;
                    border-bottom: 2px solid #1e3a8a;
                    font-size: 7.2pt;
                }
                .section-header {
                    font-size: 8.5pt;
                    font-weight: bold;
                    color: #1e3a8a;
                    border-bottom: 1.5px solid #1e3a8a;
                    padding-bottom: 2px;
                    margin: 6px 0 4px 0;
                    text-transform: uppercase;
                    letter-spacing: 0.03em;
                }
                .emergency-box {
                    border: 1.5px solid #d97706;
                    background: #fffbeb;
                    padding: 4px 8px;
                    border-radius: 3px;
                    font-size: 7pt;
                    margin-bottom: 6px;
                }
                .emergency-title {
                    font-weight: bold;
                    color: #b45309;
                    font-size: 7.5pt;
                    margin-bottom: 2px;
                    text-transform: uppercase;
                }
                .page-footer-notice {
                    font-size: 6.5pt;
                    color: #64748b;
                    text-align: right;
                    font-style: italic;
                    margin-top: 3px;
                }
            </style>
        </head>
        <body>
            {$bodyHtml}
        </body>
        </html>
        ";
    }

    /**
     * Generates Page 1 (Timings & Itinerary Table) + Page 2 (Goal Activity, Bearings & Safety Plan) for a single day.
     *
     * @param array<string, mixed> $card
     */
    private static function generate_day_html( array $card ): string {
        $dayNumber  = (int) ( $card['day_number'] ?? 1 );
        $routeTitle = (string) ( $card['route_title'] ?? "Day {$dayNumber} Route" );
        $header = [];
        if ( ! empty( $card['header_data'] ) && is_array( $card['header_data'] ) ) {
            $header = $card['header_data'];
        } elseif ( ! empty( $card['header'] ) && is_array( $card['header'] ) ) {
            $header = $card['header'];
        }

        // Extract legs from legs_data, legs, or route_data
        $legs = [];
        if ( ! empty( $card['legs_data'] ) && is_array( $card['legs_data'] ) ) {
            $legs = $card['legs_data'];
        } elseif ( ! empty( $card['legs'] ) && is_array( $card['legs'] ) ) {
            $legs = $card['legs'];
        } elseif ( ! empty( $card['route_data']['legs'] ) && is_array( $card['route_data']['legs'] ) ) {
            $legs = $card['route_data']['legs'];
        } elseif ( ! empty( $card['route_data']['legs_data'] ) && is_array( $card['route_data']['legs_data'] ) ) {
            $legs = $card['route_data']['legs_data'];
        } elseif ( ! empty( $card['route_data'] ) && is_array( $card['route_data'] ) && array_is_list( $card['route_data'] ) ) {
            $legs = $card['route_data'];
        }

        $aim         = esc_html( (string) ( $header['aim'] ?? '' ) );
        $date        = esc_html( (string) ( $header['date'] ?? '' ) );
        $dayOfWeek   = esc_html( (string) ( $header['dayOfWeek'] ?? '' ) );
        $unitName    = esc_html( (string) ( $header['unitName'] ?? '' ) );
        $teamName    = esc_html( (string) ( $header['teamName'] ?? '' ) );
        $supervisor  = esc_html( (string) ( $header['supervisorName'] ?? '' ) );
        $superPhone  = esc_html( (string) ( $header['supervisorPhone'] ?? '' ) );
        $backupName  = esc_html( (string) ( $header['backupName'] ?? '' ) );
        $backupPhone = esc_html( (string) ( $header['backupPhone'] ?? '' ) );
        $settingOut  = (string) ( $header['settingOutTime'] ?? '09:00' );
        if ( empty( $settingOut ) ) {
            $settingOut = '09:00';
        }
        $speedKmh    = (float) ( $header['baseWalkingSpeedKmh'] ?? 4.0 );
        if ( $speedKmh <= 0.0 ) {
            $speedKmh = 4.0;
        }
        $penaltyMins = (float) ( $header['elevationPenaltyMinsPer10m'] ?? 1.0 );
        $startDesc   = esc_html( (string) ( $header['startPointDescription'] ?? '' ) );
        $startGrid   = esc_html( (string) ( $header['startGridRef'] ?? '' ) );
        $emergency   = esc_html( (string) ( $header['emergencyPlan'] ?? '' ) );

        $members = $header['teamMembers'] ?? [];
        $membersStr = esc_html( is_array( $members ) ? implode( ', ', $members ) : (string) $members );

        // Schedule & table rows calculations
        $currentDepart = $settingOut;
        $totalDistKm   = 0.0;
        $totalAscentM  = 0.0;
        $totalDescentM = 0.0;
        $totalWalkMins = 0;
        $totalStops    = 0;

        $p1LegRows = '';

        foreach ( $legs as $index => $leg ) {
            $legNum    = (int) ( $leg['leg_number'] ?? ( $index + 1 ) );
            $fromName  = esc_html( (string) ( $leg['start_name'] ?? '' ) );
            $fromGrid  = esc_html( (string) ( $leg['start_grid_ref'] ?? '' ) );
            $toName    = esc_html( (string) ( $leg['end_name'] ?? '' ) );
            $toGrid    = esc_html( (string) ( $leg['end_grid_ref'] ?? '' ) );
            $distKm    = (float) ( $leg['distance_km'] ?? 0.0 );
            $ascentM   = (float) ( $leg['ascent_m'] ?? 0.0 );
            $descentM  = (float) ( $leg['descent_m'] ?? 0.0 );

            $flat      = ! empty( $leg['flat_override'] );
            $climbMins = $flat ? 0.0 : ( $ascentM / 10.0 ) * $penaltyMins;
            $walkMins  = (int) round( ( $distKm / $speedKmh ) * 60.0 + $climbMins );
            if ( $walkMins < 1 ) {
                $walkMins = 1;
            }

            $stopsMins   = (int) ( ( $leg['rest_minutes'] ?? 0 ) + ( $leg['activity_minutes'] ?? 0 ) );
            $totLegMins  = $walkMins + $stopsMins;
            $eta         = self::add_minutes_to_time( $currentDepart, $walkMins );
            $etd         = self::add_minutes_to_time( $eta, $stopsMins );
            $description = esc_html( (string) ( $leg['route_description'] ?? '' ) );
            $escape      = esc_html( (string) ( $leg['escape_route'] ?? '' ) );
            $activity    = esc_html( (string) ( $leg['activity_notes'] ?? '' ) );

            $totalDistKm   += $distKm;
            $totalAscentM  += $ascentM;
            $totalDescentM += $descentM;
            $totalWalkMins += $walkMins;
            $totalStops    += $stopsMins;

            $escapeHtml   = ! empty( $escape ) ? "<div class=\"escape-note\"><strong>Escape:</strong> {$escape}</div>" : '';
            $activityHtml = ! empty( $activity ) ? $activity : '<span style="color: #94a3b8; font-style: italic;">&mdash;</span>';

            // Main Timings Row (integrating Section A: Goal & Project Activity)
            $p1LegRows .= "
                <tr>
                    <td class=\"text-center font-bold\">{$legNum}</td>
                    <td><strong>{$fromName}</strong><br><span class=\"grid-ref\">{$fromGrid}</span></td>
                    <td><strong>{$toName}</strong><br><span class=\"grid-ref\">{$toGrid}</span></td>
                    <td class=\"text-center font-mono\">" . number_format( $distKm, 2 ) . "</td>
                    <td class=\"text-center font-mono\">+" . round( $ascentM ) . "m</td>
                    <td class=\"text-center font-mono\">" . self::format_hours_mins( $walkMins ) . "</td>
                    <td class=\"text-center font-mono\">{$stopsMins}m</td>
                    <td class=\"text-center font-mono font-bold\">" . self::format_hours_mins( $totLegMins ) . "</td>
                    <td class=\"text-center font-mono\">{$currentDepart}</td>
                    <td class=\"text-center font-mono font-bold\">{$etd}</td>
                    <td>{$description}{$escapeHtml}</td>
                    <td>{$activityHtml}</td>
                </tr>
            ";

            $currentDepart = $etd;
        }

        if ( empty( $p1LegRows ) ) {
            $p1LegRows = '<tr><td colspan="12" class="text-center" style="padding: 18px; color: #64748b; font-style: italic;">No journey legs recorded for Day ' . $dayNumber . '.</td></tr>';
        }

        $totalExpedMins       = $totalWalkMins + $totalStops;
        $totalDistFormatted   = number_format( $totalDistKm, 2 );
        $totalAscentFormatted = round( $totalAscentM );
        $totalWalkFormatted   = self::format_hours_mins( $totalWalkMins );
        $totalStopsFormatted  = self::format_hours_mins( $totalStops );
        $totalExpedFormatted  = self::format_hours_mins( $totalExpedMins );

        $dayHtml = "
            <div class=\"route-card-page\">
                <div class=\"header-banner\">
                    <table style=\"width: 100%;\">
                        <tr>
                            <td>
                                <h1 class=\"header-title\">DofE Expedition Route Card &mdash; Day {$dayNumber}</h1>
                                <div class=\"header-sub\"><strong>Route:</strong> " . esc_html( $routeTitle ) . "</div>
                            </td>
                            <td style=\"text-align: right; vertical-align: bottom;\">
                                <span style=\"font-size: 7pt; color: #64748b;\">Printed " . esc_html( gmdate( 'Y-m-d H:i' ) ) . "</span>
                            </td>
                        </tr>
                    </table>
                </div>

                <!-- Admin Details -->
                <table class=\"meta-table\">
                    <tr>
                        <td colspan=\"2\" style=\"width: 50%;\">
                            <span class=\"meta-label\">Expedition Aim / Purpose</span>
                            " . ( ! empty( $aim ) ? $aim : '<em>Not specified</em>' ) . "
                        </td>
                        <td style=\"width: 25%;\">
                            <span class=\"meta-label\">Date & Day</span>
                            <strong>{$date}</strong> ({$dayOfWeek})
                        </td>
                        <td style=\"width: 25%;\">
                            <span class=\"meta-label\">Unit & Team</span>
                            <strong>{$unitName}</strong> &mdash; {$teamName}
                        </td>
                    </tr>
                    <tr>
                        <td colspan=\"2\">
                            <span class=\"meta-label\">Team Participants</span>
                            " . ( ! empty( $membersStr ) ? $membersStr : '<em>None listed</em>' ) . "
                        </td>
                        <td>
                            <span class=\"meta-label\">Supervisor / Leader</span>
                            {$supervisor}<br><span class=\"font-mono\">{$superPhone}</span>
                        </td>
                        <td>
                            <span class=\"meta-label\">Home / Backup Contact</span>
                            {$backupName}<br><span class=\"font-mono\">{$backupPhone}</span>
                        </td>
                    </tr>
                    <tr>
                        <td colspan=\"2\">
                            <span class=\"meta-label\">Start Point Location & Grid Reference</span>
                            <strong>{$startDesc}</strong> (" . ( ! empty( $startGrid ) ? $startGrid : 'Start' ) . ")
                        </td>
                        <td colspan=\"2\">
                            <span class=\"meta-label\">Setting Out Time & Pacing Parameters</span>
                            Depart: <strong>{$settingOut}</strong> &nbsp;|&nbsp;
                            Base Speed: <strong>{$speedKmh} km/h</strong> &nbsp;|&nbsp;
                            Climb Penalty: <strong>{$penaltyMins} min / 10m</strong>
                        </td>
                    </tr>
                </table>

                <!-- Main Timings & Goal Activity Table -->
                <table class=\"route-table\">
                    <thead>
                        <tr>
                            <th style=\"width: 3%;\" class=\"text-center\">#</th>
                            <th style=\"width: 12%;\">From</th>
                            <th style=\"width: 12%;\">To</th>
                            <th style=\"width: 5%;\" class=\"text-center\">Dist</th>
                            <th style=\"width: 5%;\" class=\"text-center\">Climb</th>
                            <th style=\"width: 6%;\" class=\"text-center\">Walk</th>
                            <th style=\"width: 5%;\" class=\"text-center\">Stops</th>
                            <th style=\"width: 6%;\" class=\"text-center\">Total</th>
                            <th style=\"width: 6%;\" class=\"text-center\">Start Time</th>
                            <th style=\"width: 8%;\" class=\"text-center\">End Time (inc stops)</th>
                            <th style=\"width: 18%;\">Route Description &amp; Escape Path</th>
                            <th style=\"width: 14%;\">Aim / Project Goal Activity</th>
                        </tr>
                    </thead>
                    <tbody>
                        {$p1LegRows}
                        <tr class=\"total-row\">
                            <td colspan=\"3\" style=\"text-align: right; text-transform: uppercase;\">Day {$dayNumber} Totals:</td>
                            <td class=\"text-center font-mono\">{$totalDistFormatted} km</td>
                            <td class=\"text-center font-mono\">+{$totalAscentFormatted} m</td>
                            <td class=\"text-center font-mono\">{$totalWalkFormatted}</td>
                            <td class=\"text-center font-mono\">{$totalStopsFormatted}</td>
                            <td class=\"text-center font-mono font-bold\">{$totalExpedFormatted}</td>
                            <td class=\"text-center font-mono\">{$settingOut}</td>
                            <td class=\"text-center font-mono font-bold\">{$currentDepart}</td>
                            <td colspan=\"2\"></td>
                        </tr>
                    </tbody>
                </table>

                <!-- Emergency Plan & Abort Strategy -->
                <div class=\"emergency-box\">
                    <div class=\"emergency-title\">Emergency Plan &amp; Abort Strategy</div>
                    <div>" . ( ! empty( $emergency ) ? nl2br( $emergency ) : 'Standard DofE safety procedure: retrace steps to last confirmed checkpoint or follow natural valley drainage down to nearest road or inhabited building. Primary contact: Leader (' . $superPhone . '). If life-threatening: 999 or 112 (ask for Police then Mountain Rescue).' ) . "</div>
                </div>

                <div class=\"page-footer-notice\">
                    Official DofE Expedition Route Card &mdash; Emergency Contact: {$superPhone}
                </div>
            </div>
        ";

        return $dayHtml;
    }

    /**
     * Generates PDF binary using Dompdf.
     *
     * @param array<string, mixed>|array<int, array<string, mixed>> $cardOrCards Single card array or array of day cards
     */
    public static function generate_pdf( array $cardOrCards ): string {
        $html = self::generate_html( $cardOrCards );

        $options = new Options();
        $options->set( 'isRemoteEnabled', true );
        $options->set( 'isHtml5ParserEnabled', true );
        $options->setDefaultFont( 'sans-serif' );

        $dompdf = new Dompdf( $options );
        $dompdf->setPaper( 'A4', 'landscape' );
        $dompdf->loadHtml( $html );
        $dompdf->render();

        return (string) $dompdf->output();
    }

    /**
     * Streams PDF directly to the browser for inline viewing in a new tab.
     *
     * @param array<string, mixed>|array<int, array<string, mixed>> $cardOrCards
     */
    public static function stream_pdf( array $cardOrCards, string $filename = '' ): void {
        $cards = isset( $cardOrCards['day_number'] ) || isset( $cardOrCards['legs_data'] ) || isset( $cardOrCards['legs'] ) || isset( $cardOrCards['route_data'] )
            ? [ $cardOrCards ]
            : $cardOrCards;

        $firstCard = $cards[0] ?? [];
        $dayNumber = (int) ( $firstCard['day_number'] ?? 1 );
        $isMultiDay = count( $cards ) > 1;

        if ( empty( $filename ) ) {
            $filename = $isMultiDay
                ? 'dofe-expedition-route-card-all-days.pdf'
                : "dofe-route-card-day-{$dayNumber}.pdf";
        }

        try {
            $pdfBytes = self::generate_pdf( $cards );

            if ( ! headers_sent() ) {
                header( 'Content-Type: application/pdf' );
                header( 'Content-Disposition: inline; filename="' . esc_attr( $filename ) . '"' );
                header( 'Cache-Control: private, no-store, must-revalidate' );
                header( 'Pragma: no-cache' );
                header( 'Expires: 0' );
                header( 'Content-Length: ' . strlen( $pdfBytes ) );
            }

            echo $pdfBytes;
            exit;
        } catch ( Throwable $e ) {
            wp_die( 'PDF Generation error: ' . esc_html( $e->getMessage() ), 'PDF Error', [ 'response' => 500 ] );
        }
    }

    private static function add_minutes_to_time( string $timeStr, int $minutesToAdd ): string {
        $parts = explode( ':', $timeStr );
        $h = isset( $parts[0] ) ? (int) $parts[0] : 9;
        $m = isset( $parts[1] ) ? (int) $parts[1] : 0;

        $total = $h * 60 + $m + $minutesToAdd;
        $total = ( ( $total % 1440 ) + 1440 ) % 1440;

        $outH = (int) floor( $total / 60 );
        $outM = $total % 60;

        return sprintf( '%02d:%02d', $outH, $outM );
    }

    private static function format_hours_mins( int $totalMinutes ): string {
        $h = (int) floor( $totalMinutes / 60 );
        $m = $totalMinutes % 60;

        if ( $h === 0 ) {
            return "{$m}m";
        }

        return "{$h}h " . sprintf( '%02dm', $m );
    }
}
