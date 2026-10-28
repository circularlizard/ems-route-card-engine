<?php
/**
 * Context Manager for EMS Integration & Standalone Fallback.
 *
 * Implements the Provider Pattern: queries WordPress filter 'ems_get_route_card_context'
 * when integrated with core EMS, falling back gracefully to a fully editable
 * standalone context structure when running independently.
 */

declare(strict_types=1);

namespace EMSRoute\Core\Context;

class Context_Manager implements Context_Provider_Interface {
    /**
     * Resolves context using WordPress filter or standalone fallback.
     */
    public function getContext( int $expeditionId, int $teamId, int $userId ): array {
        // Query core EMS filter hook if active
        $filteredContext = apply_filters(
            'ems_get_route_card_context',
            null,
            $expeditionId,
            $teamId,
            $userId
        );

        if ( is_array( $filteredContext ) && ! empty( $filteredContext ) ) {
            return array_merge( $this->getDefaultStandaloneContext( $expeditionId, $teamId ), $filteredContext, [
                'is_standalone' => false,
            ] );
        }

        return $this->getDefaultStandaloneContext( $expeditionId, $teamId );
    }

    /**
     * Returns editable default context for standalone mode or testing harness.
     *
     * @return array{
     *     expedition_id: int,
     *     team_id: int,
     *     expedition_name: string,
     *     level: string,
     *     mode_of_travel: string,
     *     total_days: int,
     *     dates: array<int, string>,
     *     team_name: string,
     *     team_members: array<int, string>,
     *     supervisor_name: string,
     *     supervisor_phone: string,
     *     emergency_contact: string,
     *     is_standalone: bool
     * }
     */
    public function getDefaultStandaloneContext( int $expeditionId = 0, int $teamId = 0 ): array {
        $today = date( 'Y-m-d' );
        $tomorrow = date( 'Y-m-d', strtotime( '+1 day' ) );

        return [
            'expedition_id'     => $expeditionId,
            'team_id'           => $teamId,
            'expedition_name'   => 'Standalone DofE Expedition',
            'level'             => 'Bronze',
            'mode_of_travel'    => 'Foot',
            'total_days'        => 2,
            'dates'             => [ $today, $tomorrow ],
            'team_name'         => 'Team 1',
            'team_members'      => [ 'Explorer 1', 'Explorer 2', 'Explorer 3', 'Explorer 4' ],
            'supervisor_name'   => 'Expedition Supervisor',
            'supervisor_phone'  => '07700 900000',
            'emergency_contact' => 'Basecamp Control (0131 000 0000)',
            'is_standalone'     => true,
        ];
    }
}
