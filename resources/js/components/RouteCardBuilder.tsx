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

    // Route Card State per Day
    const [routeTitle, setRouteTitle] = useState('My Expedition Route');
    const [vertices, setVertices] = useState<RouteVertex[]>([]);
    const [legs, setLegs] = useState<RouteLeg[]>([]);
    const [cardId, setCardId] = useState<number | undefined>(undefined);
    const [cardStatus, setCardStatus] = useState<'draft' | 'submitted' | 'approved' | 'changes_requested'>('draft');

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

    // Undo buffer for leg manipulation
    const [undoStack, setUndoStack] = useState<RouteLeg[][]>([]);
    const routeTitleId = useId();
    const gpxUploadId = useId();

    const legCardsContainerRef = useRef<HTMLDivElement | null>(null);

    // Auto-save storage key
    const storageKey = `ems_route_card_${expeditionId}_${teamId}_day${currentDay}`;

    // Load saved route on mount or day switch
    useEffect(() => {
        loadRouteForDay(currentDay);
    }, [currentDay]);

    // Save to LocalStorage whenever legs or vertices change
    useEffect(() => {
        if (vertices.length > 0 && legs.length > 0) {
            const draftPayload = {
                routeTitle,
                vertices,
                legs,
                cardId,
                cardStatus,
                timestamp: Date.now(),
            };
            try {
                localStorage.setItem(storageKey, JSON.stringify(draftPayload));
            } catch (e) {
                // Ignore quota errors
            }
        }
    }, [legs, vertices, routeTitle, cardId, cardStatus, storageKey]);

    const getApiUrl = (endpoint: string) => {
        const config = window.emsRouteCardStudioConfig;
        const base = (config?.root_url || '/wp-json/ems-route/v1').replace(/\/+$/, '');
        const cleanEndpoint = endpoint.replace(/^\/+/, '');
        if (base.endsWith('ems-route/v1')) {
            return `${base}/${cleanEndpoint}`;
        }
        return `${base}/ems-route/v1/${cleanEndpoint}`;
    };

    const loadRouteForDay = async (day: number) => {
        setIsLoading(true);
        setStatusMessage(null);
        setActiveLegIndex(0);

        const config = window.emsRouteCardStudioConfig;
        const nonce = config?.nonce || '';

        try {
            // Check REST API for saved card
            const res = await fetch(getApiUrl(`card/${expeditionId}/${teamId}/${day}`), {
                headers: { 'X-WP-Nonce': nonce },
            });

            if (res.ok) {
                const json = await res.json();
                if (json.success && json.data) {
                    const d = json.data;
                    setCardId(d.id);
                    setCardStatus(d.status || 'draft');
                    setRouteTitle(d.route_title || `Day ${day} Route`);
                    setLegs(d.legs_data || []);
                    setVertices(d.geometry_data || []);
                    setIsLoading(false);
                    return;
                }
            }
        } catch (e) {
            // Fallback to local draft
        }

        // Fallback to LocalStorage
        const local = localStorage.getItem(`ems_route_card_${expeditionId}_${teamId}_day${day}`);
        if (local) {
            try {
                const parsed = JSON.parse(local);
                setRouteTitle(parsed.routeTitle || `Day ${day} Route`);
                setLegs(parsed.legs || []);
                setVertices(parsed.vertices || []);
                setCardId(parsed.cardId);
                setCardStatus(parsed.cardStatus || 'draft');
                setIsLoading(false);
                return;
            } catch (e) {
                // Ignore parse error
            }
        }

        // Empty state for the day
        setRouteTitle(`Day ${day} Route`);
        setLegs([]);
        setVertices([]);
        setCardId(undefined);
        setCardStatus('draft');
        setIsLoading(false);
    };

    // Handle GPX Upload & Ingestion
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
            const hasPriorWork = legs.some((l) => (l.route_description && l.route_description.trim().length > 0) || (l.escape_route && l.escape_route.trim().length > 0));

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
                // Fresh import
                setRouteTitle(data.route_title || file.name.replace(/\.gpx$/i, ''));
                setVertices(data.vertices);
                setLegs(data.legs);
                setActiveLegIndex(0);
                setStatusMessage({ text: `GPX uploaded successfully: ${data.legs.length} legs generated.`, type: 'success' });
            }
        } catch (err: any) {
            setStatusMessage({ text: `Upload failed: ${err.message}`, type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    const confirmReimport = () => {
        if (!pendingReimport) return;
        setUndoStack((prev) => [...prev, legs]);
        setLegs(pendingReimport.reconciledLegs);
        setVertices(pendingReimport.newVertices);
        setRouteTitle(pendingReimport.title);
        setPendingReimport(null);
        setStatusMessage({ text: 'Route updated! Existing descriptions and escape plans preserved.', type: 'success' });
    };

    const cancelReimport = () => {
        setPendingReimport(null);
    };

    // Leg Splitting and Merging
    const handleSplitLeg = (legIdx: number, splitVertexIdx?: number) => {
        const leg = legs[legIdx];
        if (!leg) return;

        // If no vertex provided, split at midpoint
        const targetVertex = splitVertexIdx !== undefined
            ? splitVertexIdx
            : Math.floor((leg.start_vertex_index + leg.end_vertex_index) / 2);

        setUndoStack((prev) => [...prev, legs]);
        const updated = splitLegAtVertex(vertices, legs, legIdx, targetVertex);
        setLegs(updated);
        setActiveLegIndex(legIdx);
        setStatusMessage({ text: `Leg ${leg.leg_number} split into two legs.`, type: 'success' });
    };

    const handleMergeLeg = (legIdx: number) => {
        setUndoStack((prev) => [...prev, legs]);
        const updated = mergeLegsWithNext(vertices, legs, legIdx);
        setLegs(updated);
        setActiveLegIndex(Math.min(legIdx, updated.length - 1));
        setStatusMessage({ text: 'Legs merged successfully.', type: 'success' });
    };

    const handleUndo = () => {
        if (undoStack.length === 0) return;
        const prevLegs = undoStack[undoStack.length - 1];
        setUndoStack((prev) => prev.slice(0, prev.length - 1));
        setLegs(prevLegs);
        setStatusMessage({ text: 'Undo completed.', type: 'success' });
    };

    const handleUpdateLeg = (legIdx: number, updatedLeg: RouteLeg) => {
        const newLegs = [...legs];
        newLegs[legIdx] = updatedLeg;
        setLegs(newLegs);
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
                setCardId(json.card_id);
                setStatusMessage({ text: 'Route card saved as draft.', type: 'success' });
            } else {
                throw new Error(json.message || 'Failed to save');
            }
        } catch (e: any) {
            setStatusMessage({ text: `Save error: ${e.message}`, type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    // Calculate Summary Stats
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
            {/* Multi-Day Navigation Tabs */}
            <div className="ems-day-tabs">
                {Array.from({ length: totalDays }, (_, i) => i + 1).map((day) => (
                    <button
                        key={day}
                        type="button"
                        className={`ems-day-tab ${currentDay === day ? 'ems-day-tab--active' : ''}`}
                        onClick={() => setCurrentDay(day)}
                    >
                        Day {day}
                    </button>
                ))}
            </div>

            {/* Notification / Feedback Banner */}
            {statusMessage && (
                <div className={`ems-status-alert ems-status-alert--${statusMessage.type}`}>
                    <FontAwesomeIcon icon={statusMessage.type === 'success' ? faCheck : faTrashCan} />
                    <span>{statusMessage.text}</span>
                </div>
            )}

            {/* Top Toolbar: Route Title, Stats & Actions */}
            <div className="ems-builder-toolbar">
                <div className="ems-builder-title-group">
                    <label htmlFor={routeTitleId} className="screen-reader-text">Route Title</label>
                    <input
                        id={routeTitleId}
                        type="text"
                        className="ems-route-title-input"
                        value={routeTitle}
                        onChange={(e) => setRouteTitle(e.target.value)}
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

            {/* Empty State: Drag & Drop Dropzone */}
            {legs.length === 0 && !isLoading && (
                <div className="ems-gpx-dropzone">
                    <FontAwesomeIcon icon={faUpload} className="ems-dropzone-icon" />
                    <h3>Upload GPX Route for Day {currentDay}</h3>
                    <p>Drop any route GPX file from OS Maps, Strava, or Garmin. Our engine will enrich all coordinates with OSGB36 grid refs and OS Terrain 50 elevation.</p>

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
