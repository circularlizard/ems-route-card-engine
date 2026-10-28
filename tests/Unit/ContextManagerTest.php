<?php
/**
 * Tests for Context_Manager.
 */

declare(strict_types=1);

namespace EMSRoute\Tests\Unit;

use EMSRoute\Tests\TestCase;
use EMSRoute\Core\Context\Context_Manager;
use Brain\Monkey\Filters;

class ContextManagerTest extends TestCase {
    private Context_Manager $manager;

    protected function setUp(): void {
        parent::setUp();
        $this->manager = new Context_Manager();
    }

    public function test_get_context_returns_standalone_fallback_when_ems_inactive(): void {
        $context = $this->manager->getContext( 10, 20, 1 );

        $this->assertSame( 10, $context['expedition_id'] );
        $this->assertSame( 20, $context['team_id'] );
        $this->assertTrue( $context['is_standalone'] );
        $this->assertSame( 'Bronze', $context['level'] );
        $this->assertSame( 2, $context['total_days'] );
        $this->assertNotEmpty( $context['team_members'] );
    }

    public function test_get_context_uses_filtered_data_when_ems_active(): void {
        Filters\expectApplied( 'ems_get_route_card_context' )
            ->once()
            ->andReturn( [
                'expedition_name' => 'Pentlands Gold Practice',
                'level'           => 'Gold',
                'total_days'      => 4,
                'team_name'       => 'Stag Patrol',
                'team_members'    => [ 'Alice', 'Bob', 'Charlie', 'Dave' ],
                'supervisor_name' => 'John Muir',
            ] );

        $context = $this->manager->getContext( 101, 202, 5 );

        $this->assertFalse( $context['is_standalone'] );
        $this->assertSame( 'Pentlands Gold Practice', $context['expedition_name'] );
        $this->assertSame( 'Gold', $context['level'] );
        $this->assertSame( 4, $context['total_days'] );
        $this->assertSame( 'Stag Patrol', $context['team_name'] );
        $this->assertSame( 'John Muir', $context['supervisor_name'] );
    }
}
