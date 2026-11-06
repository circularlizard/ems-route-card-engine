import { useState, useEffect, useRef, useId, useCallback, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faUpload,
    faFloppyDisk,
    faTable,
    faMapLocationDot,
    faTrashCan,
    faCircleNotch,
    faRotateLeft,
    faCheck,
    faChevronLeft,
    faChevronRight,
    faExpand,
    faCompress,
    faPrint,
} from '@fortawesome/free-solid-svg-icons';

import { RouteLeg, RouteVertex, EnrichedRouteData, ReimportLegDiff, RouteHeaderData } from '../types/route-card';
import {
    splitLegAtVertex,
    mergeLegsWithNext,
    moveCheckpointToVertex,
    reconcileReimport,
    formatHoursMins,
    calculateLegSchedule,
    createDefaultHeaderData,
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
    dofeLevel?: 'bronze' | 'silver' | 'gold';
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
    headerData?: RouteHeaderData;
}

export function RouteCardBuilder({
    expeditionId = 1,
    teamId = 1,
    initialDay = 1,
    totalDays = 3,
    dofeLevel,
    osMapsApiKey,
    onExportPdf,
}: RouteCardBuilderProps) {
    const [currentDay, setCurrentDay] = useState(initialDay);
    const [viewMode, setViewMode] = useState<'planner' | 'routecard'>('planner');
    const [activeLegIndex, setActiveLegIndex] = useState(0);
    const [hoveredVertexIndex, setHoveredVertexIndex] = useState<number | null>(null);
    const [hoveredLegIndex, setHoveredLegIndex] = useState<number | null>(null);
    const [expandAllLegs, setExpandAllLegs] = useState(false);
    const [recentlySplitIndex, setRecentlySplitIndex] = useState<number | null>(null);
    const [isMobileStepper, setIsMobileStepper] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 1024 : false));
    const [ghostSplitVertexIndex, setGhostSplitVertexIndex] = useState<number | null>(null);
    const [draggingCheckpoint, setDraggingCheckpoint] = useState<{ checkpointIndex: number; vertexIndex: number } | null>(null);
    const [autoFocusSplitField, setAutoFocusSplitField] = useState<'start' | 'end' | null>(null);
    const [isMapFocusMode, setIsMapFocusMode] = useState(false);

    useEffect(() => {
        const handleResize = () => {
            setIsMobileStepper(window.innerWidth <= 1024);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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

    const defaultHeader = useMemo(() => createDefaultHeaderData(currentDay, expeditionId), [currentDay, expeditionId]);
    const headerData: RouteHeaderData = activeDayData.headerData || defaultHeader;

    // Global keyboard navigation: Alt + ArrowUp/Left (Prev Leg), Alt + ArrowDown/Right (Next Leg)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowLeft')) {
                e.preventDefault();
                setActiveLegIndex((prev) => Math.max(0, prev - 1));
            } else if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowRight')) {
                e.preventDefault();
                setActiveLegIndex((prev) => Math.min(legs.length - 1, prev + 1));
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [legs.length]);

    // UI Loading & Feedback
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const [isMobileStatsExpanded, setIsMobileStatsExpanded] = useState(false);

    // Auto-dismiss status toast after 3 seconds
    useEffect(() => {
        if (!statusMessage) return;
        const timer = setTimeout(() => {
            setStatusMessage(null);
        }, 3000);
        return () => clearTimeout(timer);
    }, [statusMessage]);

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
    const stickyHeaderRef = useRef<HTMLDivElement | null>(null);

    // Dynamically measure sticky header height & admin bar offset to guarantee the map never scrolls under the sticky header
    useEffect(() => {
        const updateStickyOffsets = () => {
            if (typeof document === 'undefined') return;

            const adminBar = document.getElementById('wpadminbar');
            const adminBarHeight = adminBar
                ? Math.round(adminBar.getBoundingClientRect().height)
                : (document.body.classList.contains('admin-bar') ? (window.innerWidth <= 782 ? 46 : 32) : 0);

            document.documentElement.style.setProperty('--ems-sticky-top-offset', `${adminBarHeight}px`);

            if (stickyHeaderRef.current) {
                const headerHeight = Math.round(stickyHeaderRef.current.getBoundingClientRect().height);
                if (headerHeight > 0) {
                    document.documentElement.style.setProperty('--ems-sticky-header-height', `${headerHeight}px`);
                }
            }
        };

        updateStickyOffsets();

        let ro: ResizeObserver | null = null;
        if (typeof ResizeObserver !== 'undefined' && stickyHeaderRef.current) {
            ro = new ResizeObserver(() => {
                updateStickyOffsets();
            });
            ro.observe(stickyHeaderRef.current);
        }

        window.addEventListener('resize', updateStickyOffsets);
        return () => {
            if (ro) ro.disconnect();
            window.removeEventListener('resize', updateStickyOffsets);
        };
    }, [isMobileStatsExpanded]);

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
    const updateActiveDay = useCallback((patch: Partial<DayRouteData>) => {
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
    }, [currentDay, expeditionId, teamId]);

    const handleUpdateHeaderData = useCallback((patch: Partial<RouteHeaderData>) => {
        updateActiveDay({
            headerData: {
                ...headerData,
                ...patch,
            },
        });
    }, [headerData, updateActiveDay]);

    // Auto-derive startGridRef from leg 1 start if not yet set
    useEffect(() => {
        if (legs.length > 0 && legs[0]?.start_grid_ref && !activeDayData.headerData?.startGridRef) {
            updateActiveDay({
                headerData: {
                    ...headerData,
                    startGridRef: legs[0].start_grid_ref,
                    startPointDescription: headerData.startPointDescription || legs[0].start_name || '',
                },
            });
        }
    }, [legs, currentDay, activeDayData.headerData?.startGridRef, headerData, updateActiveDay]);

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
                                    headerData: d.header_data || createDefaultHeaderData(currentDay, expeditionId),
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

    // Leg Splitting, Checkpoint Moving and Merging
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
        setActiveLegIndex(legIdx + 1);
        setRecentlySplitIndex(legIdx + 1);
        setAutoFocusSplitField('start');
        setTimeout(() => setRecentlySplitIndex(null), 2500);
        setTimeout(() => setAutoFocusSplitField(null), 1000);
        setStatusMessage({ text: `Leg ${leg.leg_number} split into two legs.`, type: 'success' });
    };

    const handleMoveCheckpoint = (checkpointIdx: number, newVertexIdx: number) => {
        const updated = moveCheckpointToVertex(vertices, legs, checkpointIdx, newVertexIdx);
        updateActiveDay({
            legs: updated,
            undoStack: [...undoStack, legs],
        });
        setStatusMessage({
            text: `Checkpoint moved to ${vertices[newVertexIdx]?.grid_ref_6 || 'new position'}.`,
            type: 'success',
        });
    };

    const handleDeleteCheckpoint = (checkpointIdx: number) => {
        if (checkpointIdx < 1 || checkpointIdx >= legs.length) return;
        const legA = legs[checkpointIdx - 1];
        const legB = legs[checkpointIdx];
        const cpName = legA?.end_name || legB?.start_name || `Checkpoint ${checkpointIdx}`;
        const confirmed = window.confirm(
            `Delete checkpoint "${cpName}" and merge Leg ${checkpointIdx} with Leg ${checkpointIdx + 1}?`
        );
        if (!confirmed) return;
        handleMergeLeg(checkpointIdx - 1);
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

    const handleSelectLeg = useCallback((idx: number) => {
        setActiveLegIndex(idx);
        setHoveredVertexIndex(null);
        setGhostSplitVertexIndex(null);
    }, []);

    const handleHoverVertex = useCallback((vIdx: number | null) => {
        setHoveredVertexIndex(vIdx);
    }, []);

    const handleGhostHoverVertex = useCallback((vIdx: number | null) => {
        setGhostSplitVertexIndex(vIdx);
    }, []);

    const handleDragCheckpointChange = useCallback((drag: { checkpointIndex: number; vertexIndex: number } | null) => {
        setDraggingCheckpoint(drag);
    }, []);

    const handleUpdateLeg = (legIdx: number, updatedLeg: RouteLeg) => {
        const newLegs = [...legs];
        newLegs[legIdx] = updatedLeg;

        // If start_name changed on this leg, sync the previous leg's end_name
        if (legIdx > 0 && updatedLeg.start_name !== legs[legIdx]?.start_name) {
            newLegs[legIdx - 1] = {
                ...newLegs[legIdx - 1],
                end_name: updatedLeg.start_name,
            };
        }

        // If end_name changed on this leg, sync the next leg's start_name
        if (legIdx < newLegs.length - 1 && updatedLeg.end_name !== legs[legIdx]?.end_name) {
            newLegs[legIdx + 1] = {
                ...newLegs[legIdx + 1],
                start_name: updatedLeg.end_name,
            };
        }

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
            headerData: createDefaultHeaderData(currentDay, expeditionId),
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
            legs_data: legs,
            total_distance_km: totalDistanceKm,
            total_ascent_m: totalAscentM,
            estimated_walking_minutes: totalWalkingMins,
            header_data: headerData,
            route_data: {
                legs: legs,
                vertices: vertices,
                total_distance_km: totalDistanceKm,
                total_ascent_m: totalAscentM,
                estimated_walking_minutes: totalWalkingMins,
            },
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
                const savedId = json.card_id || json.route_card?.id;
                updateActiveDay({ cardId: savedId });
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

    const handlePrint = async () => {
        let currentCardId = cardId;
        const config = window.emsRouteCardStudioConfig;
        const nonce = config?.nonce || '';

        const currentDayPayload = {
            id: cardId,
            expedition_id: expeditionId,
            team_id: teamId,
            day_number: currentDay,
            route_title: routeTitle,
            legs: legs,
            legs_data: legs,
            total_distance_km: totalDistanceKm,
            total_ascent_m: totalAscentM,
            estimated_walking_minutes: totalWalkingMins,
            header_data: headerData,
            route_data: {
                legs: legs,
                vertices: vertices,
                total_distance_km: totalDistanceKm,
                total_ascent_m: totalAscentM,
                estimated_walking_minutes: totalWalkingMins,
            },
        };

        // Auto-save draft before opening PDF so database is updated
        try {
            const res = await fetch(getApiUrl(`card/${cardId || 0}/save`), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-WP-Nonce': nonce,
                },
                body: JSON.stringify(currentDayPayload),
            });

            if (res.ok) {
                const json = await res.json();
                if (json.success && (json.card_id || json.route_card?.id)) {
                    currentCardId = json.card_id || json.route_card?.id;
                    updateActiveDay({ cardId: currentCardId });
                }
            }
        } catch (e) {
            // Ignore network errors in offline/mock mode
        }

        // Try direct high-fidelity PDF stream via POST preview-pdf
        try {
            const activeCards: Array<any> = [];
            for (let d = 1; d <= totalDays; d++) {
                const dData = daysData[d];
                if (d === currentDay) {
                    activeCards.push(currentDayPayload);
                } else if (dData && dData.legs && dData.legs.length > 0) {
                    activeCards.push({
                        id: dData.cardId,
                        expedition_id: expeditionId,
                        team_id: teamId,
                        day_number: d,
                        route_title: dData.routeTitle || `Day ${d} Route`,
                        legs: dData.legs,
                        legs_data: dData.legs,
                        header_data: dData.headerData || createDefaultHeaderData(d, expeditionId),
                        route_data: {
                            legs: dData.legs,
                            vertices: dData.vertices,
                        },
                    });
                }
            }

            const cardsToSend = activeCards.length > 0 ? activeCards : [currentDayPayload];

            const previewRes = await fetch(getApiUrl('card/preview-pdf'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-WP-Nonce': nonce,
                },
                body: JSON.stringify({ cards: cardsToSend }),
            });

            if (previewRes.ok) {
                const blob = await previewRes.blob();
                const blobUrl = URL.createObjectURL(blob);
                window.open(blobUrl, '_blank');
                if (onExportPdf) {
                    onExportPdf(currentCardId);
                }
                return;
            }
        } catch (e) {
            // Fallback to GET endpoint below if preview-pdf fails
        }

        const pdfEndpoint = currentCardId
            ? `card/${currentCardId}/pdf?all_days=1`
            : `card/${expeditionId}/${teamId}/${currentDay}/pdf?all_days=1`;

        const pdfUrl = getApiUrl(pdfEndpoint);
        const finalUrl = nonce ? `${pdfUrl}&_wpnonce=${encodeURIComponent(nonce)}` : pdfUrl;

        window.open(finalUrl, '_blank');

        if (onExportPdf) {
            onExportPdf(currentCardId);
        }
    };

    // Pacing calculations & cascading schedule
    const legSchedule = useMemo(() => {
        return calculateLegSchedule(
            legs,
            headerData.settingOutTime || '09:00',
            headerData.baseWalkingSpeedKmh ?? 4.0,
            headerData.elevationPenaltyMinsPer10m ?? 1.0
        );
    }, [legs, headerData.settingOutTime, headerData.baseWalkingSpeedKmh, headerData.elevationPenaltyMinsPer10m]);

    // Summary calculations for active day
    const totalDistanceKm = Math.round(legs.reduce((acc, l) => acc + l.distance_km, 0) * 100) / 100;
    const totalAscentM = Math.round(legs.reduce((acc, l) => acc + l.ascent_m, 0));
    const totalWalkingMins = useMemo(() => {
        return legSchedule.length > 0
            ? legSchedule.reduce((acc, item) => acc + item.walkTimeMinutes, 0)
            : legs.reduce((acc, l) => acc + (l.walking_minutes || 0), 0);
    }, [legSchedule, legs]);
    const totalProjectRestMins = useMemo(() => {
        return legSchedule.length > 0
            ? legSchedule.reduce((acc, item) => acc + item.stopsMinutes, 0)
            : legs.reduce((acc, l) => acc + (l.rest_minutes || 0), 0);
    }, [legSchedule, legs]);
    const totalExpeditionMins = totalWalkingMins + totalProjectRestMins;

    const resolvedDofeLevel: 'bronze' | 'silver' | 'gold' = (
        dofeLevel ||
        ((window as any).emsRouteCardStudioConfig?.dofe_level as any)?.toLowerCase?.() ||
        'silver'
    );
    const minDurationHours = resolvedDofeLevel === 'bronze' ? 6 : resolvedDofeLevel === 'gold' ? 8 : 7;
    const minDurationMins = minDurationHours * 60;

    const isStopsTooShort = legs.length > 0 && totalExpeditionMins > 0 && (totalProjectRestMins / totalExpeditionMins) < 0.15;
    const isDurationTooShort = legs.length > 0 && totalExpeditionMins > 0 && totalExpeditionMins < minDurationMins;

    return (
        <div className="ems-builder-container">
            {/* Transient Toast Notification */}
            {statusMessage && (
                <div className={`ems-toast ems-toast--${statusMessage.type}`} role="status">
                    <FontAwesomeIcon icon={statusMessage.type === 'success' ? faCheck : faTrashCan} />
                    <span>{statusMessage.text}</span>
                </div>
            )}

            {/* Sticky Header: Route Header & Actions + Compact Info Bar with View Control */}
            <div ref={stickyHeaderRef} className="ems-builder-sticky-header">
                {/* Top Toolbar */}
                <div className="ems-builder-toolbar">
                    <div className="ems-builder-title-group">
                        <div className="ems-builder-title-row">
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

                        {/* Multi-Day Navigation Segmented Control */}
                        <div className="ems-day-segmented-control" aria-label="Day selection">
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
                                        className={`ems-day-segment-btn ${currentDay === day ? 'ems-day-segment-btn--active' : ''}`}
                                        onClick={() => {
                                            setCurrentDay(day);
                                            setActiveLegIndex(0);
                                            setStatusMessage(null);
                                        }}
                                    >
                                        Day {day}
                                        {hasRoute && <span className="ems-day-segment-dist">({distKm} km)</span>}
                                    </button>
                                );
                            })}
                        </div>
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
                    </div>
                </div>

                {/* Route Stats Summary Bar */}
                {legs.length > 0 && (
                    <div className="ems-route-stats-bar ems-route-stats-bar--compact">
                        {/* Mobile 1-Line Collapsible Summary */}
                        <div className="ems-mobile-stats-header">
                            <span className="ems-mobile-stats-summary">
                                {totalDistanceKm}km • +{totalAscentM}m • {formatHoursMins(totalExpeditionMins)}
                                {(isDurationTooShort || isStopsTooShort) && (
                                    <span className="ems-stat-warning-chip" title={isDurationTooShort ? `Under ${minDurationHours}h minimum` : 'Stops under 15%'}>
                                        too short
                                    </span>
                                )}
                            </span>
                            <button
                                type="button"
                                className="ems-mobile-stats-toggle"
                                onClick={() => setIsMobileStatsExpanded((prev) => !prev)}
                                aria-expanded={isMobileStatsExpanded}
                            >
                                {isMobileStatsExpanded ? 'Hide Details ▴' : 'Stats ▾'}
                            </button>
                        </div>

                        {/* Detailed Stats Pills */}
                        <div className={`ems-stats-pills-group ${isMobileStatsExpanded ? 'ems-stats-pills-group--expanded' : ''}`}>
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
                                <span className="ems-stat-pill__label">Stops</span>
                                <span className="ems-stat-pill__val">
                                    {formatHoursMins(totalProjectRestMins)}
                                    {isStopsTooShort && (
                                        <span className="ems-stat-warning-chip" title="Total stops are less than 15% of the total duration">
                                            too short
                                        </span>
                                    )}
                                </span>
                            </div>
                            <div className="ems-stat-pill ems-stat-pill--highlight">
                                <span className="ems-stat-pill__label">Total Expedition</span>
                                <span className="ems-stat-pill__val">
                                    {formatHoursMins(totalExpeditionMins)}
                                    {isDurationTooShort && (
                                        <span className="ems-stat-warning-chip" title={`Total duration does not meet the minimum ${minDurationHours}h requirement for DofE ${resolvedDofeLevel.toUpperCase()}`}>
                                            too short
                                        </span>
                                    )}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Mode Switcher & Print Action Bar */}
                <div className="ems-builder-mode-bar">
                    <div className="ems-mode-toggle" role="tablist" aria-label="View Mode">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={viewMode === 'planner'}
                            className={`ems-mode-btn ${viewMode === 'planner' ? 'ems-mode-btn--active' : ''}`}
                            onClick={() => setViewMode('planner')}
                            title="Interactive Map & Journey Leg Cards"
                        >
                            <FontAwesomeIcon icon={faMapLocationDot} /> Interactive Planner
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={viewMode === 'routecard'}
                            className={`ems-mode-btn ${viewMode === 'routecard' ? 'ems-mode-btn--active' : ''}`}
                            onClick={() => setViewMode('routecard')}
                            title="Comprehensive DofE Route Card Table"
                        >
                            <FontAwesomeIcon icon={faTable} /> Route Card
                        </button>
                    </div>

                    <button
                        type="button"
                        className="ems-btn ems-btn--print"
                        onClick={handlePrint}
                        disabled={legs.length === 0}
                        title="Print or Save as PDF"
                    >
                        <FontAwesomeIcon icon={faPrint} /> Print / Save as PDF
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

            {/* Pre-Flight Coaching Checks */}
            {legs.length > 0 && (
                <RouteCoachingBanner
                    legs={legs}
                    totalWalkingMinutes={totalWalkingMins}
                    totalRestMinutes={totalProjectRestMins}
                    dofeLevel={resolvedDofeLevel}
                    onSelectLeg={(idx) => {
                        setActiveLegIndex(idx);
                        if (viewMode !== 'planner') {
                            setViewMode('planner');
                        }
                    }}
                />
            )}

            {/* Interactive Planner View: Split Map + Journey Segment Cards */}
            {legs.length > 0 && viewMode === 'planner' && (
                <>
                    <div className={`ems-studio-split-layout ${isMapFocusMode ? 'ems-studio-split-layout--map-focused' : ''}`}>
                        {/* Left Pane: Interactive Map & Elevation Profile */}
                        <div className={`ems-studio-pane ems-studio-pane--map ${isMapFocusMode ? 'ems-studio-pane--map-focused' : ''}`}>
                            <RouteMap
                                vertices={vertices}
                                legs={legs}
                                activeLegIndex={activeLegIndex}
                                onSelectLeg={handleSelectLeg}
                                onRequestSplitAtVertex={(vertexIdx) => handleSplitLeg(activeLegIndex, vertexIdx)}
                                onMoveCheckpoint={handleMoveCheckpoint}
                                onDeleteCheckpoint={handleDeleteCheckpoint}
                                ghostSplitVertexIndex={ghostSplitVertexIndex}
                                onGhostHoverVertex={handleGhostHoverVertex}
                                draggingCheckpoint={draggingCheckpoint}
                                onDragCheckpointChange={handleDragCheckpointChange}
                                osMapsApiKey={osMapsApiKey}
                                hoveredVertexIndex={hoveredVertexIndex}
                                onHoverVertex={handleHoverVertex}
                                hoveredLegIndex={hoveredLegIndex}
                                isFocusMode={isMapFocusMode}
                                onToggleFocusMode={setIsMapFocusMode}
                            />

                            <RouteElevationProfile
                                vertices={vertices}
                                legs={legs}
                                activeLegIndex={activeLegIndex}
                                hoveredVertexIndex={hoveredVertexIndex}
                                onSelectLeg={handleSelectLeg}
                                onHoverVertex={handleHoverVertex}
                                onRequestSplitAtVertex={(vertexIdx) => handleSplitLeg(activeLegIndex, vertexIdx)}
                                onMoveCheckpoint={handleMoveCheckpoint}
                                onDeleteCheckpoint={handleDeleteCheckpoint}
                                ghostSplitVertexIndex={ghostSplitVertexIndex}
                                onGhostHoverVertex={handleGhostHoverVertex}
                                draggingCheckpoint={draggingCheckpoint}
                                onDragCheckpointChange={handleDragCheckpointChange}
                            />
                        </div>

                        {/* Right Pane: Synchronized Journey Segment Cards */}
                        <div ref={legCardsContainerRef} className="ems-studio-pane ems-studio-pane--cards">
                            <div className="ems-cards-deck-header">
                                <h3>Journey Legs ({legs.length})</h3>
                                {!isMobileStepper && (
                                    <button
                                        type="button"
                                        className="ems-deck-toggle-btn"
                                        onClick={() => setExpandAllLegs((prev) => !prev)}
                                        title={expandAllLegs ? 'Collapse inactive legs to 44px summary bars' : 'Expand all legs for editing'}
                                    >
                                        <FontAwesomeIcon icon={expandAllLegs ? faCompress : faExpand} />
                                        <span>{expandAllLegs ? 'Collapse to Active' : 'Expand All'}</span>
                                    </button>
                                )}
                            </div>

                            {/* Mobile & Tablet Stepper Bar */}
                            {isMobileStepper && (
                                <div className="ems-leg-stepper-bar" role="navigation" aria-label="Leg Stepper">
                                    <button
                                        type="button"
                                        className="ems-stepper-btn"
                                        onClick={() => setActiveLegIndex((prev) => Math.max(0, prev - 1))}
                                        disabled={activeLegIndex === 0}
                                        title="Previous Leg (Alt + Left)"
                                    >
                                        <FontAwesomeIcon icon={faChevronLeft} /> Prev
                                    </button>

                                    <div className="ems-stepper-center">
                                        <span className="ems-stepper-label">
                                            Leg {activeLegIndex + 1} of {legs.length}
                                        </span>
                                        <div className="ems-stepper-pills">
                                            {legs.map((l, lIdx) => {
                                                const isComplete = Boolean(
                                                    l.route_description &&
                                                    l.route_description.trim().length >= 10 &&
                                                    l.escape_route &&
                                                    l.escape_route.trim().length >= 5
                                                );
                                                const isCurrent = lIdx === activeLegIndex;
                                                const isNew = lIdx === recentlySplitIndex;

                                                return (
                                                    <button
                                                        key={l.leg_number}
                                                        type="button"
                                                        className={`ems-stepper-pill ${isCurrent ? 'ems-stepper-pill--active' : ''} ${isComplete ? 'ems-stepper-pill--complete' : 'ems-stepper-pill--incomplete'} ${isNew ? 'ems-stepper-pill--flash' : ''}`}
                                                        onClick={() => setActiveLegIndex(lIdx)}
                                                        title={`Jump to Leg ${l.leg_number} (${l.start_name} → ${l.end_name})`}
                                                    >
                                                        {l.leg_number}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        className="ems-stepper-btn"
                                        onClick={() => setActiveLegIndex((prev) => Math.min(legs.length - 1, prev + 1))}
                                        disabled={activeLegIndex === legs.length - 1}
                                        title="Next Leg (Alt + Right)"
                                    >
                                        Next <FontAwesomeIcon icon={faChevronRight} />
                                    </button>
                                </div>
                            )}

                            <div className="ems-leg-cards-list">
                                {legs.map((leg, idx) => {
                                    if (isMobileStepper && idx !== activeLegIndex) {
                                        return null;
                                    }
                                    const isCardExpanded = isMobileStepper ? true : (expandAllLegs || idx === activeLegIndex);
                                    return (
                                        <RouteLegCard
                                            key={leg.leg_number}
                                            leg={leg}
                                            vertices={vertices}
                                            scheduleItem={legSchedule[idx]}
                                            isActive={idx === activeLegIndex}
                                            isExpanded={isCardExpanded}
                                            isLastLeg={idx === legs.length - 1}
                                            nextLegStartName={legs[idx + 1]?.start_name}
                                            onSelect={() => setActiveLegIndex(idx)}
                                            onHoverLeg={(hovered) => setHoveredLegIndex(hovered ? idx : null)}
                                            onUpdateLeg={(updated) => handleUpdateLeg(idx, updated)}
                                            onSplitLeg={() => handleSplitLeg(idx)}
                                            onMergeLeg={() => handleMergeLeg(idx)}
                                            onPrevLeg={() => setActiveLegIndex((prev) => Math.max(0, prev - 1))}
                                            onNextLeg={() => setActiveLegIndex((prev) => Math.min(legs.length - 1, prev + 1))}
                                            autoFocusField={idx === activeLegIndex ? autoFocusSplitField : null}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Print container: rendered for printing full route card even from planner view */}
                    <div className="ems-print-only" aria-hidden="true">
                        <RouteLegTable
                            legs={legs}
                            headerData={headerData}
                            onUpdateHeaderData={handleUpdateHeaderData}
                            activeLegIndex={activeLegIndex}
                            onSelectLeg={handleSelectLeg}
                            onUpdateLeg={handleUpdateLeg}
                            onSplitLeg={handleSplitLeg}
                            onMergeLeg={handleMergeLeg}
                        />
                    </div>
                </>
            )}

            {/* Route Card View: Comprehensive DofE Full-Width Table */}
            {legs.length > 0 && viewMode === 'routecard' && (
                <div className="ems-studio-table-layout">
                    <RouteLegTable
                        legs={legs}
                        headerData={headerData}
                        onUpdateHeaderData={handleUpdateHeaderData}
                        activeLegIndex={activeLegIndex}
                        onSelectLeg={handleSelectLeg}
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
