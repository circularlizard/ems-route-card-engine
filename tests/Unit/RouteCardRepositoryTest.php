<?php
/**
 * Tests for Route_Card_Repository.
 */

declare(strict_types=1);

namespace EMSRoute\Tests\Unit;

use EMSRoute\Tests\TestCase;
use EMSRoute\Core\Storage\Route_Card_Repository;
use Mockery;
use RuntimeException;
use Brain\Monkey\Functions;

class RouteCardRepositoryTest extends TestCase {
    private Route_Card_Repository $repository;
    private $wpdbMock;

    protected function setUp(): void {
        parent::setUp();

        $this->wpdbMock = Mockery::mock( 'wpdb' );
        $this->wpdbMock->prefix = 'wp_';
        $GLOBALS['wpdb'] = $this->wpdbMock;

        Functions\when( 'current_time' )->justReturn( '2026-10-28 20:00:00' );
        Functions\when( 'wp_json_encode' )->alias( 'json_encode' );

        $this->repository = new Route_Card_Repository( 'wp_dofe_route_cards' );
    }

    protected function tearDown(): void {
        unset( $GLOBALS['wpdb'] );
        parent::tearDown();
    }

    public function test_get_hydrates_row_properly(): void {
        $rawRow = [
            'id'            => '42',
            'expedition_id' => '10',
            'team_id'       => '20',
            'day_number'    => '1',
            'route_title'   => 'Day 1 Route',
            'header_data'   => '{"level":"Bronze"}',
            'route_data'    => '{"legs":[]}',
            'status'        => 'draft',
            'approved_by'   => null,
            'approved_at'   => null,
            'pdf_file_path' => null,
            'created_at'    => '2026-10-28 10:00:00',
            'updated_at'    => '2026-10-28 12:00:00',
        ];

        $this->wpdbMock->shouldReceive( 'prepare' )
            ->once()
            ->with( 'SELECT * FROM wp_dofe_route_cards WHERE id = %d', 42 )
            ->andReturn( 'QUERY' );

        $this->wpdbMock->shouldReceive( 'get_row' )
            ->once()
            ->with( 'QUERY', ARRAY_A )
            ->andReturn( $rawRow );

        $card = $this->repository->get( 42 );

        $this->assertNotNull( $card );
        $this->assertSame( 42, $card['id'] );
        $this->assertSame( 10, $card['expedition_id'] );
        $this->assertSame( 20, $card['team_id'] );
        $this->assertSame( 'Bronze', $card['header_data']['level'] );
        $this->assertSame( [], $card['route_data']['legs'] );
    }

    public function test_save_optimistic_lock_throws_on_mismatch(): void {
        $this->wpdbMock->shouldReceive( 'prepare' )
            ->once()
            ->with( 'SELECT updated_at FROM wp_dofe_route_cards WHERE id = %d', 5 )
            ->andReturn( 'LOCK_QUERY' );

        $this->wpdbMock->shouldReceive( 'get_row' )
            ->once()
            ->with( 'LOCK_QUERY', ARRAY_A )
            ->andReturn( [ 'updated_at' => '2026-10-28 15:30:00' ] );

        $this->expectException( RuntimeException::class );
        $this->expectExceptionMessage( 'Concurrent edit conflict' );

        $this->repository->save(
            [ 'id' => 5, 'route_title' => 'Updated' ],
            '2026-10-28 14:00:00' // Expected was earlier than database!
        );
    }
}
