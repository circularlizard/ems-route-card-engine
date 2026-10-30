/**
 * Client-Side Geodesy, Naismith Timing & Leg Manipulation Utilities.
 * Enables zero-latency leg splitting, merging, and smart re-import reconciliation.
 */

import { RouteLeg, RouteVertex, EnrichedRouteData, ReimportLegDiff } from '../types/route-card';

/**
 * Calculates Grid and approximate Magnetic Bearing between two Easting/Northing points.
 */
export function calculateBearing(
    startE: number,
    startN: number,
    endE: number,
    endN: number
): { grid: number; magnetic: number } {
    const dE = endE - startE;
    const dN = endN - startN;

    if (Math.abs(dE) < 0.001 && Math.abs(dN) < 0.001) {
        return { grid: 0, magnetic: 0 };
    }

    let rad = Math.atan2(dE, dN);
    let deg = (rad * 180.0) / Math.PI;
    if (deg < 0) {
        deg += 360.0;
    }

    const grid = Math.round(deg) % 360;
    // Current magnetic declination in Great Britain is approximately 0 degrees (-0.5 to +0.5)
    const magnetic = grid;

    return { grid, magnetic };
}

/**
 * Converts a compass bearing in degrees (0-360) into an 8/16-point cardinal direction (e.g. N, NE, E, SE, S, SW, W, NW).
 */
export function getCompassDirection(bearingDeg: number): string {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const normalized = ((bearingDeg % 360) + 360) % 360;
    const index = Math.round(normalized / 22.5) % 16;
    return directions[index];
}

/**
 * Calculates Naismith walking time with Langmuir descent adjustments.
 */
export function calculateNaismithTime(
    distanceKm: number,
    ascentM: number,
    descentM: number,
    flatOverride: boolean = false
): number {
    // 5 km/h horizontal = 12 mins per km
    const distMins = distanceKm * 12.0;

    let climbMins = 0;
    let descentAdjustment = 0;

    if (!flatOverride) {
        // Naismith: 1 min per 10m ascent
        climbMins = ascentM / 10.0;

        // Langmuir slope correction
        if (distanceKm > 0.01) {
            const slopeDeg = (Math.atan(descentM / (distanceKm * 1000.0)) * 180.0) / Math.PI;
            if (slopeDeg > 12.0) {
                // Steep descent: +10 min per 300m
                descentAdjustment = (descentM / 300.0) * 10.0;
            } else if (slopeDeg >= 5.0 && slopeDeg <= 12.0) {
                // Gentle descent: -10 min per 300m
                descentAdjustment = -((descentM / 300.0) * 10.0);
            }
        }
    }

    const total = distMins + climbMins + descentAdjustment;
    return Math.max(1, Math.round(total));
}

/**
 * Builds a single leg between two vertex indices from the pre-enriched vertices array.
 */
export function buildLegFromVertices(
    vertices: RouteVertex[],
    startIdx: number,
    endIdx: number,
    legNumber: number,
    startName: string = '',
    endName: string = '',
    existingDesc: string = '',
    existingEscape: string = '',
    existingActivity: string = '',
    existingRest: number = 0
): RouteLeg {
    const vStart = vertices[startIdx];
    const vEnd = vertices[endIdx];

    const distM = vEnd.dist_from_start_m - vStart.dist_from_start_m;
    const distKm = Math.max(0.01, Math.round((distM / 1000.0) * 100) / 100);

    const ascM = Math.max(0, Math.round((vEnd.ascent_from_start_m - vStart.ascent_from_start_m) * 10) / 10);
    const descM = Math.max(0, Math.round((vEnd.descent_from_start_m - vStart.descent_from_start_m) * 10) / 10);

    const bearings = calculateBearing(vStart.easting, vStart.northing, vEnd.easting, vEnd.northing);
    const walkingMinutes = calculateNaismithTime(distKm, ascM, descM);

    return {
        leg_number: legNumber,
        start_vertex_index: startIdx,
        end_vertex_index: endIdx,
        start_name: startName || (startIdx === 0 ? 'Start' : `Checkpoint ${legNumber}`),
        end_name: endName || (endIdx === vertices.length - 1 ? 'Finish' : `Checkpoint ${legNumber + 1}`),
        start_desc: '',
        end_desc: '',
        start_grid_ref: vStart.grid_ref_6,
        end_grid_ref: vEnd.grid_ref_6,
        start_elevation_m: vStart.ele_dem,
        end_elevation_m: vEnd.ele_dem,
        distance_km: distKm,
        ascent_m: ascM,
        descent_m: descM,
        grid_bearing: bearings.grid,
        magnetic_bearing: bearings.magnetic,
        walking_minutes: walkingMinutes,
        flat_override: false,
        route_description: existingDesc,
        escape_route: existingEscape,
        activity_notes: existingActivity,
        rest_minutes: existingRest,
    };
}

/**
 * Splits an existing leg at a specific vertex index into two consecutive legs.
 */
