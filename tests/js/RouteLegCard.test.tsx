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
});
