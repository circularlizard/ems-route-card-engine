<?php
/**
 * Route Card Database Repository.
 *
 * Handles CRUD persistence to wp_dofe_route_cards with optimistic concurrency locking.
 */

declare(strict_types=1);

namespace EMSRoute\Core\Storage;

use RuntimeException;
use InvalidArgumentException;

class Route_Card_Repository {
    public const STATUS_DRAFT             = 'draft';
    public const STATUS_SUBMITTED         = 'submitted';
    public const STATUS_CHANGES_REQUESTED = 'changes_requested';
    public const STATUS_APPROVED          = 'approved';

    public const VALID_STATUSES = [
        self::STATUS_DRAFT,
        self::STATUS_SUBMITTED,
        self::STATUS_CHANGES_REQUESTED,
        self::STATUS_APPROVED,
    ];

    private string $tableName;

    public function __construct( ?string $tableName = null ) {
        if ( null !== $tableName ) {
            $this->tableName = $tableName;
        } else {
            global $wpdb;
            $this->tableName = isset( $wpdb ) ? ( $wpdb->prefix . 'dofe_route_cards' ) : 'wp_dofe_route_cards';
        }
    }

    public function getTableName(): string {
        return $this->tableName;
    }

    /**
     * Finds a single route card by its primary ID.
     *
     * @return array<string, mixed>|null
     */
    public function get( int $id ): ?array {
        global $wpdb;
        if ( ! isset( $wpdb ) ) {
            return null;
        }

        $row = $wpdb->get_row(
            $wpdb->prepare( "SELECT * FROM {$this->tableName} WHERE id = %d", $id ),
            ARRAY_A
        );

        if ( ! is_array( $row ) ) {
            return null;
        }

        return $this->hydrateRow( $row );
    }

