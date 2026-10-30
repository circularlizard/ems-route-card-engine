/**
 * TypeScript definitions for EMS Route Card & Terrain Engine.
 */

export interface RouteVertex {
    index: number;
    lat: number;
    lon: number;
    easting: number;
    northing: number;
    grid_ref_6: string;
    grid_ref_8: string;
    ele_dem: number;
    dist_from_start_m: number;
    ascent_from_start_m: number;
    descent_from_start_m: number;
}

export interface RouteLeg {
    leg_number: number;
    start_vertex_index: number;
    end_vertex_index: number;
    start_name: string;
    end_name: string;
    start_desc: string;
    end_desc: string;
    start_grid_ref: string;
    end_grid_ref: string;
    start_elevation_m: number;
    end_elevation_m: number;
    distance_km: number;
    ascent_m: number;
    descent_m: number;
    grid_bearing: number;
    magnetic_bearing: number;
    walking_minutes: number;
    flat_override: boolean;
    route_description: string;
    escape_route: string;
    activity_notes?: string;
    rest_minutes?: number;
}

export interface EnrichedRouteData {
    route_title: string;
    total_distance_km: number;
    total_ascent_m: number;
    total_descent_m: number;
    estimated_walking_minutes: number;
    vertex_count: number;
    legs: RouteLeg[];
    vertices: RouteVertex[];
    suggested_split_indices: number[];
    warnings: string[];
}

export interface RouteCardRecord {
    id?: number;
    expedition_id: number;
    team_id: number;
    day_number: number;
    route_title: string;
    status: 'draft' | 'submitted' | 'approved' | 'changes_requested';
    route_data: {
        total_distance_km: number;
        total_ascent_m: number;
        total_descent_m: number;
        estimated_walking_minutes: number;
        total_expedition_minutes?: number;
    };
    legs_data: RouteLeg[];
    geometry_data: RouteVertex[];
    updated_at?: string;
}

export interface ReimportLegDiff {
    status: 'matched' | 'modified' | 'new' | 'removed';
    leg_number: number;
    title: string;
    description: string;
    escape_route: string;
    rest_minutes: number;
    old_metrics?: { distance_km: number; ascent_m: number };
    new_metrics?: { distance_km: number; ascent_m: number };
}
