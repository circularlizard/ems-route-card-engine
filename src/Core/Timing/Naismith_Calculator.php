<?php
/**
 * Naismith & Langmuir Rule Timing Calculator.
 *
 * Implements standard expedition walking timing:
 * - Naismith's Rule: 5 km/h base speed (12 min/km) + 1 min per 10m ascent.
 * - Langmuir corrections: +/- 10 min per 300m descent based on slope angle.
 * - Flat override support for tunnels/viaducts.
 */

declare(strict_types=1);

namespace EMSRoute\Core\Timing;

use InvalidArgumentException;

class Naismith_Calculator {
    public const DEFAULT_SPEED_KMH = 5.0; // Standard DofE walking pace

    /**
     * Calculates leg timing breakdown according to Naismith/Langmuir rules.
     *
     * @param float $distanceMetres Horizontal distance in metres
     * @param float $ascentMetres Cumulative elevation gained in metres
     * @param float $descentMetres Cumulative elevation lost in metres
     * @param int $restMinutes Static rest / break time at checkpoint in minutes
     * @param int $explorationMinutes Project / exploration / study time in minutes
     * @param bool $flatOverride If true, bypasses elevation climb (tunnel/viaduct override)
     * @param float $speedKmH Base horizontal speed in km/h (default: 5.0)
     * @return array{
     *     distance_km: float,
     *     ascent_m: float,
     *     descent_m: float,
     *     base_walk_minutes: int,
     *     climb_minutes: int,
     *     descent_correction_minutes: int,
     *     total_walking_minutes: int,
     *     rest_minutes: int,
     *     exploration_minutes: int,
     *     total_leg_minutes: int
     * }
     */
    public function calculateLeg(
        float $distanceMetres,
        float $ascentMetres,
        float $descentMetres = 0.0,
        int $restMinutes = 0,
        int $explorationMinutes = 0,
        bool $flatOverride = false,
        float $speedKmH = self::DEFAULT_SPEED_KMH
    ): array {
        if ( $speedKmH <= 0.0 ) {
            $speedKmH = self::DEFAULT_SPEED_KMH;
        }

        $distanceKm = max( 0.0, $distanceMetres / 1000.0 );
        $ascentM    = max( 0.0, $ascentMetres );
        $descentM   = max( 0.0, $descentMetres );

        // 1. Horizontal distance time: (km / speed) * 60
        $baseWalkMins = ( $distanceKm / $speedKmH ) * 60.0;

        // 2. Naismith ascent time: 1 min per 10m climb (0.1 min/m)
        $climbMins = $flatOverride ? 0.0 : ( $ascentM / 10.0 );

        // 3. Langmuir descent correction
        $descentCorrectionMins = 0.0;
        if ( ! $flatOverride && $distanceMetres > 0.0 && $descentM > 0.0 ) {
            $gradient = $descentM / $distanceMetres;

            if ( $gradient > 0.20 ) {
                // Steep descent (> 1:5 slope, > 12°): add 10 min per 300m descent
                $descentCorrectionMins = ( $descentM / 300.0 ) * 10.0;
            } elseif ( $gradient >= 0.08 && $gradient <= 0.20 ) {
                // Gentle descent (5° to 12°): subtract 10 min per 300m descent
                $descentCorrectionMins = -( ( $descentM / 300.0 ) * 10.0 );
            }
        }

        $totalWalkMins = max( 0, (int) round( $baseWalkMins + $climbMins + $descentCorrectionMins ) );
        $totalLegMins  = $totalWalkMins + max( 0, $restMinutes ) + max( 0, $explorationMinutes );

        return [
            'distance_km'                => round( $distanceKm, 2 ),
            'ascent_m'                   => round( $ascentM, 1 ),
            'descent_m'                  => round( $descentM, 1 ),
            'base_walk_minutes'          => (int) round( $baseWalkMins ),
            'climb_minutes'              => (int) round( $climbMins ),
            'descent_correction_minutes' => (int) round( $descentCorrectionMins ),
            'total_walking_minutes'      => $totalWalkMins,
            'rest_minutes'               => max( 0, $restMinutes ),
            'exploration_minutes'        => max( 0, $explorationMinutes ),
            'total_leg_minutes'          => $totalLegMins,
        ];
    }

    /**
     * Formats total minutes into readable hours and minutes (e.g. 75 -> "1h 15m", 35 -> "35m").
     */
    public function formatMinutes( int $minutes ): string {
        if ( $minutes <= 0 ) {
            return '0m';
        }

        $h = intdiv( $minutes, 60 );
        $m = $minutes % 60;

        if ( 0 === $h ) {
            return "{$m}m";
        }
        if ( 0 === $m ) {
            return "{$h}h";
        }

        return "{$h}h {$m}m";
    }

    /**
     * Calculates ETA time string by adding cumulative minutes to a start time (e.g. "09:00" + 75m -> "10:15").
     */
    public function calculateEta( string $startTime, int $cumulativeMinutes ): string {
        $parts = explode( ':', trim( $startTime ) );
        $startH = isset( $parts[0] ) ? (int) $parts[0] : 9;
        $startM = isset( $parts[1] ) ? (int) $parts[1] : 0;

        $totalMinutesFromMidnight = ( $startH * 60 + $startM + $cumulativeMinutes ) % 1440;
        $etaH = intdiv( $totalMinutesFromMidnight, 60 );
        $etaM = $totalMinutesFromMidnight % 60;

        return sprintf( '%02d:%02d', $etaH, $etaM );
    }
}
