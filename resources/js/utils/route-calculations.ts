/**
 * Client-Side Geodesy, Naismith Timing & Leg Manipulation Utilities.
 * Enables zero-latency leg splitting, merging, and smart re-import reconciliation.
 */

import { RouteLeg, RouteVertex, EnrichedRouteData, ReimportLegDiff, RouteHeaderData } from '../types/route-card';

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
 * Formats minutes into hours and minutes (e.g. 75 -> "1h 15m", 45 -> "0h 45m").
 */
export function formatHoursMins(mins: number): string {
    const totalM = Math.max(0, Math.round(mins || 0));
    const h = Math.floor(totalM / 60);
    const m = totalM % 60;
    return `${h}h ${String(m).padStart(2, '0')}m`;
}

/**
 * Calculates dynamic Naismith walking time per leg using user-configured base speed and elevation penalty:
 * Walk Time (mins) = round( (Distance (km) / Base Speed (km/h) * 60) + (Height Climbed (m) / 10 * Elevation Penalty Mins) )
 */
export function calculateDynamicWalkTime(
    distanceKm: number,
    ascentM: number,
    speedKmh: number = 4.0,
    elevationPenaltyMinsPer10m: number = 1.0,
    flatOverride: boolean = false
): number {
    const safeSpeed = speedKmh > 0 ? speedKmh : 4.0;
    const distMins = (distanceKm / safeSpeed) * 60.0;
    const climbMins = flatOverride ? 0 : (ascentM / 10.0) * (elevationPenaltyMinsPer10m ?? 1.0);
    return Math.max(1, Math.round(distMins + climbMins));
}

/**
 * Adds minutes to an "HH:MM" timestamp and returns the resulting "HH:MM" timestamp (wrapped to 24h).
 */
export function addMinutesToTime(timeStr: string, minutesToAdd: number): string {
    const parts = (timeStr || '09:00').split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;

    let total = h * 60 + m + Math.round(minutesToAdd || 0);
    total = ((total % 1440) + 1440) % 1440;

    const outH = Math.floor(total / 60);
    const outM = total % 60;
    return `${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}`;
}

export interface LegScheduleItem {
    legNumber: number;
    walkTimeMinutes: number;
    stopsMinutes: number;
    totalDurationMinutes: number;
    departsFrom: string; // "HH:MM"
    arrivesAt: string;   // "HH:MM" (ETA)
    departsAt: string;   // "HH:MM" (ETD)
}

/**
 * Computes cascading schedule across all journey legs (From -> Arrive -> Stops -> Depart).
 */
export function calculateLegSchedule(
    legs: RouteLeg[],
    settingOutTime: string = '09:00',
    speedKmh: number = 4.0,
    elevationPenaltyMinsPer10m: number = 1.0
): LegScheduleItem[] {
    const schedule: LegScheduleItem[] = [];
    let currentDeparture = settingOutTime || '09:00';

    for (let i = 0; i < legs.length; i++) {
        const leg = legs[i];
        const walkTime = calculateDynamicWalkTime(
            leg.distance_km,
            leg.ascent_m,
            speedKmh,
            elevationPenaltyMinsPer10m,
            leg.flat_override
        );
        const stops = (leg.rest_minutes || 0) + (leg.activity_minutes || 0);
        const totalDuration = walkTime + stops;
        const eta = addMinutesToTime(currentDeparture, walkTime);
        const etd = addMinutesToTime(eta, stops);

        schedule.push({
            legNumber: leg.leg_number,
            walkTimeMinutes: walkTime,
            stopsMinutes: stops,
            totalDurationMinutes: totalDuration,
            departsFrom: currentDeparture,
            arrivesAt: eta,
            departsAt: etd,
        });

        currentDeparture = etd;
    }

    return schedule;
}

/**
 * Creates default RouteHeaderData for a given day.
 */
export function createDefaultHeaderData(
    dayNumber: number = 1,
    expeditionId?: string | number | null
): RouteHeaderData {
    const today = new Date();
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + (dayNumber - 1));
    const dateStr = targetDate.toISOString().slice(0, 10);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = dayNames[targetDate.getDay()];

    return {
        expeditionId: expeditionId ?? null,
        aim: '',
        date: dateStr,
        dayOfWeek,
        unitName: '',
        teamName: '',
        teamMembers: [],
        supervisorName: '',
        supervisorPhone: '',
        backupName: '',
        backupPhone: '',
        settingOutTime: '09:00',
        baseWalkingSpeedKmh: 4.0,
        elevationPenaltyMinsPer10m: 1.0,
        startPointDescription: '',
        startGridRef: '',
        emergencyPlan: '',
    };
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
    existingRest: number = 0,
    existingActivityMinutes: number = 0
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
        activity_minutes: existingActivityMinutes,
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
        0,
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
        legToSplit.rest_minutes,
        legToSplit.activity_minutes || 0
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
 * Finds the index of the nearest trackpoint in vertices strictly between minIndex and maxIndex,
 * enforcing a buffer (default 5 points or 100m) from both ends.
 */