    /**
     * Finds a route card by expedition, team, and day number.
     *
     * @return array<string, mixed>|null
     */
    public function findByExpeditionTeamDay( int $expeditionId, int $teamId, int $dayNumber ): ?array {
        global $wpdb;
        if ( ! isset( $wpdb ) ) {
            return null;
        }

        $row = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT * FROM {$this->tableName} WHERE expedition_id = %d AND team_id = %d AND day_number = %d",
                $expeditionId,
                $teamId,
                $dayNumber
            ),
            ARRAY_A
        );

        if ( ! is_array( $row ) ) {
            return null;
        }

        return $this->hydrateRow( $row );
    }

    /**
     * Saves or updates a route card with optimistic concurrency protection.
     *
     * @param array<string, mixed> $data
     * @param string|null $expectedUpdatedAt
     * @return array<string, mixed>
     */
    public function save( array $data, ?string $expectedUpdatedAt = null ): array {
        global $wpdb;
        if ( ! isset( $wpdb ) ) {
            throw new RuntimeException( 'WordPress database ($wpdb) is not available.' );
        }

        $now = current_time( 'mysql' );
        $id  = isset( $data['id'] ) ? (int) $data['id'] : 0;

        if ( $id > 0 ) {
            // Optimistic concurrency check
            if ( ! empty( $expectedUpdatedAt ) ) {
                $currentRow = $wpdb->get_row(
                    $wpdb->prepare( "SELECT updated_at FROM {$this->tableName} WHERE id = %d", $id ),
                    ARRAY_A
                );

                if ( is_array( $currentRow ) && isset( $currentRow['updated_at'] ) ) {
                    if ( $currentRow['updated_at'] !== $expectedUpdatedAt ) {
                        throw new RuntimeException(
                            sprintf(
                                'Concurrent edit conflict: this route card was updated by another team member at %s. Please reload to review their changes.',
                                $currentRow['updated_at']
                            )
                        );
                    }
                }
            }

            $updateFields = [
                'updated_at' => $now,
            ];

            if ( isset( $data['route_title'] ) ) {
                $updateFields['route_title'] = sanitize_text_field( (string) $data['route_title'] );
            }
            if ( isset( $data['header_data'] ) ) {
                $updateFields['header_data'] = is_string( $data['header_data'] )
                    ? $data['header_data']
                    : ( wp_json_encode( $data['header_data'] ) ?: '{}' );
            }
            if ( isset( $data['route_data'] ) ) {
                $updateFields['route_data'] = is_string( $data['route_data'] )
                    ? $data['route_data']
                    : ( wp_json_encode( $data['route_data'] ) ?: '{}' );
            }
            if ( isset( $data['status'] ) && in_array( $data['status'], self::VALID_STATUSES, true ) ) {
                $updateFields['status'] = $data['status'];
            }

            $wpdb->update(
                $this->tableName,
                $updateFields,
                [ 'id' => $id ],
                null,
                [ '%d' ]
            );

            $saved = $this->get( $id );
            if ( null === $saved ) {
                throw new RuntimeException( 'Failed to retrieve route card after update.' );
            }
            return $saved;
        }

        // Insert new record
        $insertData = [
            'expedition_id' => (int) ( $data['expedition_id'] ?? 0 ),
            'team_id'       => (int) ( $data['team_id'] ?? 0 ),
            'day_number'    => (int) ( $data['day_number'] ?? 1 ),
            'route_title'   => sanitize_text_field( (string) ( $data['route_title'] ?? 'Route Card' ) ),
            'header_data'   => isset( $data['header_data'] )
                ? ( is_string( $data['header_data'] ) ? $data['header_data'] : ( wp_json_encode( $data['header_data'] ) ?: '{}' ) )
                : null,
            'route_data'    => isset( $data['route_data'] )
                ? ( is_string( $data['route_data'] ) ? $data['route_data'] : ( wp_json_encode( $data['route_data'] ) ?: '{}' ) )
                : '{}',
            'status'        => in_array( $data['status'] ?? '', self::VALID_STATUSES, true ) ? $data['status'] : self::STATUS_DRAFT,
            'created_at'    => $now,
            'updated_at'    => $now,
        ];

        $wpdb->insert( $this->tableName, $insertData );
        $newId = (int) $wpdb->insert_id;

        $saved = $this->get( $newId );
        if ( null === $saved ) {
            throw new RuntimeException( 'Failed to retrieve route card after insert.' );
        }
        return $saved;
    }

    /**
     * Updates route card status (draft, submitted, changes_requested, approved).
     */
    public function updateStatus( int $id, string $status, ?int $approvedBy = null ): bool {
        global $wpdb;
        if ( ! isset( $wpdb ) || ! in_array( $status, self::VALID_STATUSES, true ) ) {
            return false;
        }

        $now = current_time( 'mysql' );
        $fields = [
            'status'     => $status,
            'updated_at' => $now,
        ];

        if ( self::STATUS_APPROVED === $status ) {
            $fields['approved_by'] = $approvedBy ?? get_current_user_id();
            $fields['approved_at'] = $now;
        }

        $updated = $wpdb->update(
            $this->tableName,
            $fields,
            [ 'id' => $id ],
            null,
            [ '%d' ]
        );

        return false !== $updated;
    }

    /**
     * Updates compiled PDF file path on the record.
     */
    public function updatePdfPath( int $id, string $pdfPath ): bool {
        global $wpdb;
        if ( ! isset( $wpdb ) ) {
            return false;
        }

        $updated = $wpdb->update(
            $this->tableName,
            [
                'pdf_file_path' => sanitize_text_field( $pdfPath ),
                'updated_at'    => current_time( 'mysql' ),
            ],
            [ 'id' => $id ],
            [ '%s', '%s' ],
            [ '%d' ]
        );

        return false !== $updated;
    }

    /**
     * Deletes a route card.
     */
    public function delete( int $id ): bool {
        global $wpdb;
        if ( ! isset( $wpdb ) ) {
            return false;
        }

        $deleted = $wpdb->delete(
            $this->tableName,
            [ 'id' => $id ],
            [ '%d' ]
        );

        return false !== $deleted;
    }

    /**
     * Hydrates raw database row into decoded array.
     *
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function hydrateRow( array $row ): array {
        $row['id']            = (int) $row['id'];
        $row['expedition_id'] = (int) $row['expedition_id'];
        $row['team_id']       = (int) $row['team_id'];
        $row['day_number']    = (int) $row['day_number'];
        $row['approved_by']   = ! empty( $row['approved_by'] ) ? (int) $row['approved_by'] : null;

        // Decode JSON columns
        if ( ! empty( $row['header_data'] ) && is_string( $row['header_data'] ) ) {
            $row['header_data'] = json_decode( $row['header_data'], true );
        }
        if ( ! empty( $row['route_data'] ) && is_string( $row['route_data'] ) ) {
            $row['route_data'] = json_decode( $row['route_data'], true );
        }

        return $row;
    }
}
