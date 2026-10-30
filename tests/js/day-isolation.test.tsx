import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RouteCardBuilder } from '../../resources/js/components/RouteCardBuilder';

// Mock RouteMap in JSDOM since Leaflet SVG renderers require full browser DOM layout
vi.mock('../../resources/js/components/RouteMap', () => ({
    RouteMap: () => <div data-testid="mock-route-map">Mock Map</div>,
}));

describe('RouteCardBuilder Multi-Day Isolation', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
            if (url.includes('/upload-gpx')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        success: true,
                        data: {
                            route_title: 'Day 1 Highland Trail',
                            total_distance_km: 12.5,
                            total_ascent_m: 450,
                            estimated_walking_minutes: 195,
                            vertex_count: 50,
                            legs: [
                                {
                                    leg_number: 1,
                                    start_vertex_index: 0,
                                    end_vertex_index: 49,
                                    start_name: 'Camp 1',
                                    end_name: 'Camp 2',
                                    start_desc: '',
                                    end_desc: '',
                                    start_grid_ref: 'NN 123 456',
                                    end_grid_ref: 'NN 200 500',
                                    start_elevation_m: 150,
                                    end_elevation_m: 600,
                                    distance_km: 12.5,
                                    ascent_m: 450,
                                    descent_m: 50,
                                    grid_bearing: 45,
                                    magnetic_bearing: 45,
                                    walking_minutes: 195,
                                    flat_override: false,
                                    route_description: 'Follow path NE',
                                    escape_route: 'Bail south',
                                },
                            ],
                            vertices: [
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
                                    index: 49,
                                    lat: 56.6,
                                    lon: -4.4,
                                    easting: 210000,
                                    northing: 710000,
                                    grid_ref_6: 'NN 200 500',
                                    grid_ref_8: 'NN 2000 5000',
                                    ele_dem: 600,
                                    dist_from_start_m: 12500,
                                    ascent_from_start_m: 450,
                                    descent_from_start_m: 50,
                                },
                            ],
                            suggested_split_indices: [],
                            warnings: [],
                        },
                    }),
                });
            }

            return Promise.resolve({
                ok: false,
                status: 404,
                json: async () => ({ success: false }),
            });
        }));
    });

    it('keeps Day 1 route strictly isolated from Day 2 and Day 3', async () => {
        const { container } = render(
            <RouteCardBuilder
                expeditionId={100}
                teamId={200}
                initialDay={1}
                totalDays={3}
            />
        );

        // Day 1: Initially shows empty dropzone
        expect(screen.getByText(/Upload GPX Route for Day 1/i)).toBeInTheDocument();

        // Upload a GPX file on Day 1
        const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
        const fakeFile = new File(['<gpx></gpx>'], 'day1_route.gpx', { type: 'application/gpx+xml' });
        fireEvent.change(fileInput, { target: { files: [fakeFile] } });

        // Wait for Day 1 route to be loaded
        await waitFor(() => {
            expect(screen.getByDisplayValue('Day 1 Highland Trail')).toBeInTheDocument();
            expect(screen.getByText('12.5 km')).toBeInTheDocument();
        });

        // Switch to Day 2
        const day2Tab = screen.getByRole('button', { name: /Day 2/i });
        fireEvent.click(day2Tab);

        // Verify Day 2 shows its own empty dropzone, NOT Day 1's route!
        expect(screen.getByText(/Upload GPX Route for Day 2/i)).toBeInTheDocument();
        expect(screen.queryByDisplayValue('Day 1 Highland Trail')).not.toBeInTheDocument();

        // Switch to Day 3
        const day3Tab = screen.getByRole('button', { name: /Day 3/i });
        fireEvent.click(day3Tab);

        // Verify Day 3 is also empty
        expect(screen.getByText(/Upload GPX Route for Day 3/i)).toBeInTheDocument();

        // Switch back to Day 1
        const day1Tab = screen.getByRole('button', { name: /Day 1/i });
        fireEvent.click(day1Tab);

        // Verify Day 1 route is still intact!
        expect(screen.getByDisplayValue('Day 1 Highland Trail')).toBeInTheDocument();
        expect(screen.getByText('12.5 km')).toBeInTheDocument();
    });
});
