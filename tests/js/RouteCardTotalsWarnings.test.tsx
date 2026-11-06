import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RouteCardBuilder } from '../../resources/js/components/RouteCardBuilder';

vi.mock('../../resources/js/components/RouteMap', () => ({
    RouteMap: () => <div data-testid="mock-route-map">Mock Map</div>,
}));

describe('RouteCardBuilder Totals Warning Chips', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    const mockUploadResponse = (walkingMins: number, restMins: number) => {
        // Derive distance_km to match walkingMins at default 4.0 km/h so dynamic Naismith aligns
        const distKm = Math.round(((walkingMins / 60.0) * 4.0) * 100) / 100;
        return {
            success: true,
            data: {
                route_title: 'Highland Trail',
                total_distance_km: distKm,
                total_ascent_m: 0,
                estimated_walking_minutes: walkingMins,
                vertex_count: 20,
                legs: [
                    {
                        leg_number: 1,
                        start_vertex_index: 0,
                        end_vertex_index: 19,
                        start_name: 'Start Point',
                        end_name: 'End Point',
                        start_desc: '',
                        end_desc: '',
                        start_grid_ref: 'NN 100 200',
                        end_grid_ref: 'NN 150 250',
                        start_elevation_m: 100,
                        end_elevation_m: 300,
                        distance_km: distKm,
                        ascent_m: 0,
                        descent_m: 0,
                        grid_bearing: 45,
                        magnetic_bearing: 45,
                        walking_minutes: walkingMins,
                        rest_minutes: restMins,
                        activity_minutes: 0,
                        activity_notes: '',
                        flat_override: false,
                        route_description: 'Follow distinct footpath up the glen to col',
                        escape_route: 'Bail south along valley floor to road',
                    },
                ],
                vertices: [
                    { index: 0, lat: 56.5, lon: -4.5, easting: 200000, northing: 700000, grid_ref_6: 'NN 100 200', grid_ref_8: 'NN 1000 2000', ele_dem: 100, dist_from_start_m: 0, ascent_from_start_m: 0, descent_from_start_m: 0 },
                    { index: 19, lat: 56.6, lon: -4.4, easting: 215000, northing: 715000, grid_ref_6: 'NN 150 250', grid_ref_8: 'NN 1500 2500', ele_dem: 300, dist_from_start_m: distKm * 1000, ascent_from_start_m: 0, descent_from_start_m: 0 },
                ],
            },
        };
    };

    it('shows "too short" warning chip when stops are less than 15% of total duration', async () => {
        // Walking 360m (6h), Stops 15m -> Total 375m. Stops % = 15/375 = 4% (< 15%)
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => mockUploadResponse(360, 15),
        }));

        render(
            <RouteCardBuilder
                expeditionId={1}
                teamId={1}
                initialDay={1}
                dofeLevel="bronze" // Min 6h = 360m. Total 375m meets duration minima.
            />
        );

        // Upload a dummy GPX
        const gpxFile = new File(['<gpx></gpx>'], 'route.gpx', { type: 'application/gpx+xml' });
        const input = screen.getByLabelText(/Browse GPX File/i);
        fireEvent.change(input, { target: { files: [gpxFile] } });

        await waitFor(() => {
            expect(screen.getByDisplayValue('Highland Trail')).toBeInTheDocument();
        });

        // Stops is 15m out of 375m (4% < 15%), so "too short" chip should appear for Stops
        const tooShortChips = screen.getAllByText('too short');
        expect(tooShortChips.length).toBeGreaterThanOrEqual(1);

        // Total Expedition is 6h 15m (375m >= 360m for Bronze), so duration is not too short.
        // Update stops to 90m (Total 450m, stops is 90/450 = 20% >= 15%)
        const stopsInput = screen.getByRole('spinbutton', { name: /STOPS \(MIN\)/i });
        fireEvent.change(stopsInput, { target: { value: '90' } });

        // Warning chip for stops should now disappear
        await waitFor(() => {
            expect(screen.queryByText('too short')).not.toBeInTheDocument();
        });
    });

    it('shows "too short" warning chip when total duration is under the DofE minimum', async () => {
        // Walking 240m (4h), Stops 60m -> Total 300m (5h).
        // For Silver (min 7h = 420m), 300m is under the 7h minimum!
        // Stops % = 60/300 = 20% (>= 15%, so stops is fine, but duration is too short).
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => mockUploadResponse(240, 60),
        }));

        render(
            <RouteCardBuilder
                expeditionId={1}
                teamId={1}
                initialDay={1}
                dofeLevel="silver" // Min 7h
            />
        );

        const gpxFile = new File(['<gpx></gpx>'], 'route.gpx', { type: 'application/gpx+xml' });
        const input = screen.getByLabelText(/Browse GPX File/i);
        fireEvent.change(input, { target: { files: [gpxFile] } });

        await waitFor(() => {
            expect(screen.getByDisplayValue('Highland Trail')).toBeInTheDocument();
        });

        // Total duration is 5h 0m, under 7h, so "too short" appears
        const tooShortChips = screen.getAllByText('too short');
        expect(tooShortChips.length).toBeGreaterThanOrEqual(1);
    });
});