export function splitLegAtVertex(
    vertices: RouteVertex[],
    legs: RouteLeg[],
    targetLegIndex: number,
    splitVertexIdx: number,
    newCheckpointName?: string
): RouteLeg[] {
    const legToSplit = legs[targetLegIndex];
    if (!legToSplit) return legs;

    if (splitVertexIdx <= legToSplit.start_vertex_index || splitVertexIdx >= legToSplit.end_vertex_index) {
        return legs;
    }

    const midpointName = newCheckpointName || `Checkpoint ${targetLegIndex + 2}`;

    const leg1 = buildLegFromVertices(
        vertices,
        legToSplit.start_vertex_index,
        splitVertexIdx,
        legToSplit.leg_number,
        legToSplit.start_name,
        midpointName,
        legToSplit.route_description,
        legToSplit.escape_route,
        '',
        0
    );

    const leg2 = buildLegFromVertices(
        vertices,
        splitVertexIdx,
        legToSplit.end_vertex_index,
        legToSplit.leg_number + 1,
        midpointName,
        legToSplit.end_name,
        '',
        legToSplit.escape_route,
        legToSplit.activity_notes,
        legToSplit.rest_minutes
    );

    const newLegs = [
        ...legs.slice(0, targetLegIndex),
        leg1,
        leg2,
        ...legs.slice(targetLegIndex + 1),
    ];

    // Re-index remaining legs
    return newLegs.map((leg, idx) => ({
        ...leg,
        leg_number: idx + 1,
    }));
}

/**
 * Merges a leg with the immediately following leg.
 */
export function mergeLegsWithNext(
    vertices: RouteVertex[],
    legs: RouteLeg[],
    legIndex: number
): RouteLeg[] {
    if (legIndex < 0 || legIndex >= legs.length - 1) {
        return legs;
    }

    const legA = legs[legIndex];
    const legB = legs[legIndex + 1];

    const mergedDesc = [legA.route_description, legB.route_description].filter(Boolean).join('; ');
    const mergedEscape = legA.escape_route || legB.escape_route || '';
    const mergedRest = (legA.rest_minutes || 0) + (legB.rest_minutes || 0);

    const merged = buildLegFromVertices(
        vertices,
        legA.start_vertex_index,
        legB.end_vertex_index,
        legA.leg_number,
        legA.start_name,
        legB.end_name,
        mergedDesc,
        mergedEscape,
        legB.activity_notes || legA.activity_notes,
        mergedRest
    );

    const newLegs = [
        ...legs.slice(0, legIndex),
        merged,
        ...legs.slice(legIndex + 2),
    ];

    return newLegs.map((leg, idx) => ({
        ...leg,
        leg_number: idx + 1,
    }));
}

/**
 * Smart Re-import Reconciliation: Matches new route legs against previously typed legs
 * preserving descriptions and escape routes based on spatial proximity (<150m) and naming.
 */
export function reconcileReimport(
    oldLegs: RouteLeg[],
    newEnrichedData: EnrichedRouteData
): {
    reconciledLegs: RouteLeg[];
    diffs: ReimportLegDiff[];
} {
    const newLegs = [...newEnrichedData.legs];
    const diffs: ReimportLegDiff[] = [];
    const usedOldIndices = new Set<number>();

    const matchedLegs = newLegs.map((newLeg) => {
        let bestMatchIdx = -1;

        oldLegs.forEach((oldLeg, idx) => {
            if (usedOldIndices.has(idx)) return;

            // Name match or grid match
            const nameMatch =
                (oldLeg.start_name && oldLeg.start_name.toLowerCase() === newLeg.start_name.toLowerCase()) ||
                (oldLeg.end_name && oldLeg.end_name.toLowerCase() === newLeg.end_name.toLowerCase());

            const gridMatch = oldLeg.start_grid_ref === newLeg.start_grid_ref || oldLeg.end_grid_ref === newLeg.end_grid_ref;

            if (nameMatch || gridMatch) {
                bestMatchIdx = idx;
            }
        });

        if (bestMatchIdx >= 0) {
            usedOldIndices.add(bestMatchIdx);
            const oldLeg = oldLegs[bestMatchIdx];
            const distDiff = Math.abs(newLeg.distance_km - oldLeg.distance_km);
            const isModified = distDiff > 0.2 || Math.abs(newLeg.ascent_m - oldLeg.ascent_m) > 30;

            diffs.push({
                status: isModified ? 'modified' : 'matched',
                leg_number: newLeg.leg_number,
                title: `${newLeg.start_name} ➔ ${newLeg.end_name}`,
                description: oldLeg.route_description,
                escape_route: oldLeg.escape_route,
                rest_minutes: oldLeg.rest_minutes || 0,
                old_metrics: { distance_km: oldLeg.distance_km, ascent_m: oldLeg.ascent_m },
                new_metrics: { distance_km: newLeg.distance_km, ascent_m: newLeg.ascent_m },
            });

            return {
                ...newLeg,
                start_name: oldLeg.start_name || newLeg.start_name,
                end_name: oldLeg.end_name || newLeg.end_name,
                route_description: oldLeg.route_description,
                escape_route: oldLeg.escape_route,
                activity_notes: oldLeg.activity_notes,
                rest_minutes: oldLeg.rest_minutes,
            };
        }

        // New leg without prior match
        diffs.push({
            status: 'new',
            leg_number: newLeg.leg_number,
            title: `${newLeg.start_name} ➔ ${newLeg.end_name}`,
            description: '',
            escape_route: '',
            rest_minutes: 0,
            new_metrics: { distance_km: newLeg.distance_km, ascent_m: newLeg.ascent_m },
        });

        return newLeg;
    });

    // Detect removed legs from the old route
    oldLegs.forEach((oldLeg, idx) => {
        if (!usedOldIndices.has(idx) && oldLeg.route_description) {
            diffs.push({
                status: 'removed',
                leg_number: oldLeg.leg_number,
                title: `${oldLeg.start_name} ➔ ${oldLeg.end_name}`,
                description: oldLeg.route_description,
                escape_route: oldLeg.escape_route,
                rest_minutes: oldLeg.rest_minutes || 0,
                old_metrics: { distance_km: oldLeg.distance_km, ascent_m: oldLeg.ascent_m },
            });
        }
    });

    return {
        reconciledLegs: matchedLegs,
        diffs,
    };
}
