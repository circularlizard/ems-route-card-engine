<?php
/**
 * REST API Controller for Route Cards.
 */

declare(strict_types=1);

namespace EMSRoute\Core\REST;

use EMSRoute\Core\GPX\GPX_Enrichment_Service;
use EMSRoute\Core\Storage\Route_Card_Repository;
use EMSRoute\Core\Context\Context_Manager;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;
use WP_Error;
use Throwable;

class Route_Card_Controller {
    public const REST_NAMESPACE = 'ems-route/v1';

    private Route_Card_Repository $repository;
    private GPX_Enrichment_Service $gpxService;
    private Context_Manager $contextManager;

    public function __construct(
        ?Route_Card_Repository $repository = null,
        ?GPX_Enrichment_Service $gpxService = null,
        ?Context_Manager $contextManager = null
    ) {
        $this->repository     = $repository ?? new Route_Card_Repository();
        $this->gpxService     = $gpxService ?? new GPX_Enrichment_Service();
        $this->contextManager = $contextManager ?? new Context_Manager();
    }

    public function register_routes(): void {
        // Upload GPX and return enriched geometry
        register_rest_route( self::REST_NAMESPACE, '/upload-gpx', [
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => [ $this, 'upload_gpx' ],
                'permission_callback' => [ $this, 'check_authenticated_permission' ],
            ],
        ] );

        // Get Route Card for an expedition day
        register_rest_route( self::REST_NAMESPACE, '/card/(?P<expedition_id>\d+)/(?P<team_id>\d+)/(?P<day>\d+)', [
            [
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => [ $this, 'get_card' ],
                'permission_callback' => [ $this, 'check_authenticated_permission' ],
            ],
        ] );

