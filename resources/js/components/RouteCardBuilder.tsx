import { useState, useEffect, useRef, useId } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faUpload,
    faFloppyDisk,
    faTable,
    faMapLocationDot,
    faPlus,
    faTrashCan,
    faFilePdf,
    faCircleNotch,
    faRotateLeft,
    faCheck,
    faCalendarDay,
} from '@fortawesome/free-solid-svg-icons';

import { RouteLeg, RouteVertex, EnrichedRouteData, ReimportLegDiff } from '../types/route-card';
import {
    splitLegAtVertex,
    mergeLegsWithNext,
    reconcileReimport,
} from '../utils/route-calculations';
import { RouteMap } from './RouteMap';
import { RouteElevationProfile } from './RouteElevationProfile';
import { RouteLegCard } from './RouteLegCard';
import { RouteLegTable } from './RouteLegTable';
import { RouteCoachingBanner } from './RouteCoachingBanner';
import { ReimportDiffModal } from './ReimportDiffModal';

interface RouteCardBuilderProps {
    expeditionId?: number;
    teamId?: number;
    initialDay?: number;
    totalDays?: number;
    osMapsApiKey?: string;
    onExportPdf?: (cardId?: number) => void;
}

export interface DayRouteData {
    routeTitle: string;
    vertices: RouteVertex[];
    legs: RouteLeg[];
    cardId?: number;
    cardStatus: 'draft' | 'submitted' | 'approved' | 'changes_requested';
    undoStack?: RouteLeg[][];
}

