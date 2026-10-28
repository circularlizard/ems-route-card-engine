<?php
/**
 * Context Provider Interface.
 */

declare(strict_types=1);

namespace EMSRoute\Core\Context;

interface Context_Provider_Interface {
    /**
     * Retrieves expedition, team, and roster context.
     *
     * @param int $expeditionId
     * @param int $teamId
     * @param int $userId
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
    public function getContext( int $expeditionId, int $teamId, int $userId ): array;
}