        // Save Route Card draft
        register_rest_route( self::REST_NAMESPACE, '/card/(?P<id>\d+)/save', [
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => [ $this, 'save_card' ],
                'permission_callback' => [ $this, 'check_authenticated_permission' ],
            ],
        ] );

        // Submit Route Card for Leader Review
        register_rest_route( self::REST_NAMESPACE, '/card/(?P<id>\d+)/submit', [
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => [ $this, 'submit_card' ],
                'permission_callback' => [ $this, 'check_authenticated_permission' ],
            ],
        ] );

        // Leader Review (Request Changes or Approve)
        register_rest_route( self::REST_NAMESPACE, '/card/(?P<id>\d+)/review', [
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => [ $this, 'review_card' ],
                'permission_callback' => [ $this, 'check_leader_permission' ],
            ],
        ] );

        // Stream or generate PDF for route card
        register_rest_route( self::REST_NAMESPACE, '/card/(?P<id>\d+)/pdf', [
            [
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => [ $this, 'stream_pdf' ],
                'permission_callback' => [ $this, 'check_authenticated_permission' ],
            ],
        ] );

        // Stream or generate PDF by expedition context
        register_rest_route( self::REST_NAMESPACE, '/card/(?P<expedition_id>\d+)/(?P<team_id>\d+)/(?P<day>\d+)/pdf', [
            [
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => [ $this, 'stream_pdf_by_context' ],
                'permission_callback' => [ $this, 'check_authenticated_permission' ],
            ],
        ] );

        // Stream or generate PDF for all expedition days
        register_rest_route( self::REST_NAMESPACE, '/card/(?P<expedition_id>\d+)/(?P<team_id>\d+)/pdf', [
            [
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => [ $this, 'stream_expedition_pdf' ],
                'permission_callback' => [ $this, 'check_authenticated_permission' ],
            ],
        ] );

        // Direct PDF preview from posted route card state
        register_rest_route( self::REST_NAMESPACE, '/card/preview-pdf', [
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => [ $this, 'preview_pdf' ],
                'permission_callback' => [ $this, 'check_authenticated_permission' ],
            ],
        ] );
    }

    public function check_authenticated_permission(): bool {
        return is_user_logged_in() || current_user_can( 'edit_posts' );
    }

    public function check_leader_permission(): bool {
        if ( current_user_can( 'manage_options' ) ) {
            return true;
        }

        return (bool) apply_filters( 'ems_user_can_review_route_cards', current_user_can( 'edit_others_posts' ), get_current_user_id() );
    }

    /**
     * Uploads and enriches a GPX file.
     */
    public function upload_gpx( WP_REST_Request $request ): WP_REST_Response {
        $gpxContent = '';
        $files      = $request->get_file_params();

        if ( ! empty( $files['file'] ) && empty( $files['file']['error'] ) ) {
            $tmpPath    = $files['file']['tmp_name'];
            $gpxContent = file_get_contents( $tmpPath ) ?: '';
        } else {
            $gpxContent = (string) $request->get_body();
        }

        if ( empty( trim( $gpxContent ) ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'message' => 'No GPX content or file provided.',
            ], 400 );
        }

        try {
            $enriched = $this->gpxService->enrichGpx( $gpxContent );

            // Archive raw GPX if expedition and team are provided
            $expId = (int) $request->get_param( 'expedition_id' );
            $teamId = (int) $request->get_param( 'team_id' );
            $day    = (int) ( $request->get_param( 'day_number' ) ?: 1 );

            if ( $expId > 0 && $teamId > 0 ) {
                $this->archiveGpx( $gpxContent, $expId, $teamId, $day );
            }

            return new WP_REST_Response( [
                'success' => true,
                'data'    => $enriched,
            ], 200 );
        } catch ( Throwable $e ) {
            return new WP_REST_Response( [
                'success' => false,
                'message' => $e->getMessage(),
            ], 400 );
        }
    }

    /**
     * Retrieves saved card state along with expedition context.
     */
    public function get_card( WP_REST_Request $request ): WP_REST_Response {
        $expId  = (int) $request->get_param( 'expedition_id' );
        $teamId = (int) $request->get_param( 'team_id' );
        $day    = (int) $request->get_param( 'day' );

        $context   = $this->contextManager->getContext( $expId, $teamId, (int) get_current_user_id() );
        $routeCard = $this->repository->findByExpeditionTeamDay( $expId, $teamId, $day );

        return new WP_REST_Response( [
            'success'    => true,
            'context'    => $context,
            'route_card' => $routeCard,
        ], 200 );
    }

    /**
     * Saves route card draft with optimistic locking check.
     */
    public function save_card( WP_REST_Request $request ): WP_REST_Response {
        $id = (int) $request->get_param( 'id' );
        $params = $request->get_json_params();

        if ( ! is_array( $params ) ) {
            $params = $request->get_params();
        }

        $expectedUpdatedAt = isset( $params['expected_updated_at'] ) ? (string) $params['expected_updated_at'] : null;

        $routeData = $params['route_data'] ?? [];
        $legs      = $params['legs'] ?? ( $params['legs_data'] ?? [] );

        if ( ! is_array( $routeData ) ) {
            $routeData = [];
        }

        // If legs were passed directly at top-level, store them in route_data
        if ( ! empty( $legs ) && is_array( $legs ) ) {
            $routeData['legs']      = $legs;
            $routeData['legs_data'] = $legs;
        }

        if ( isset( $params['total_distance_km'] ) ) {
            $routeData['total_distance_km'] = (float) $params['total_distance_km'];
        }
        if ( isset( $params['total_ascent_m'] ) ) {
            $routeData['total_ascent_m'] = (float) $params['total_ascent_m'];
        }
        if ( isset( $params['estimated_walking_minutes'] ) ) {
            $routeData['estimated_walking_minutes'] = (int) $params['estimated_walking_minutes'];
        }

        $saveData = [
            'id'            => $id > 0 ? $id : null,
            'expedition_id' => (int) ( $params['expedition_id'] ?? 0 ),
            'team_id'       => (int) ( $params['team_id'] ?? 0 ),
            'day_number'    => (int) ( $params['day_number'] ?? 1 ),
            'route_title'   => sanitize_text_field( (string) ( $params['route_title'] ?? '' ) ),
            'header_data'   => $params['header_data'] ?? null,
            'route_data'    => $routeData,
            'status'        => Route_Card_Repository::STATUS_DRAFT,
        ];

        try {
            $saved = $this->repository->save( $saveData, $expectedUpdatedAt );

            return new WP_REST_Response( [
                'success'    => true,
                'card_id'    => $saved['id'],
                'message'    => 'Route card draft saved successfully.',
                'route_card' => $saved,
            ], 200 );
        } catch ( Throwable $e ) {
            return new WP_REST_Response( [
                'success' => false,
                'message' => $e->getMessage(),
            ], 409 ); // 409 Conflict for optimistic lock failure
        }
    }

    /**
     * Submits route card for leader review.
     */
    public function submit_card( WP_REST_Request $request ): WP_REST_Response {
        $id = (int) $request->get_param( 'id' );
        $card = $this->repository->get( $id );

        if ( null === $card ) {
            return new WP_REST_Response( [
                'success' => false,
                'message' => 'Route card not found.',
            ], 404 );
        }

        $this->repository->updateStatus( $id, Route_Card_Repository::STATUS_SUBMITTED );

        // Fire EMS action hook
        do_action(
            'ems_route_card_submitted',
            $id,
            $card['expedition_id'],
            $card['team_id'],
            $card['day_number']
        );

        return new WP_REST_Response( [
            'success'    => true,
            'message'    => 'Route card submitted for review.',
            'route_card' => $this->repository->get( $id ),
        ], 200 );
    }

    /**
     * Handles Leader review (Approve or Request Changes).
     */
    public function review_card( WP_REST_Request $request ): WP_REST_Response {
        $id = (int) $request->get_param( 'id' );
        $params = $request->get_json_params() ?: $request->get_params();

        $status   = sanitize_text_field( (string) ( $params['status'] ?? '' ) );
        $feedback = sanitize_textarea_field( (string) ( $params['feedback'] ?? '' ) );

        if ( ! in_array( $status, [ Route_Card_Repository::STATUS_APPROVED, Route_Card_Repository::STATUS_CHANGES_REQUESTED ], true ) ) {
            return new WP_REST_Response( [
                'success' => false,
                'message' => 'Invalid status. Must be "approved" or "changes_requested".',
            ], 400 );
        }

        $this->repository->updateStatus( $id, $status, (int) get_current_user_id() );

        // Fire review action
        do_action( 'ems_route_card_reviewed', $id, $status, $feedback );

        return new WP_REST_Response( [
            'success'    => true,
            'message'    => "Route card marked as {$status}.",
            'route_card' => $this->repository->get( $id ),
        ], 200 );
    }

    /**
     * Generates and streams PDF directly from posted route card state in real time.
     */
    public function preview_pdf( WP_REST_Request $request ): void {
        $params = $request->get_json_params();
        if ( ! is_array( $params ) ) {
            $params = $request->get_params();
        }

        $cards = [];
        if ( ! empty( $params['cards'] ) && is_array( $params['cards'] ) ) {
            $cards = $params['cards'];
        } elseif ( ! empty( $params['card'] ) && is_array( $params['card'] ) ) {
            $cards = [ $params['card'] ];
        } else {
            $cards = [ $params ];
        }

        \EMSRoute\Core\PDF\Route_Card_PDF_Generator::stream_pdf( $cards, 'dofe-expedition-route-card-preview.pdf' );
        exit;
    }

    /**
     * Streams on-demand generated PDF or static approved PDF for a route card by ID.
     */
    public function stream_pdf( WP_REST_Request $request ): WP_REST_Response {
        $id = (int) $request->get_param( 'id' );
        $card = $this->repository->get( $id );

        if ( ! $card ) {
            return new WP_REST_Response( [
                'success' => false,
                'message' => 'Route card not found.',
            ], 404 );
        }

        $allDays = ! empty( $request->get_param( 'all_days' ) );
        if ( $allDays && ! empty( $card['expedition_id'] ) && ! empty( $card['team_id'] ) ) {
            $cards = [];
            for ( $d = 1; $d <= 4; $d++ ) {
                $c = $this->repository->findByExpeditionTeamDay( (int) $card['expedition_id'], (int) $card['team_id'], $d );
                if ( $c && ( ! empty( $c['legs_data'] ) || ! empty( $c['legs'] ) || ! empty( $c['route_data'] ) ) ) {
                    $cards[] = $c;
                }
            }
            if ( ! empty( $cards ) ) {
                \EMSRoute\Core\PDF\Route_Card_PDF_Generator::stream_pdf( $cards, "dofe-expedition-route-card-all-days.pdf" );
                exit;
            }
        }

        \EMSRoute\Core\PDF\Route_Card_PDF_Generator::stream_pdf( $card );
        exit;
    }

    /**
     * Streams on-demand generated PDF by expedition, team, and day context.
     */
    public function stream_pdf_by_context( WP_REST_Request $request ): WP_REST_Response {
        $expeditionId = (int) $request->get_param( 'expedition_id' );
        $teamId       = (int) $request->get_param( 'team_id' );
        $day          = (int) $request->get_param( 'day' );
        $allDays      = ! empty( $request->get_param( 'all_days' ) );

        if ( $allDays ) {
            return $this->stream_expedition_pdf( $request );
        }

        $card = $this->repository->findByExpeditionTeamDay( $expeditionId, $teamId, $day );

        if ( ! $card ) {
            // Build default card from context so user always gets a valid 2-page route card
            $context = $this->contextManager->getContext( $expeditionId, $teamId, (int) get_current_user_id() );
            $card = [
                'day_number'  => $day,
                'route_title' => "Day {$day} Route",
                'header_data' => [
                    'aim'             => $context['expedition_name'],
                    'date'            => $context['dates'][ $day - 1 ] ?? date( 'Y-m-d' ),
                    'teamName'        => $context['team_name'],
                    'unitName'        => 'DofE Operating Authority',
                    'teamMembers'     => $context['team_members'],
                    'supervisorName'  => $context['supervisor_name'],
                    'supervisorPhone' => $context['supervisor_phone'],
                ],
                'legs_data'   => [],
            ];
        }

        \EMSRoute\Core\PDF\Route_Card_PDF_Generator::stream_pdf( $card );
        exit;
    }

    /**
     * Streams on-demand generated PDF for all days of an expedition.
     */
    public function stream_expedition_pdf( WP_REST_Request $request ): WP_REST_Response {
        $expeditionId = (int) $request->get_param( 'expedition_id' );
        $teamId       = (int) $request->get_param( 'team_id' );

        $cards = [];
        for ( $d = 1; $d <= 4; $d++ ) {
            $card = $this->repository->findByExpeditionTeamDay( $expeditionId, $teamId, $d );
            if ( $card && ( ! empty( $card['legs_data'] ) || ! empty( $card['legs'] ) || ! empty( $card['route_data'] ) ) ) {
                $cards[] = $card;
            }
        }

        if ( empty( $cards ) ) {
            // Check day 1 even if legs are empty
            $day1 = $this->repository->findByExpeditionTeamDay( $expeditionId, $teamId, 1 );
            if ( $day1 ) {
                $cards[] = $day1;
            } else {
                $context = $this->contextManager->getContext( $expeditionId, $teamId, (int) get_current_user_id() );
                $cards[] = [
                    'day_number'  => 1,
                    'route_title' => 'Day 1 Route',
                    'header_data' => [
                        'aim'         => $context['expedition_name'],
                        'teamName'    => $context['team_name'],
                        'teamMembers' => $context['team_members'],
                    ],
                    'legs_data'   => [],
                ];
            }
        }

        \EMSRoute\Core\PDF\Route_Card_PDF_Generator::stream_pdf( $cards, "dofe-expedition-{$expeditionId}-team-{$teamId}-all-days.pdf" );
        exit;
    }

    /**
     * Archives raw uploaded GPX file to wp-content/uploads/ems-routes/{exp}/{team}/day-{day}.gpx.
     */
    private function archiveGpx( string $content, int $expId, int $teamId, int $day ): void {
        $uploadDir = wp_upload_dir();
        $targetDir = $uploadDir['basedir'] . "/ems-routes/{$expId}/{$teamId}";

        if ( ! is_dir( $targetDir ) && ! mkdir( $targetDir, 0755, true ) && ! is_dir( $targetDir ) ) {
            return;
        }

        file_put_contents( "{$targetDir}/day-{$day}.gpx", $content );
    }
}
