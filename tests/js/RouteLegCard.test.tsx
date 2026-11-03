import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RouteLegCard } from '../../resources/js/components/RouteLegCard';
import { RouteLeg } from '../../resources/js/types/route-card';

const mockLeg1: RouteLeg = {
    leg_number: 1,
    start_vertex_index: 0,
    end_vertex_index: 20,
    start_name: 'Trailhead',
    end_name: 'High Pass',
    start_desc: '',
    end_desc: '',
    start_grid_ref: 'NN 123 456',
    end_grid_ref: 'NN 140 470',
    start_elevation_m: 100,
    end_elevation_m: 500,
    distance_km: 4.2,
    ascent_m: 400,
    descent_m: 0,
    grid_bearing: 50,
    magnetic_bearing: 50,
    walking_minutes: 80,
    rest_minutes: 15,
    activity_minutes: 0,
    activity_notes: '',
    flat_override: false,
    route_description: 'Follow distinct gravel path up the valley',
    escape_route: 'Return along valley floor',
};

describe('RouteLegCard Checkpoint Vector & Editing Behavior', () => {
    it('renders "From" and "To" as editable inputs with leg badge and monospace subtext', () => {
        const onUpdateLeg = vi.fn();
        render(
            <RouteLegCard
                leg={mockLeg1}
                isActive={true}
                isLastLeg={false}
                onSelect={vi.fn()}
                onUpdateLeg={onUpdateLeg}
                onSplitLeg={vi.fn()}
                onMergeLeg={vi.fn()}
            />
        );

        // Check leg number badge is displayed
        expect(screen.getByText('1')).toHaveClass('ems-leg-number-badge');

        // Check "From" input is editable
        const fromInput = screen.getByPlaceholderText('Start point') as HTMLInputElement;
        expect(fromInput.readOnly).toBe(false);
        expect(fromInput.value).toBe('Trailhead');

        // Check "To" input is editable for waypoint sync
        const toInput = screen.getByPlaceholderText('End point') as HTMLInputElement;
        expect(toInput.readOnly).toBe(false);
        expect(toInput.value).toBe('High Pass');

        // Check monospace grid ref and elevation subtext are rendered
        expect(screen.getByText(/NN 123 456 • 100m/i)).toBeInTheDocument();
        expect(screen.getByText(/NN 140 470 • 500m/i)).toBeInTheDocument();
    });

    it('renders "To" and fires onUpdateLeg with new end_name when edited', () => {
        const onUpdateLeg = vi.fn();
        render(
            <RouteLegCard
                leg={mockLeg1}
                isActive={false}
                isLastLeg={false}
                onSelect={vi.fn()}
                onUpdateLeg={onUpdateLeg}
                onSplitLeg={vi.fn()}
                onMergeLeg={vi.fn()}
            />
        );

        const toInput = screen.getByPlaceholderText('End point') as HTMLInputElement;
        expect(toInput.readOnly).toBe(false);

        // Editing "To" fires onUpdateLeg with new end_name
        fireEvent.change(toInput, { target: { value: 'Campsite B' } });
        expect(onUpdateLeg).toHaveBeenCalledWith(
            expect.objectContaining({
                end_name: 'Campsite B',
            })
        );
    });

    it('edits "From" and fires onUpdateLeg with new start_name', () => {
        const onUpdateLeg = vi.fn();
        render(
            <RouteLegCard
                leg={mockLeg1}
                isActive={true}
                isLastLeg={false}
                onSelect={vi.fn()}
                onUpdateLeg={onUpdateLeg}
                onSplitLeg={vi.fn()}
                onMergeLeg={vi.fn()}
            />
        );

        const fromInput = screen.getByPlaceholderText('Start point') as HTMLInputElement;
        fireEvent.change(fromInput, { target: { value: 'Bridge Car Park' } });

        expect(onUpdateLeg).toHaveBeenCalledWith(
            expect.objectContaining({
                start_name: 'Bridge Car Park',
            })
        );
    });

    it('does not render "Split Leg" or "Merge with Next" buttons in the card header', () => {
        render(
            <RouteLegCard
                leg={mockLeg1}
                isActive={true}
                isLastLeg={false}
                onSelect={vi.fn()}
                onUpdateLeg={vi.fn()}
            />
        );

        expect(screen.queryByRole('button', { name: /Split Leg/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Merge with Next/i })).not.toBeInTheDocument();
    });

    it('renders contextual warnings: long leg (>3.5km), route notes, and escape route', () => {
        // mockLeg1 has distance 4.2km (>3.5km), route_description >= 15 chars, escape_route populated
        const { rerender } = render(
            <RouteLegCard
                leg={mockLeg1}
                isActive={true}
                isLastLeg={false}
                onSelect={vi.fn()}
                onUpdateLeg={vi.fn()}
            />
        );

        // Long leg warning should be present because distance is 4.2 km
        expect(screen.getByText(/Leg > 3.5 km/i)).toBeInTheDocument();

        // ROUTE NOTES and ESCAPE ROUTE are populated, so no field warnings
        expect(screen.queryByText(/Add route notes/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Add escape route/i)).not.toBeInTheDocument();

        // Rerender with empty notes and escape route, short distance (2.0 km)
        const emptyLeg: RouteLeg = {
            ...mockLeg1,
            distance_km: 2.0,
            route_description: '',
            escape_route: '',
            rest_minutes: 0,
            activity_notes: '',
        };

        rerender(
            <RouteLegCard
                leg={emptyLeg}
                isActive={true}
                isLastLeg={false}
                onSelect={vi.fn()}
                onUpdateLeg={vi.fn()}
            />
        );

        // Long leg warning should NOT be present
        expect(screen.queryByText(/Leg > 3.5 km/i)).not.toBeInTheDocument();

        // Field warnings should be visible
        expect(screen.getByText(/Add route notes/i)).toBeInTheDocument();
        expect(screen.getByText(/Add escape route/i)).toBeInTheDocument();

        // When route notes has short text (< 15 chars)
        const shortLeg: RouteLeg = {
            ...emptyLeg,
            route_description: 'Follow path',
        };

        rerender(
            <RouteLegCard
                leg={shortLeg}
                isActive={true}
                isLastLeg={false}
                onSelect={vi.fn()}
                onUpdateLeg={vi.fn()}
            />
        );

        expect(screen.getByText(/Add bearings, paths or landmarks/i)).toBeInTheDocument();
        expect(screen.queryByText(/Add route notes/i)).not.toBeInTheDocument();
    });

    it('renders STOPS (MIN) label and handles stop / aim activity disclosure', () => {
        // When stops == 0 and activity notes empty, render ghost button
        const zeroStopsLeg: RouteLeg = {
            ...mockLeg1,
            rest_minutes: 0,
            activity_notes: '',
        };

        render(
            <RouteLegCard
                leg={zeroStopsLeg}
                isActive={true}
                isLastLeg={false}
                onSelect={vi.fn()}
                onUpdateLeg={vi.fn()}
            />
        );

        // STOPS (MIN) label
        expect(screen.getByText('STOPS (MIN)')).toBeInTheDocument();

        // Ghost button to add activity
        const ghostBtn = screen.getByRole('button', { name: /\+ Add stop or aim activity/i });
        expect(ghostBtn).toBeInTheDocument();

        // Clicking ghost button reveals STOP / AIM ACTIVITY textarea
        fireEvent.click(ghostBtn);
        expect(screen.getByText('STOP / AIM ACTIVITY')).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/Expedition aim/i)).toBeInTheDocument();
    });

    it('only displays the dot in the collapsed leg header when there is an issue', () => {
        // Complete leg with distance <= 3.5 km and full notes & escape
        const completeLeg: RouteLeg = {
            ...mockLeg1,
            distance_km: 2.5,
            route_description: 'Follow distinct gravel path up the valley to high col',
            escape_route: 'Return along valley floor to trailhead',
        };

        const { rerender } = render(
            <RouteLegCard
                leg={completeLeg}
                isActive={false}
                isExpanded={false}
                isLastLeg={false}
                onSelect={vi.fn()}
                onUpdateLeg={vi.fn()}
            />
        );

        // No dot should be rendered for complete leg
        expect(screen.queryByText('●')).not.toBeInTheDocument();

        // Incomplete leg (missing escape route)
        const issueLeg: RouteLeg = {
            ...completeLeg,
            escape_route: '',
        };

        rerender(
            <RouteLegCard
                leg={issueLeg}
                isActive={false}
                isExpanded={false}
                isLastLeg={false}
                onSelect={vi.fn()}
                onUpdateLeg={vi.fn()}
            />
        );

        // Amber dot should be rendered when there is an issue
        const dot = screen.getByText('●');
        expect(dot).toBeInTheDocument();
        expect(dot).toHaveClass('ems-leg-status-dot--incomplete');
    });
});
