import { useId, useRef, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronRight, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { RouteLeg, RouteVertex } from '../types/route-card';
import { formatHoursMins } from '../utils/route-calculations';

interface RouteLegCardProps {
    leg: RouteLeg;
    vertices?: RouteVertex[];
    isActive: boolean;
    isExpanded?: boolean;
    isLastLeg: boolean;
    nextLegStartName?: string;
    onSelect: () => void;
    onHoverLeg?: (isHovered: boolean) => void;
    onUpdateLeg: (updatedLeg: RouteLeg) => void;
    onSplitLeg?: () => void;
    onMergeLeg?: () => void;
    onPrevLeg?: () => void;
    onNextLeg?: () => void;
    autoFocusField?: 'start' | 'end' | null;
}

export function RouteLegCard({
    leg,
    vertices,
    isActive,
    isExpanded,
    isLastLeg,
    nextLegStartName: _nextLegStartName,
    onSelect,
    onHoverLeg,
    onUpdateLeg,
    onSplitLeg: _onSplitLeg,
    onMergeLeg: _onMergeLeg,
    onPrevLeg,
    onNextLeg,
    autoFocusField,
}: RouteLegCardProps) {
    const cardRef = useRef<HTMLDivElement | null>(null);
    const startNameInputRef = useRef<HTMLInputElement | null>(null);
    const endNameInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (isActive && cardRef.current && typeof cardRef.current.scrollIntoView === 'function') {
            cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [isActive]);

    useEffect(() => {
        if (!isActive) return;
        if (autoFocusField === 'start' && startNameInputRef.current) {
            startNameInputRef.current.focus();
            startNameInputRef.current.select();
        } else if (autoFocusField === 'end' && endNameInputRef.current) {
            endNameInputRef.current.focus();
            endNameInputRef.current.select();
        }
    }, [autoFocusField, isActive]);

    const startNameId = useId();
    const endNameId = useId();
    const navDescId = useId();
    const escapeRouteId = useId();
    const restMinsId = useId();
    const activityNotesId = useId();

    const navDescRef = useRef<HTMLTextAreaElement | null>(null);
    const escapeRouteRef = useRef<HTMLTextAreaElement | null>(null);
    const activityNotesRef = useRef<HTMLTextAreaElement | null>(null);

    const isFirstRenderRef = useRef(true);

    const syncTextareaHeight = (el: HTMLTextAreaElement | null) => {
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.max(34, el.scrollHeight)}px`;
    };

    const isCardExpanded = isExpanded !== undefined ? isExpanded : true;

    // Resilient fallback resolution for checkpoint names, coordinates, and elevations
    const vStart = vertices && vertices[leg.start_vertex_index];
    const vEnd = vertices && vertices[leg.end_vertex_index];

    const startName = leg.start_name || (leg as any).checkpoint_from || (leg.leg_number === 1 ? 'Start' : `Checkpoint ${leg.leg_number}`);
    const endName = leg.end_name || (leg as any).checkpoint_to || (isLastLeg ? 'Finish' : `Checkpoint ${leg.leg_number + 1}`);

    const startGrid = leg.start_grid_ref || (leg as any).start_grid_ref_6 || vStart?.grid_ref_6 || '';
    const endGrid = leg.end_grid_ref || (leg as any).end_grid_ref_6 || vEnd?.grid_ref_6 || '';

    const startEle = leg.start_elevation_m ?? vStart?.ele_dem ?? 0;
    const endEle = leg.end_elevation_m ?? vEnd?.ele_dem ?? 0;

    // Check description and escape route status
    const desc = leg.route_description !== undefined
        ? leg.route_description
        : ((leg as any).description ?? '');
    const descLength = desc.trim().length;
    const escapeLength = (leg.escape_route || '').trim().length;

    // Check completion status (Amber if missing navigation or escape details, Green if complete)
    const isLegComplete = Boolean(
        descLength >= 15 &&
        escapeLength > 0
    );
    const hasLegIssue = !isLegComplete || leg.distance_km > 3.5;

    // Touch swipe handling for horizontal stepping on touch devices
    const touchStartXRef = useRef<number | null>(null);

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartXRef.current = e.touches[0].clientX;
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (touchStartXRef.current === null) return;
        const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
        touchStartXRef.current = null;
        if (deltaX < -50 && onNextLeg) {
            onNextLeg();
        } else if (deltaX > 50 && onPrevLeg) {
            onPrevLeg();
        }
    };

    // Auto-scroll active card into view when selected
    useEffect(() => {
        if (isFirstRenderRef.current) {
            isFirstRenderRef.current = false;
            return;
        }
        if (isActive && cardRef.current && typeof cardRef.current.scrollIntoView === 'function') {
            cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [isActive]);

    const projectRestMins = leg.rest_minutes || 0;

    // Progressive disclosure state for optional stop / aim activity
    const hasInitialActivity = Boolean(leg.activity_notes && leg.activity_notes.trim().length > 0);
    const [showActivity, setShowActivity] = useState(hasInitialActivity || projectRestMins > 0);

    // Sync heights on render, expansion, and value changes
    useEffect(() => {
        if (!isCardExpanded) return;
        const syncAll = () => {
            syncTextareaHeight(navDescRef.current);
            syncTextareaHeight(escapeRouteRef.current);
            syncTextareaHeight(activityNotesRef.current);
        };
        syncAll();
        const rId = requestAnimationFrame(syncAll);
        const tId = setTimeout(syncAll, 60);
        return () => {
            cancelAnimationFrame(rId);
            clearTimeout(tId);
        };
    }, [isCardExpanded, desc, leg.escape_route, leg.activity_notes, showActivity]);

    const handleTextChange = (field: keyof RouteLeg, value: string | number) => {
        const updatedLeg: any = {
            ...leg,
            start_name: field === 'start_name' ? value : startName,
            end_name: field === 'end_name' ? value : endName,
            start_grid_ref: startGrid,
            end_grid_ref: endGrid,
            start_elevation_m: startEle,
            end_elevation_m: endEle,
            [field]: value,
        };
        if (field === 'route_description') {
            updatedLeg.description = value;
        }
        onUpdateLeg(updatedLeg as RouteLeg);
    };

    // Stats formatting string
    const climbDescentStr = leg.descent_m > 0
        ? `+${Math.round(leg.ascent_m)}m / -${Math.round(leg.descent_m)}m`
        : `+${Math.round(leg.ascent_m)}m`;

    // Collapsed Accordion Row (Inactive legs on desktop when expandAllLegs is false)
    if (!isCardExpanded) {
        return (
            <div
                ref={cardRef}
                className="ems-leg-summary-row"
                onClick={onSelect}
                onMouseEnter={() => onHoverLeg?.(true)}
                onMouseLeave={() => onHoverLeg?.(false)}
                title={`Click to focus Leg ${leg.leg_number}`}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect();
                    }
                }}
            >
                <div className="ems-leg-summary-left">
                    <span className="ems-leg-number-badge ems-leg-number-badge--sm" title={`Leg ${leg.leg_number}`}>
                        {leg.leg_number}
                    </span>
                    <span className="ems-leg-summary-names">
                        {startName} <span className="ems-summary-arrow">→</span> {endName}
                    </span>
                </div>

                <div className="ems-leg-summary-right">
                    <span className="ems-leg-summary-stats font-mono">
                        {leg.distance_km} km • +{Math.round(leg.ascent_m)}m • {formatHoursMins(leg.walking_minutes)}
                    </span>
                    {hasLegIssue && (
                        <span
                            className="ems-leg-status-dot ems-leg-status-dot--incomplete"
                            title="Needs route or escape details"
                            aria-label="Issues with leg"
                        >
                            ●
                        </span>
                    )}
                    <FontAwesomeIcon icon={faChevronRight} className="ems-summary-chevron" />
                </div>
            </div>
        );
    }

    return (
        <div
            ref={cardRef}
            className={`ems-leg-card ${isActive ? 'ems-leg-card--active' : ''}`}
            onClick={onSelect}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            {/* Header Area: Side-by-Side Vector + Flush Subtext + Inline Metadata Sub-bar */}
            <div className="ems-leg-card__header">
                {/* Horizontal Vector Row: [Badge] [FROM Input] [→] [TO Input] */}
                <div className="ems-leg-vector-row" onClick={(e) => e.stopPropagation()}>
                    <span className="ems-leg-number-badge" title={`Leg ${leg.leg_number}`}>
                        {leg.leg_number}
                    </span>

                    <div className="ems-waypoint-col ems-waypoint-col--start">
                        <input
                            ref={startNameInputRef}
                            id={startNameId}
                            type="text"
                            className="ems-waypoint-input ems-endpoint-input"
                            value={startName}
                            onChange={(e) => handleTextChange('start_name', e.target.value)}
                            placeholder="Start point"
                            title="Start waypoint name"
                        />
                        {startGrid && (
                            <div className="ems-waypoint-subtext">
                                {startGrid} • {Math.round(startEle)}m
                            </div>
                        )}
                    </div>

                    <span className="ems-vector-arrow" aria-hidden="true">
                        <span className="ems-desktop-arrow">→</span>
                        <span className="ems-mobile-arrow">↳</span>
                    </span>

                    <div className="ems-waypoint-col ems-waypoint-col--end">
                        <input
                            ref={endNameInputRef}
                            id={endNameId}
                            type="text"
                            className="ems-waypoint-input ems-endpoint-input"
                            value={endName}
                            onChange={(e) => handleTextChange('end_name', e.target.value)}
                            placeholder="End point"
                            title="End waypoint name"
                        />
                        {endGrid && (
                            <div className="ems-waypoint-subtext">
                                {endGrid} • {Math.round(endEle)}m
                            </div>
                        )}
                    </div>
                </div>

                {/* Inline Metadata Sub-bar */}
                <div className="ems-leg-subbar" onClick={(e) => e.stopPropagation()}>
                    <div className="ems-leg-stats-inline">
                        <span className="ems-stat-num"><b>{leg.distance_km}</b> km</span>
                        <span className="ems-stat-sep">•</span>
                        <span className="ems-stat-num">{climbDescentStr}</span>
                        <span className="ems-stat-sep">•</span>
                        <span className="ems-stat-num">{formatHoursMins(leg.walking_minutes)} walk</span>
                        {leg.distance_km > 3.5 && (
                            <>
                                <span className="ems-stat-sep">•</span>
                                <span className="ems-field-warning">
                                    <FontAwesomeIcon icon={faTriangleExclamation} /> Leg &gt; 3.5 km (hover map to split)
                                </span>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Body Area */}
            <div className="ems-leg-card__body leg-card-body">
                {/* Route Notes */}
                <div className="ems-leg-input-block" onClick={(e) => e.stopPropagation()}>
                    <div className="leg-field-label-row">
                        <label htmlFor={navDescId} className="ems-field-label">
                            ROUTE NOTES
                        </label>

                        {descLength === 0 ? (
                            <span className="ems-field-warning">
                                <FontAwesomeIcon icon={faTriangleExclamation} /> Add route notes
                            </span>
                        ) : descLength < 15 ? (
                            <span className="ems-field-warning">
                                <FontAwesomeIcon icon={faTriangleExclamation} /> Add bearings, paths or landmarks
                            </span>
                        ) : null}
                    </div>

                    <textarea
                        ref={(el) => {
                            navDescRef.current = el;
                            if (el) syncTextareaHeight(el);
                        }}
                        id={navDescId}
                        className="ems-textarea ems-auto-expand"
                        rows={1}
                        value={desc}
                        onInput={(e) => syncTextareaHeight(e.currentTarget)}
                        onChange={(e) => handleTextChange('route_description', e.target.value)}
                        placeholder="Paths, bearings, landmarks..."
                    />
                </div>

                {/* 2-Column Grid: Escape Route + Stops (mins) */}
                <div className="ems-leg-bottom-row" onClick={(e) => e.stopPropagation()}>
                    <div className="ems-leg-input-block ems-leg-input-block--escape">
                        <div className="leg-field-label-row">
                            <label htmlFor={escapeRouteId} className="ems-field-label">
                                ESCAPE ROUTE
                            </label>
                            {escapeLength === 0 && (
                                <span className="ems-field-warning">
                                    <FontAwesomeIcon icon={faTriangleExclamation} /> Add escape route
                                </span>
                            )}
                        </div>
                        <textarea
                            ref={(el) => {
                                escapeRouteRef.current = el;
                                if (el) syncTextareaHeight(el);
                            }}
                            id={escapeRouteId}
                            rows={1}
                            className="ems-auto-expand"
                            value={leg.escape_route || ''}
                            onInput={(e) => syncTextareaHeight(e.currentTarget)}
                            onChange={(e) => handleTextChange('escape_route', e.target.value)}
                            placeholder="How to get to safety if something happens"
                        />
                    </div>

                    <div className="ems-leg-input-block ems-leg-input-block--rest">
                        <div className="leg-field-label-row">
                            <label htmlFor={restMinsId} className="ems-field-label">
                                STOPS (MIN)
                            </label>
                        </div>
                        <input
                            id={restMinsId}
                            type="number"
                            min="0"
                            max="300"
                            step="5"
                            className="ems-input-number"
                            value={projectRestMins}
                            onChange={(e) => {
                                const val = parseInt(e.target.value, 10) || 0;
                                handleTextChange('rest_minutes', val);
                                if (val > 0) setShowActivity(true);
                            }}
                        />
                    </div>
                </div>

                {/* Conditional Stop / Aim Activity Field or Explicit Ghost Button */}
                {(showActivity || projectRestMins > 0 || hasInitialActivity) ? (
                    <div className="ems-leg-input-block ems-leg-input-block--activity" onClick={(e) => e.stopPropagation()}>
                        <div className="leg-field-label-row">
                            <label htmlFor={activityNotesId} className="ems-field-label">
                                STOP / AIM ACTIVITY
                            </label>
                        </div>
                        <textarea
                            ref={(el) => {
                                activityNotesRef.current = el;
                                if (el) syncTextareaHeight(el);
                            }}
                            id={activityNotesId}
                            rows={1}
                            className="ems-auto-expand"
                            value={leg.activity_notes || ''}
                            onInput={(e) => syncTextareaHeight(e.currentTarget)}
                            onChange={(e) => handleTextChange('activity_notes', e.target.value)}
                            placeholder="Expedition aim / team project observation..."
                        />
                    </div>
                ) : (
                    <button
                        type="button"
                        className="ems-ghost-btn ems-ghost-btn--add-activity"
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowActivity(true);
                            setTimeout(() => {
                                activityNotesRef.current?.focus();
                            }, 50);
                        }}
                    >
                        + Add stop or aim activity
                    </button>
                )}
            </div>
        </div>
    );
}
