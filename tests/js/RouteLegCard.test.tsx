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

describe('RouteLegCard Checkpoint Linking & ReadOnly Behavior', () => {
    it('renders "From" as editable and "To" as read-only for intermediate legs', () => {
        const onUpdateLeg = vi.fn();
        render(
            <RouteLegCard
                leg={mockLeg1}
                isActive={true}
                isLastLeg={false}
                nextLegStartName="High Pass"
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

        // Check "To" input is read-only for intermediate leg
        const toInput = screen.getByPlaceholderText('End point') as HTMLInputElement;
        expect(toInput.readOnly).toBe(true);
        expect(toInput.value).toBe('High Pass');
        expect(toInput).toHaveClass('ems-endpoint-input--readonly');
    });

    it('renders "To" as fully editable on the last leg', () => {
        const onUpdateLeg = vi.fn();
        render(
            <RouteLegCard
                leg={mockLeg1}
                isActive={false}
                isLastLeg={true}
                onSelect={vi.fn()}
                onUpdateLeg={onUpdateLeg}
                onSplitLeg={vi.fn()}
                onMergeLeg={vi.fn()}
            />
        );

        // Both inputs should be editable on the final leg
        const fromInput = screen.getByPlaceholderText('Start point') as HTMLInputElement;
        const toInput = screen.getByPlaceholderText('End point') as HTMLInputElement;

        expect(fromInput.readOnly).toBe(false);
        expect(toInput.readOnly).toBe(false);
        expect(toInput).not.toHaveClass('ems-endpoint-input--readonly');

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