export function findNearestTrackPointIndex(
    vertices: RouteVertex[],
    latlng: { lat: number; lng: number } | { lat: number; lon: number },
    minIndex: number,
    maxIndex: number,
    minBufferPoints: number = 5,
    minBufferMeters: number = 100
): number | null {
    if (!vertices || vertices.length === 0 || minIndex >= maxIndex) {
        return null;
    }

    const targetLat = latlng.lat;
    const targetLng = 'lng' in latlng ? latlng.lng : (latlng as { lon: number }).lon;

    // Determine initial index bounds using the point buffer
    let startIdx = minIndex + minBufferPoints;
    let endIdx = maxIndex - minBufferPoints;

    // If point buffer is too large for this segment, fall back to at least 1 point separation
    if (startIdx > endIdx) {
        startIdx = minIndex + 1;
        endIdx = maxIndex - 1;
        if (startIdx > endIdx) {
            return null;
        }
    }

    // Apply distance buffer if vertices have dist_from_start_m
    const minVertex = vertices[minIndex];
    const maxVertex = vertices[maxIndex];
    if (minVertex && maxVertex) {
        const startDist = minVertex.dist_from_start_m;
        const endDist = maxVertex.dist_from_start_m;
        const totalDist = endDist - startDist;

        // If the segment is long enough to respect minBufferMeters on both ends:
        if (totalDist >= minBufferMeters * 2) {
            while (startIdx < endIdx && vertices[startIdx] && (vertices[startIdx].dist_from_start_m - startDist) < minBufferMeters) {
                startIdx++;
            }
            while (endIdx > startIdx && vertices[endIdx] && (endDist - vertices[endIdx].dist_from_start_m) < minBufferMeters) {
                endIdx--;
            }
        }
    }

    if (startIdx > endIdx) {
        startIdx = Math.min(minIndex + 1, Math.floor((minIndex + maxIndex) / 2));
        endIdx = Math.max(startIdx, Math.min(maxIndex - 1, Math.ceil((minIndex + maxIndex) / 2)));
    }

    let closestIdx: number | null = null;
    let minDistanceSq = Infinity;
    const latRad = (targetLat * Math.PI) / 180;
    const cosLat = Math.cos(latRad);

    for (let i = startIdx; i <= endIdx; i++) {
        const v = vertices[i];
        if (!v) continue;
        const dLat = v.lat - targetLat;
        const dLon = (v.lon - targetLng) * cosLat;
        const distSq = dLat * dLat + dLon * dLon;
        if (distSq < minDistanceSq) {
            minDistanceSq = distSq;
            closestIdx = i;
        }
    }

    return closestIdx;
}

/**
 * Moves an existing intermediate checkpoint marker (1 to legs.length - 1) to a new vertex index.
 * Preserves custom checkpoint names, descriptions, escape routes, rest times, and notes
 * while recalculating spatial metrics for the two adjacent legs.
 */
export function moveCheckpointToVertex(
    vertices: RouteVertex[],
    legs: RouteLeg[],
    checkpointIndex: number, // 1 <= checkpointIndex < legs.length
    newVertexIdx: number
): RouteLeg[] {
    if (checkpointIndex < 1 || checkpointIndex >= legs.length) {
        return legs;
    }

    const prevLegIdx = checkpointIndex - 1;
    const nextLegIdx = checkpointIndex;
    const legA = legs[prevLegIdx];
    const legB = legs[nextLegIdx];

    if (!legA || !legB) {
        return legs;
    }

    // Ensure newVertexIdx is strictly between the start of legA and the end of legB
    if (newVertexIdx <= legA.start_vertex_index || newVertexIdx >= legB.end_vertex_index) {
        return legs;
    }

    // Preserve custom checkpoint name (legA.end_name / legB.start_name)
    const checkpointName = legA.end_name || legB.start_name || `Checkpoint ${checkpointIndex + 1}`;

    const newLegA = buildLegFromVertices(
        vertices,
        legA.start_vertex_index,
        newVertexIdx,
        legA.leg_number,
        legA.start_name,
        checkpointName,
        legA.route_description,
        legA.escape_route,
        legA.activity_notes,
        legA.rest_minutes,
        legA.activity_minutes
    );
    newLegA.flat_override = legA.flat_override;

    const newLegB = buildLegFromVertices(
        vertices,
        newVertexIdx,
        legB.end_vertex_index,
        legB.leg_number,
        checkpointName,
        legB.end_name,
        legB.route_description,
        legB.escape_route,
        legB.activity_notes,
        legB.rest_minutes,
        legB.activity_minutes
    );
    newLegB.flat_override = legB.flat_override;

    const updatedLegs = [...legs];
    updatedLegs[prevLegIdx] = newLegA;
    updatedLegs[nextLegIdx] = newLegB;

    return updatedLegs;
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
    const mergedActivity = (legA.activity_minutes || 0) + (legB.activity_minutes || 0);

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
        mergedRest,
        mergedActivity
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
                activity_minutes: oldLeg.activity_minutes || 0,
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

        return {
            ...newLeg,
            activity_minutes: 0,
        };
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