export function RouteCardBuilder({
    expeditionId = 1,
    teamId = 1,
    initialDay = 1,
    totalDays = 3,
    osMapsApiKey,
    onExportPdf,
}: RouteCardBuilderProps) {
    const [currentDay, setCurrentDay] = useState(initialDay);
    const [viewMode, setViewMode] = useState<'split' | 'table' | 'map'>('split');
    const [activeLegIndex, setActiveLegIndex] = useState(0);
    const [hoveredVertexIndex, setHoveredVertexIndex] = useState<number | null>(null);

    // Days Dictionary: Guarantees 100% strict isolation between Day 1, Day 2, Day 3
    const [daysData, setDaysData] = useState<Record<number, DayRouteData>>(() => {
        const storageKey = `ems_route_card_${expeditionId}_${teamId}_all_days`;
        try {
            const saved = localStorage.getItem(storageKey);
            if (saved) return JSON.parse(saved);
        } catch (e) {
            // Ignore parse errors
        }
        return {};
    });

    // Active Day's State
    const activeDayData: DayRouteData = daysData[currentDay] || {
        routeTitle: `Day ${currentDay} Route`,
        vertices: [],
        legs: [],
        cardId: undefined,
        cardStatus: 'draft',
        undoStack: [],
    };

    const { routeTitle, vertices, legs, cardId, cardStatus } = activeDayData;
    const undoStack = activeDayData.undoStack || [];

    // UI Loading & Feedback
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    // Re-import reconciliation modal state
    const [pendingReimport, setPendingReimport] = useState<{
        reconciledLegs: RouteLeg[];
        newVertices: RouteVertex[];
        diffs: ReimportLegDiff[];
        title: string;
    } | null>(null);

    const routeTitleId = useId();
    const gpxUploadId = useId();
    const legCardsContainerRef = useRef<HTMLDivElement | null>(null);

    const getApiUrl = (endpoint: string) => {
        const config = window.emsRouteCardStudioConfig;
        const base = (config?.root_url || '/wp-json/ems-route/v1').replace(/\/+$/, '');
        const cleanEndpoint = endpoint.replace(/^\/+/, '');
        if (base.endsWith('ems-route/v1')) {
            return `${base}/${cleanEndpoint}`;
        }
        return `${base}/ems-route/v1/${cleanEndpoint}`;
    };

    // Helper to mutate ONLY the active day without affecting other days
    const updateActiveDay = (patch: Partial<DayRouteData>) => {
        setDaysData((prev) => {
            const existing = prev[currentDay] || {
                routeTitle: `Day ${currentDay} Route`,
                vertices: [],
                legs: [],
                cardId: undefined,
                cardStatus: 'draft',
                undoStack: [],
            };
            const updated = {
                ...prev,
                [currentDay]: {
                    ...existing,
                    ...patch,
                },
            };
            try {
                localStorage.setItem(`ems_route_card_${expeditionId}_${teamId}_all_days`, JSON.stringify(updated));
            } catch (e) {
                // Ignore quota errors
            }
            return updated;
        });
    };

    // Load saved route from backend on mount or day switch if not in memory
    useEffect(() => {
        const fetchBackendCard = async () => {
            if (daysData[currentDay]?.legs?.length) return;

            const config = window.emsRouteCardStudioConfig;
            const nonce = config?.nonce || '';

            try {
                const res = await fetch(getApiUrl(`card/${expeditionId}/${teamId}/${currentDay}`), {
                    headers: { 'X-WP-Nonce': nonce },
                });

                if (res.ok) {
                    const json = await res.json();
                    if (json.success && json.data && json.data.legs_data?.length) {
                        const d = json.data;
                        setDaysData((prev) => {
                            const updated = {
                                ...prev,
                                [currentDay]: {
                                    routeTitle: d.route_title || `Day ${currentDay} Route`,
                                    legs: d.legs_data || [],
                                    vertices: d.geometry_data || [],
                                    cardId: d.id,
                                    cardStatus: d.status || 'draft',
                                    undoStack: [],
                                },
                            };
                            try {
                                localStorage.setItem(`ems_route_card_${expeditionId}_${teamId}_all_days`, JSON.stringify(updated));
                            } catch (e) {}
                            return updated;
                        });
                    }
                }
            } catch (e) {
                // Ignore network errors on fetch
            }
        };

        fetchBackendCard();
    }, [currentDay, expeditionId, teamId]);

    // Handle GPX Upload & Ingestion for CURRENT DAY ONLY
    const handleGpxUpload = async (file: File) => {
        setIsLoading(true);
        setStatusMessage(null);

        const config = window.emsRouteCardStudioConfig;
        const nonce = config?.nonce || '';

        const formData = new FormData();
        formData.append('file', file);
        formData.append('expedition_id', String(expeditionId));
        formData.append('team_id', String(teamId));
        formData.append('day_number', String(currentDay));

        try {
            const res = await fetch(getApiUrl('upload-gpx'), {
                method: 'POST',
                headers: { 'X-WP-Nonce': nonce },
                body: formData,
            });

            const json = await res.json();

            if (!res.ok || !json.success) {
                throw new Error(json.message || 'Failed to parse GPX');
            }

            const data: EnrichedRouteData = json.data;

            // Check if existing legs have typed descriptions
            const hasPriorWork = legs.some(
                (l) =>
                    (l.route_description && l.route_description.trim().length > 0) ||
                    (l.escape_route && l.escape_route.trim().length > 0)
            );

            if (hasPriorWork) {
                // Re-import reconciliation flow
                const { reconciledLegs, diffs } = reconcileReimport(legs, data);
                setPendingReimport({
                    reconciledLegs,
                    newVertices: data.vertices,
                    diffs,
                    title: data.route_title || routeTitle,
                });
            } else {
                // Fresh import for current day only
                updateActiveDay({
                    routeTitle: data.route_title || file.name.replace(/\.gpx$/i, ''),
                    vertices: data.vertices,
                    legs: data.legs,
                });
                setActiveLegIndex(0);
                setStatusMessage({
                    text: `GPX uploaded successfully for Day ${currentDay}: ${data.legs.length} legs generated.`,
                    type: 'success',
                });
            }
        } catch (err: any) {
            setStatusMessage({ text: `Upload failed: ${err.message}`, type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    const confirmReimport = () => {
        if (!pendingReimport) return;
        updateActiveDay({
            legs: pendingReimport.reconciledLegs,
            vertices: pendingReimport.newVertices,
            routeTitle: pendingReimport.title,
            undoStack: [...undoStack, legs],
        });
        setPendingReimport(null);
        setStatusMessage({ text: `Day ${currentDay} route updated! Existing descriptions preserved.`, type: 'success' });
    };

    const cancelReimport = () => {
        setPendingReimport(null);
    };

    // Leg Splitting and Merging
    const handleSplitLeg = (legIdx: number, splitVertexIdx?: number) => {
        const leg = legs[legIdx];
        if (!leg) return;

        const targetVertex = splitVertexIdx !== undefined
            ? splitVertexIdx
            : Math.floor((leg.start_vertex_index + leg.end_vertex_index) / 2);

        const updated = splitLegAtVertex(vertices, legs, legIdx, targetVertex);
        updateActiveDay({
            legs: updated,
            undoStack: [...undoStack, legs],
        });
        setActiveLegIndex(legIdx);
        setStatusMessage({ text: `Leg ${leg.leg_number} split into two legs.`, type: 'success' });
    };

    const handleMergeLeg = (legIdx: number) => {
        const updated = mergeLegsWithNext(vertices, legs, legIdx);
        updateActiveDay({
            legs: updated,
            undoStack: [...undoStack, legs],
        });
        setActiveLegIndex(Math.min(legIdx, updated.length - 1));
        setStatusMessage({ text: 'Legs merged successfully.', type: 'success' });
    };

    const handleUndo = () => {
        if (undoStack.length === 0) return;
        const prevLegs = undoStack[undoStack.length - 1];
        updateActiveDay({
            legs: prevLegs,
            undoStack: undoStack.slice(0, undoStack.length - 1),
        });
        setStatusMessage({ text: 'Undo completed.', type: 'success' });
    };

    const handleUpdateLeg = (legIdx: number, updatedLeg: RouteLeg) => {
        const newLegs = [...legs];
        newLegs[legIdx] = updatedLeg;
        updateActiveDay({ legs: newLegs });
    };

    const handleClearDayRoute = () => {
        if (!confirm(`Are you sure you want to clear the route for Day ${currentDay}?`)) return;
        updateActiveDay({
            routeTitle: `Day ${currentDay} Route`,
            vertices: [],
            legs: [],
            cardId: undefined,
            cardStatus: 'draft',
            undoStack: [],
        });
        setActiveLegIndex(0);
        setStatusMessage({ text: `Day ${currentDay} route cleared.`, type: 'success' });
    };

    // Save Draft to REST API
    const handleSaveDraft = async () => {
        if (legs.length === 0) return;
        setIsSaving(true);
        setStatusMessage(null);

        const config = window.emsRouteCardStudioConfig;
        const nonce = config?.nonce || '';

        const payload = {
            id: cardId,
            expedition_id: expeditionId,
            team_id: teamId,
            day_number: currentDay,
            route_title: routeTitle,
            legs: legs,
            total_distance_km: totalDistanceKm,
            total_ascent_m: totalAscentM,
            estimated_walking_minutes: totalWalkingMins,
        };

        try {
            const res = await fetch(getApiUrl(`card/${cardId || 0}/save`), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-WP-Nonce': nonce,
                },
                body: JSON.stringify(payload),
            });

            const json = await res.json();
            if (res.ok && json.success) {
                updateActiveDay({ cardId: json.card_id });
                setStatusMessage({ text: `Day ${currentDay} route card saved as draft.`, type: 'success' });
            } else {
                throw new Error(json.message || 'Failed to save');
            }
        } catch (e: any) {
            setStatusMessage({ text: `Save error: ${e.message}`, type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    // Summary calculations for active day
    const totalDistanceKm = Math.round(legs.reduce((acc, l) => acc + l.distance_km, 0) * 100) / 100;
    const totalAscentM = Math.round(legs.reduce((acc, l) => acc + l.ascent_m, 0));
    const totalWalkingMins = legs.reduce((acc, l) => acc + l.walking_minutes, 0);
    const totalRestMins = legs.reduce((acc, l) => acc + (l.rest_minutes || 0), 0);
    const totalExpeditionMins = totalWalkingMins + totalRestMins;

    const formatHoursMins = (mins: number) => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${h}h ${String(m).padStart(2, '0')}m`;
    };

    return (
        <div className="ems-builder-container">
            {/* Multi-Day Navigation Tabs with FontAwesome Icons */}
            <div className="ems-day-tabs">
                {Array.from({ length: totalDays }, (_, i) => i + 1).map((day) => {
                    const d = daysData[day];
                    const hasRoute = Boolean(d && d.legs && d.legs.length > 0);
                    const distKm = hasRoute
                        ? d.legs.reduce((acc, l) => acc + l.distance_km, 0).toFixed(1)
                        : null;

                    return (
                        <button
                            key={day}
                            type="button"
                            className={`ems-day-tab ${currentDay === day ? 'ems-day-tab--active' : ''}`}
                            onClick={() => {
                                setCurrentDay(day);
                                setActiveLegIndex(0);
                                setStatusMessage(null);
                            }}
                        >
                            <FontAwesomeIcon icon={faCalendarDay} className="ems-tab-icon" /> Day {day}
                            {hasRoute && <span className="ems-day-tab-dist">({distKm} km)</span>}
                        </button>
                    );
                })}
            </div>

            {/* Notification Banner */}
            {statusMessage && (
                <div className={`ems-status-alert ems-status-alert--${statusMessage.type}`}>
                    <FontAwesomeIcon icon={statusMessage.type === 'success' ? faCheck : faTrashCan} />
                    <span>{statusMessage.text}</span>
                </div>
            )}

            {/* Top Toolbar */}
            <div className="ems-builder-toolbar">
                <div className="ems-builder-title-group">
                    <label htmlFor={routeTitleId} className="screen-reader-text">Route Title</label>
                    <input
                        id={routeTitleId}
                        type="text"
                        className="ems-route-title-input"
                        value={routeTitle}
                        onChange={(e) => updateActiveDay({ routeTitle: e.target.value })}
                        placeholder="Route Title"
                    />
                    <span className={`ems-badge-status ems-badge-status--${cardStatus}`}>
                        {cardStatus.toUpperCase()}
                    </span>
                </div>

                <div className="ems-builder-actions">
                    {undoStack.length > 0 && (
                        <button type="button" className="ems-btn ems-btn--subtle" onClick={handleUndo} title="Undo leg split/merge">
                            <FontAwesomeIcon icon={faRotateLeft} /> Undo
                        </button>
                    )}

                    {legs.length > 0 && (
                        <button
                            type="button"
                            className="ems-btn ems-btn--subtle"
                            onClick={handleClearDayRoute}
                            title="Clear this day's route"
                        >
                            <FontAwesomeIcon icon={faTrashCan} /> Clear Day
                        </button>
                    )}

                    <button
                        type="button"
                        className="ems-btn ems-btn--secondary"
                        onClick={handleSaveDraft}
                        disabled={isSaving || legs.length === 0}
                    >
                        <FontAwesomeIcon icon={isSaving ? faCircleNotch : faFloppyDisk} spin={isSaving} />
                        Save Draft
                    </button>

                    <button
                        type="button"
                        className="ems-btn ems-btn--primary"
                        onClick={() => onExportPdf?.(cardId)}
                        disabled={legs.length === 0}
                    >
                        <FontAwesomeIcon icon={faFilePdf} />
                        Export PDF
                    </button>
                </div>
            </div>

            {/* Empty State Dropzone for Current Day */}
            {legs.length === 0 && !isLoading && (
                <div className="ems-gpx-dropzone">
                    <FontAwesomeIcon icon={faUpload} className="ems-dropzone-icon" />
                    <h3>Upload GPX Route for Day {currentDay}</h3>
                    <p>Drop a route GPX file for Day {currentDay}. Our engine will enrich all coordinates with OSGB36 grid references and OS Terrain 50 elevation.</p>

                    <label htmlFor={gpxUploadId} className="ems-btn ems-btn--primary">
                        Browse GPX File
                    </label>
                    <input
                        id={gpxUploadId}
                        type="file"
                        accept=".gpx"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                                handleGpxUpload(e.target.files[0]);
                            }
                        }}
                    />
                </div>
            )}

            {/* Loading Indicator */}
            {isLoading && (
                <div className="ems-loading-state">
                    <FontAwesomeIcon icon={faCircleNotch} spin className="ems-loading-spinner" />
                    <p>Analyzing GPX coordinates with OS Terrain 50 elevation...</p>
                </div>
            )}

            {/* Route Stats Summary Bar */}
            {legs.length > 0 && (
                <div className="ems-route-stats-bar">
                    <div className="ems-stat-pill">
                        <span className="ems-stat-pill__label">Distance</span>
                        <span className="ems-stat-pill__val">{totalDistanceKm} km</span>
                    </div>
                    <div className="ems-stat-pill">
                        <span className="ems-stat-pill__label">Climb</span>
                        <span className="ems-stat-pill__val">+{totalAscentM} m</span>
                    </div>
                    <div className="ems-stat-pill">
                        <span className="ems-stat-pill__label">Walking</span>
                        <span className="ems-stat-pill__val">{formatHoursMins(totalWalkingMins)}</span>
                    </div>
                    <div className="ems-stat-pill">
                        <span className="ems-stat-pill__label">Planned Rest</span>
                        <span className="ems-stat-pill__val">{formatHoursMins(totalRestMins)}</span>
                    </div>
                    <div className="ems-stat-pill ems-stat-pill--highlight">
                        <span className="ems-stat-pill__label">Total Expedition</span>
                        <span className="ems-stat-pill__val">{formatHoursMins(totalExpeditionMins)}</span>
                    </div>

                    {/* View Switcher */}
                    <div className="ems-view-toggle">
                        <button
                            type="button"
                            className={`ems-view-btn ${viewMode === 'split' ? 'ems-view-btn--active' : ''}`}
                            onClick={() => setViewMode('split')}
                            title="Interactive Map & Journey Cards"
                        >
                            <FontAwesomeIcon icon={faMapLocationDot} /> Split
                        </button>
                        <button
                            type="button"
                            className={`ems-view-btn ${viewMode === 'table' ? 'ems-view-btn--active' : ''}`}
                            onClick={() => setViewMode('table')}
                            title="Full 12-Column DofE Table View"
                        >
                            <FontAwesomeIcon icon={faTable} /> Table
                        </button>
                    </div>
                </div>
            )}

            {/* Pre-Flight Coaching Checks */}
            {legs.length > 0 && (
                <RouteCoachingBanner
                    legs={legs}
                    totalWalkingMinutes={totalWalkingMins}
                    totalRestMinutes={totalRestMins}
                />
            )}

            {/* Split View: Map + Cards */}
            {legs.length > 0 && viewMode === 'split' && (
                <div className="ems-studio-split-layout">
                    {/* Left Pane: Interactive Map & Elevation Profile */}
                    <div className="ems-studio-pane ems-studio-pane--map">
                        <RouteMap
                            vertices={vertices}
                            legs={legs}
                            activeLegIndex={activeLegIndex}
                            onSelectLeg={(idx) => setActiveLegIndex(idx)}
                            onRequestSplitAtVertex={(vertexIdx) => handleSplitLeg(activeLegIndex, vertexIdx)}
                            osMapsApiKey={osMapsApiKey}
                            hoveredVertexIndex={hoveredVertexIndex}
                        />

                        <RouteElevationProfile
                            vertices={vertices}
                            legs={legs}
                            activeLegIndex={activeLegIndex}
                            onSelectLeg={(idx) => setActiveLegIndex(idx)}
                            onHoverVertex={(vIdx) => setHoveredVertexIndex(vIdx)}
                        />
                    </div>

                    {/* Right Pane: Synchronized Journey Segment Cards */}
                    <div ref={legCardsContainerRef} className="ems-studio-pane ems-studio-pane--cards">
                        <div className="ems-cards-deck-header">
                            <h3>Journey Legs ({legs.length})</h3>
                            <button
                                type="button"
                                className="ems-btn-xs"
                                onClick={() => handleSplitLeg(legs.length - 1)}
                            >
                                <FontAwesomeIcon icon={faPlus} /> Add Split Point
                            </button>
                        </div>

                        <div className="ems-leg-cards-list">
                            {legs.map((leg, idx) => (
                                <RouteLegCard
                                    key={leg.leg_number}
                                    leg={leg}
                                    vertices={vertices}
                                    isActive={idx === activeLegIndex}
                                    isLastLeg={idx === legs.length - 1}
                                    onSelect={() => setActiveLegIndex(idx)}
                                    onUpdateLeg={(updated) => handleUpdateLeg(idx, updated)}
                                    onSplitLeg={() => handleSplitLeg(idx)}
                                    onMergeLeg={() => handleMergeLeg(idx)}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Table View: 12-Column Desktop Grid */}
            {legs.length > 0 && viewMode === 'table' && (
                <div className="ems-studio-table-layout">
                    <RouteLegTable
                        legs={legs}
                        activeLegIndex={activeLegIndex}
                        onSelectLeg={(idx) => setActiveLegIndex(idx)}
                        onUpdateLeg={handleUpdateLeg}
                        onSplitLeg={handleSplitLeg}
                        onMergeLeg={handleMergeLeg}
                    />
                </div>
            )}

            {/* Re-import Diff Reconciliation Modal */}
            {pendingReimport && (
                <ReimportDiffModal
                    diffs={pendingReimport.diffs}
                    onConfirm={confirmReimport}
                    onCancel={cancelReimport}
                />
            )}
        </div>
    );
}
