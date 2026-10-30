import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RouteMap } from '../../resources/js/components/RouteMap';
import { RouteVertex, RouteLeg } from '../../resources/js/types/route-card';

// Mock Leaflet methods that require canvas/DOM sizing in JSDOM
vi.mock('leaflet', async () => {
    const actual = await vi.importActual<any>('leaflet');
    return {
        ...actual,
        Proj: {
            CRS: vi.fn(() => ({})),
        },
        map: vi.fn(() => ({
            remove: vi.fn(),
            eachLayer: vi.fn(),
            removeLayer: vi.fn(),
            fitBounds: vi.fn(),
            getCenter: vi.fn(() => ({ lat: 54.5, lng: -3.2 })),
            getZoom: vi.fn(() => 7),
            invalidateSize: vi.fn(),
        })),
        control: {
            zoom: vi.fn(() => ({
                addTo: vi.fn(),
            })),
        },
        layerGroup: vi.fn(() => ({
            addTo: vi.fn(),
            clearLayers: vi.fn(),
            addLayer: vi.fn(),
        })),
        tileLayer: vi.fn(() => ({
            addTo: vi.fn(),
        })),
        polyline: vi.fn(() => ({
            on: vi.fn(),
        })),
        marker: vi.fn(() => ({
            on: vi.fn(),
            bindTooltip: vi.fn(),
        })),
        circleMarker: vi.fn(() => ({
            addTo: vi.fn(),
            setLatLng: vi.fn(),
        })),
        divIcon: vi.fn(),
    };
});

describe('RouteMap Component', () => {
    const mockVertices: RouteVertex[] = [
        {
            index: 0,
            lat: 54.5,
            lon: -3.2,
            easting: 322000,
            northing: 508000,
            grid_ref_6: 'NY220080',
            grid_ref_8: 'NY22000800',
            ele_dem: 150,
            dist_from_start_m: 0,
            ascent_from_start_m: 0,
            descent_from_start_m: 0,
        },
        {
            index: 1,
            lat: 54.51,
            lon: -3.21,
            easting: 322100,
            northing: 508100,
            grid_ref_6: 'NY221081',
            grid_ref_8: 'NY22100810',
            ele_dem: 220,
            dist_from_start_m: 1200,
            ascent_from_start_m: 70,
            descent_from_start_m: 0,
        },
        {
            index: 2,
            lat: 54.52,
            lon: -3.22,
            easting: 322200,
            northing: 508200,
            grid_ref_6: 'NY222082',
            grid_ref_8: 'NY22200820',
            ele_dem: 310,
            dist_from_start_m: 2500,
            ascent_from_start_m: 160,
            descent_from_start_m: 0,
        },
    ];

    const mockLegs: RouteLeg[] = [
        {
            leg_number: 1,
            start_vertex_index: 0,
            end_vertex_index: 2,
            start_name: 'Checkpoint 1',
            end_name: 'Checkpoint 2',
            start_desc: 'Start at footbridge',
            end_desc: 'Summit cairn',
            start_grid_ref: 'NY220080',
            end_grid_ref: 'NY222082',
            start_elevation_m: 150,
            end_elevation_m: 310,
            distance_km: 2.5,
            ascent_m: 160,
            descent_m: 0,
            grid_bearing: 315,
            magnetic_bearing: 314,
            walking_minutes: 40,
            flat_override: false,
            route_description: 'Ascend footpath to ridge',
            escape_route: 'Descend southeast to valley road',
        },
    ];

    it('renders standard base layer buttons and Fit All button', () => {
        render(
            <RouteMap
                vertices={mockVertices}
                legs={mockLegs}
                activeLegIndex={0}
                onSelectLeg={vi.fn()}
            />
        );

        expect(screen.getByRole('button', { name: /OpenTopo/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /CyclOSM Topo/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /ESRI Topo/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Street/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Fit All/i })).toBeInTheDocument();
        // OS Leisure should NOT be visible without osMapsApiKey
        expect(screen.queryByRole('button', { name: /OS Leisure/i })).not.toBeInTheDocument();
    });

    it('displays OS Leisure button when osMapsApiKey is supplied and allows switching to it', () => {
        render(
            <RouteMap
                vertices={mockVertices}
                legs={mockLegs}
                activeLegIndex={0}
                onSelectLeg={vi.fn()}
                osMapsApiKey="test-os-api-key-12345"
            />
        );

        const osBtn = screen.getByRole('button', { name: /OS Leisure/i });
        expect(osBtn).toBeInTheDocument();

        fireEvent.click(osBtn);
        expect(osBtn).toHaveClass('ems-map-btn--active');
    });
});
