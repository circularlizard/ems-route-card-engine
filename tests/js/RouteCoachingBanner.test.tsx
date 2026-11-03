import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RouteCoachingBanner } from '../../resources/js/components/RouteCoachingBanner';
import { RouteLeg } from '../../resources/js/types/route-card';

const createLeg = (legNumber: number, overrides: Partial<RouteLeg> = {}): RouteLeg => ({
    leg_number: legNumber,
    start_vertex_index: (legNumber - 1) * 10,
    end_vertex_index: legNumber * 10,
    start_name: `Point ${legNumber}`,
    end_name: `Point ${legNumber + 1}`,
    start_desc: '',
    end_desc: '',
    start_grid_ref: 'NN 100 200',
    end_grid_ref: 'NN 110 210',
    start_elevation_m: 100,
    end_elevation_m: 200,
    distance_km: 2.0,
    ascent_m: 100,
    descent_m: 50,
    grid_bearing: 90,
    magnetic_bearing: 90,
    walking_minutes: 60,
    rest_minutes: 10,
    activity_minutes: 0,
    activity_notes: '',
    flat_override: false,
    route_description: 'Follow clear footpath along river bank northwards',
    escape_route: 'Exit east along farm track to road',
    ...overrides,
});

describe('RouteCoachingBanner Issue Identification & Clickable Leg Navigation', () => {
    it('displays "Issues with legs 1, 5, 9" and calls onSelectLeg when clicked', () => {
        const onSelectLeg = vi.fn();
        const legs: RouteLeg[] = [
            createLeg(1, { route_description: '' }), // Issue: missing notes
            createLeg(2), // Clean
            createLeg(3), // Clean
            createLeg(4), // Clean
            createLeg(5, { distance_km: 4.5 }), // Issue: long leg
            createLeg(6), // Clean
            createLeg(7), // Clean
            createLeg(8), // Clean
            createLeg(9, { escape_route: '' }), // Issue: missing escape route
        ];

        render(
            <RouteCoachingBanner
                legs={legs}
                totalWalkingMinutes={540} // 9 hours -> meets min silver 7h
                totalRestMinutes={90}
                onSelectLeg={onSelectLeg}
            />
        );

        // Header text must say "Issues with legs"
        expect(screen.getByText(/Issues with legs/i)).toBeInTheDocument();

        // Clickable buttons for 1, 5, 9
        const btn1 = screen.getByRole('button', { name: '1' });
        const btn5 = screen.getByRole('button', { name: '5' });
        const btn9 = screen.getByRole('button', { name: '9' });

        expect(btn1).toBeInTheDocument();
        expect(btn5).toBeInTheDocument();
        expect(btn9).toBeInTheDocument();

        // Clicking 1 calls onSelectLeg(0)
        fireEvent.click(btn1);
        expect(onSelectLeg).toHaveBeenCalledWith(0);

        // Clicking 5 calls onSelectLeg(4)
        fireEvent.click(btn5);
        expect(onSelectLeg).toHaveBeenCalledWith(4);

        // Clicking 9 calls onSelectLeg(8)
        fireEvent.click(btn9);
        expect(onSelectLeg).toHaveBeenCalledWith(8);
    });

    it('displays singular "Issues with leg 1" when only leg 1 has issues', () => {
        const onSelectLeg = vi.fn();
        const legs: RouteLeg[] = [
            createLeg(1, { route_description: '' }),
            createLeg(2),
        ];

        render(
            <RouteCoachingBanner
                legs={legs}
                totalWalkingMinutes={450}
                totalRestMinutes={30}
                onSelectLeg={onSelectLeg}
            />
        );

        expect(screen.getByText(/Issues with leg/i)).toBeInTheDocument();
        const btn1 = screen.getByRole('button', { name: '1' });
        expect(btn1).toBeInTheDocument();
    });

    it('displays pre-flight success when all legs meet requirements', () => {
        const legs: RouteLeg[] = [
            createLeg(1),
            createLeg(2),
        ];

        render(
            <RouteCoachingBanner
                legs={legs}
                totalWalkingMinutes={450}
                totalRestMinutes={30}
            />
        );

        expect(screen.getByText(/Pre-Flight Checks Passed/i)).toBeInTheDocument();
    });
});
