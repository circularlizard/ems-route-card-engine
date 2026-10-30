import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { RouteElevationProfile } from '../../resources/js/components/RouteElevationProfile';
import { RouteLeg, RouteVertex } from '../../resources/js/types/route-card';

const mockVertices: RouteVertex[] = [
    {
        index: 0,
        lat: 56.5,
        lon: -4.5,
        easting: 200000,
        northing: 700000,
        grid_ref_6: 'NN 123 456',
        grid_ref_8: 'NN 1234 4567',
        ele_dem: 150,
        dist_from_start_m: 0,
        ascent_from_start_m: 0,
        descent_from_start_m: 0,
    },
    {
        index: 1,
        lat: 56.51,
        lon: -4.51,
        easting: 200500,
        northing: 700500,
        grid_ref_6: 'NN 128 461',
        grid_ref_8: 'NN 1280 4610',
        ele_dem: 280,
        dist_from_start_m: 2500,
        ascent_from_start_m: 130,
        descent_from_start_m: 0,
    },
    {
        index: 2,
        lat: 56.52,
        lon: -4.52,
        easting: 201000,
        northing: 701000,
        grid_ref_6: 'NN 133 466',
        grid_ref_8: 'NN 1330 4660',
        ele_dem: 420,
        dist_from_start_m: 5000,
        ascent_from_start_m: 270,
        descent_from_start_m: 0,
    },
];

const mockLegs: RouteLeg[] = [
    {
        leg_number: 1,
        start_vertex_index: 0,
        end_vertex_index: 2,
        start_name: 'Start',
        end_name: 'Finish',
        start_desc: '',
        end_desc: '',
        start_grid_ref: 'NN 123 456',
        end_grid_ref: 'NN 133 466',
        start_elevation_m: 150,
        end_elevation_m: 420,
        distance_km: 5.0,
        ascent_m: 270,
        descent_m: 0,
        grid_bearing: 45,
        magnetic_bearing: 45,
        walking_minutes: 80,
        rest_minutes: 0,
        activity_minutes: 0,
        activity_notes: '',
        flat_override: false,
        route_description: '',
        escape_route: '',
    },
];

describe('RouteElevationProfile Hover Crosshair & Dot', () => {
    it('does not render hover dot when hoveredVertexIndex is null', () => {
        const { container } = render(
            <RouteElevationProfile
                vertices={mockVertices}
                legs={mockLegs}
                activeLegIndex={0}
                hoveredVertexIndex={null}
                onSelectLeg={vi.fn()}
            />
        );

        // Should not have the red hover dot
        const redDot = container.querySelector('circle[fill="#ef4444"][r="7"]');
        expect(redDot).toBeNull();
    });

    it('renders the matching red dot and guideline when hoveredVertexIndex is active', () => {
        const { container } = render(
            <RouteElevationProfile
                vertices={mockVertices}
                legs={mockLegs}
                activeLegIndex={0}
                hoveredVertexIndex={1}
                onSelectLeg={vi.fn()}
            />
        );

        // Should render red dot with r=7 matching map cursor
        const redDot = container.querySelector('circle[fill="#ef4444"][r="7"]');
        expect(redDot).not.toBeNull();
        expect(redDot?.getAttribute('stroke')).toBe('#ffffff');
        expect(redDot?.getAttribute('stroke-width')).toBe('2');

        // Should render elevation/distance badge text
        expect(container.textContent).toContain('280m • 2.5km');
    });

    it('accurately invokes onHoverVertex when pointer moves over SVG', () => {
        const onHoverVertex = vi.fn();
        const { container } = render(
            <RouteElevationProfile
                vertices={mockVertices}
                legs={mockLegs}
                activeLegIndex={0}
                onSelectLeg={vi.fn()}
                onHoverVertex={onHoverVertex}
            />
        );

        const svg = container.querySelector('svg');
        expect(svg).not.toBeNull();

        vi.spyOn(svg!, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            top: 0,
            width: 800,
            height: 150,
            right: 800,
            bottom: 150,
            x: 0,
            y: 0,
            toJSON: () => {},
        });

        // 407.5 is (paddingLeft 45 + plotWidth 725 / 2) -> 50% dist (2500m) -> vertex 1
        const event = new MouseEvent('pointermove', { bubbles: true, clientX: 407.5 });
        Object.defineProperty(event, 'clientX', { value: 407.5 });
        svg!.dispatchEvent(event);
        expect(onHoverVertex).toHaveBeenCalledWith(1);
    });
});
