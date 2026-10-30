import { describe, it, expect } from 'vitest';
import {
    calculateBearing,
    calculateNaismithTime,
    getCompassDirection,
    buildLegFromVertices,
    splitLegAtVertex,
    mergeLegsWithNext,
    reconcileReimport,
} from '../../resources/js/utils/route-calculations';
import { RouteVertex, RouteLeg, EnrichedRouteData } from '../../resources/js/types/route-card';

describe('route-calculations utilities', () => {
    it('calculates grid and magnetic bearings accurately', () => {
        // Due North
        expect(calculateBearing(100, 100, 100, 200).grid).toBe(0);
        // Due East
        expect(calculateBearing(100, 100, 200, 100).grid).toBe(90);
        // Due South
        expect(calculateBearing(100, 200, 100, 100).grid).toBe(180);
        // Due West
        expect(calculateBearing(200, 100, 100, 100).grid).toBe(270);
        // Northeast (45 degrees)
        expect(calculateBearing(100, 100, 200, 200).grid).toBe(45);
    });

    it('calculates Naismith walking time with ascent and flat descent', () => {
        // 5km flat = 60 mins
        expect(calculateNaismithTime(5.0, 0, 0)).toBe(60);

        // 5km + 200m ascent = 60 + 20 = 80 mins
        expect(calculateNaismithTime(5.0, 200, 0)).toBe(80);

        // Tunnel / flat override
        expect(calculateNaismithTime(5.0, 200, 0, true)).toBe(60);
    });

    it('splits a leg into two with correct recalculated metrics', () => {
        const dummyVertices: RouteVertex[] = [
            {
                index: 0,
                lat: 56.0,
                lon: -4.0,
                easting: 200000,
                northing: 700000,
                grid_ref_6: 'NN 000 000',
                grid_ref_8: 'NN 0000 0000',
                ele_dem: 100,
                dist_from_start_m: 0,
                ascent_from_start_m: 0,
                descent_from_start_m: 0,
            },
            {
                index: 1,
                lat: 56.01,
                lon: -4.0,
                easting: 200000,
                northing: 701000,
                grid_ref_6: 'NN 000 010',
                grid_ref_8: 'NN 0000 0100',
                ele_dem: 200,
                dist_from_start_m: 1000,
                ascent_from_start_m: 100,
                descent_from_start_m: 0,
            },
            {
                index: 2,
                lat: 56.02,
                lon: -4.0,
                easting: 200000,
                northing: 702000,
                grid_ref_6: 'NN 000 020',
                grid_ref_8: 'NN 0000 0200',
                ele_dem: 250,
                dist_from_start_m: 2000,
                ascent_from_start_m: 150,
                descent_from_start_m: 0,
            },
        ];

        const initialLeg: RouteLeg = buildLegFromVertices(
            dummyVertices,
            0,
            2,
            1,
            'Start Bothy',
            'Summit Cairn',
            'Initial description',
            'Escape SW'
        );

        expect(initialLeg.distance_km).toBe(2.0);
        expect(initialLeg.ascent_m).toBe(150);

        // Split at vertex 1
        const splitLegs = splitLegAtVertex(dummyVertices, [initialLeg], 0, 1, 'Col Checkpoint');
        expect(splitLegs.length).toBe(2);

        // Leg 1
        expect(splitLegs[0].leg_number).toBe(1);
        expect(splitLegs[0].start_name).toBe('Start Bothy');
        expect(splitLegs[0].end_name).toBe('Col Checkpoint');
        expect(splitLegs[0].distance_km).toBe(1.0);
        expect(splitLegs[0].ascent_m).toBe(100);

        // Leg 2
        expect(splitLegs[1].leg_number).toBe(2);
        expect(splitLegs[1].start_name).toBe('Col Checkpoint');
        expect(splitLegs[1].end_name).toBe('Summit Cairn');
        expect(splitLegs[1].distance_km).toBe(1.0);
        expect(splitLegs[1].ascent_m).toBe(50);
    });

    it('merges two adjacent legs correctly', () => {
        const dummyVertices: RouteVertex[] = [
            {
                index: 0,
                lat: 56.0,
                lon: -4.0,
                easting: 200000,
                northing: 700000,
                grid_ref_6: 'NN 000 000',
                grid_ref_8: 'NN 0000 0000',
                ele_dem: 100,
                dist_from_start_m: 0,
                ascent_from_start_m: 0,
                descent_from_start_m: 0,
            },
            {
                index: 1,
                lat: 56.01,
                lon: -4.0,
                easting: 200000,
                northing: 701000,
                grid_ref_6: 'NN 000 010',
                grid_ref_8: 'NN 0000 0100',
                ele_dem: 200,
                dist_from_start_m: 1000,
                ascent_from_start_m: 100,
                descent_from_start_m: 0,
            },
            {
                index: 2,
                lat: 56.02,
                lon: -4.0,
                easting: 200000,
                northing: 702000,
                grid_ref_6: 'NN 000 020',
                grid_ref_8: 'NN 0000 0200',
                ele_dem: 250,
                dist_from_start_m: 2000,
                ascent_from_start_m: 150,
                descent_from_start_m: 0,
            },
        ];

        const leg1 = buildLegFromVertices(dummyVertices, 0, 1, 1, 'Start', 'Middle', 'First part');
        const leg2 = buildLegFromVertices(dummyVertices, 1, 2, 2, 'Middle', 'Finish', 'Second part');

        const merged = mergeLegsWithNext(dummyVertices, [leg1, leg2], 0);
        expect(merged.length).toBe(1);
        expect(merged[0].start_name).toBe('Start');
        expect(merged[0].end_name).toBe('Finish');
        expect(merged[0].distance_km).toBe(2.0);
        expect(merged[0].ascent_m).toBe(150);
        expect(merged[0].route_description).toBe('First part; Second part');
    });

    it('reconciles re-imported routes and preserves written descriptions', () => {
        const oldLegs: RouteLeg[] = [
            {
                leg_number: 1,
                start_vertex_index: 0,
                end_vertex_index: 10,
                start_name: 'Start Bothy',
                end_name: 'Glen Footbridge',
                start_desc: '',
                end_desc: '',
                start_grid_ref: 'NN 123 456',
                end_grid_ref: 'NN 140 470',
                start_elevation_m: 200,
                end_elevation_m: 350,
                distance_km: 3.5,
                ascent_m: 150,
                descent_m: 0,
                grid_bearing: 45,
                magnetic_bearing: 45,
                walking_minutes: 57,
                flat_override: false,
                route_description: 'Follow stream NE to footbridge',
                escape_route: 'Bail down valley track to road',
                rest_minutes: 15,
            },
        ];

        const newEnrichedData: EnrichedRouteData = {
            route_title: 'Updated Route',
            total_distance_km: 3.6,
            total_ascent_m: 155,
            total_descent_m: 0,
            estimated_walking_minutes: 58,
            vertex_count: 20,
            legs: [
                {
                    leg_number: 1,
                    start_vertex_index: 0,
                    end_vertex_index: 19,
                    start_name: 'Start Bothy',
                    end_name: 'Glen Footbridge',
                    start_desc: '',
                    end_desc: '',
                    start_grid_ref: 'NN 123 456',
                    end_grid_ref: 'NN 140 470',
                    start_elevation_m: 200,
                    end_elevation_m: 350,
                    distance_km: 3.6,
                    ascent_m: 155,
                    descent_m: 0,
                    grid_bearing: 46,
                    magnetic_bearing: 46,
                    walking_minutes: 58,
                    flat_override: false,
                    route_description: '',
                    escape_route: '',
                },
            ],
            vertices: [],
            suggested_split_indices: [],
            warnings: [],
        };

        const result = reconcileReimport(oldLegs, newEnrichedData);
        expect(result.reconciledLegs.length).toBe(1);
        expect(result.reconciledLegs[0].route_description).toBe('Follow stream NE to footbridge');
        expect(result.reconciledLegs[0].escape_route).toBe('Bail down valley track to road');
        expect(result.reconciledLegs[0].rest_minutes).toBe(15);
        expect(result.diffs[0].status).toBe('matched');
    });

    it('converts magnetic bearings to real cardinal compass directions', () => {
        expect(getCompassDirection(0)).toBe('N');
        expect(getCompassDirection(360)).toBe('N');
        expect(getCompassDirection(45)).toBe('NE');
        expect(getCompassDirection(90)).toBe('E');
        expect(getCompassDirection(135)).toBe('SE');
        expect(getCompassDirection(180)).toBe('S');
        expect(getCompassDirection(225)).toBe('SW');
        expect(getCompassDirection(270)).toBe('W');
        expect(getCompassDirection(315)).toBe('NW');
    });
});
