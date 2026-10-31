import { useId, useRef, useEffect, useState } from 'react';
import { RouteLeg, RouteVertex } from '../types/route-card';
import { formatHoursMins } from '../utils/route-calculations';

interface RouteLegCardProps {
    leg: RouteLeg;
    vertices?: RouteVertex[];
    isActive: boolean;
    isLastLeg: boolean;
    nextLegStartName?: string;
    onSelect: () => void;
    onUpdateLeg: (updatedLeg: RouteLeg) => void;
    onSplitLeg: () => void;
    onMergeLeg: () => void;
}

export function RouteLegCard({
    leg,
    vertices,
    isActive,
    isLastLeg,
    nextLegStartName: _nextLegStartName,
    onSelect,
    onUpdateLeg,
    onSplitLeg,
    onMergeLeg,
}: RouteLegCardProps) {
    const cardRef = useRef<HTMLDivElement | null>(null);

    const startNameId = useId();
    const endNameId = useId();
    const navDescId = useId();
    const escapeRouteId = useId();
    const restMinsId = useId();
    const activityNotesId = useId();

    const isFirstRenderRef = useRef(true);

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

    // Resilient fallback resolution for checkpoint names, coordinates, and elevations
    const vStart = vertices && vertices[leg.start_vertex_index];
    const vEnd = vertices && vertices[leg.end_vertex_index];

    const startName = leg.start_name || (leg as any).checkpoint_from || (leg.leg_number === 1 ? 'Start' : `Checkpoint ${leg.leg_number}`);
    const endName = leg.end_name || (leg as any).checkpoint_to || (isLastLeg ? 'Finish' : `Checkpoint ${leg.leg_number + 1}`);

    const startGrid = leg.start_grid_ref || (leg as any).start_grid_ref_6 || vStart?.grid_ref_6 || '';
    const endGrid = leg.end_grid_ref || (leg as any).end_grid_ref_6 || vEnd?.grid_ref_6 || '';

    const startEle = leg.start_elevation_m ?? vStart?.ele_dem ?? 0;
    const endEle = leg.end_elevation_m ?? vEnd?.ele_dem ?? 0;

    // Check description quality
    const desc = leg.route_description !== undefined
        ? leg.route_description
        : ((leg as any).description ?? '');
    const wordCount = desc.trim() ? desc.trim().split(/\s+/).length : 0;
    const navKeywords = ['stream', 'burn', 'track', 'path', 'ridge', 'cairn', 'col', 'contour', 'handrail', 'wall', 'fence', 'summit'];
    const foundKeywords = navKeywords.filter((kw) => desc.toLowerCase().includes(kw));

    let qualityStatus: 'poor' | 'medium' | 'good' = 'poor';
    if (wordCount >= 15 && foundKeywords.length >= 2) {
        qualityStatus = 'good';
    } else if (wordCount >= 8 || foundKeywords.length >= 1) {
        qualityStatus = 'medium';
    }

    const projectRestMins = leg.rest_minutes || 0;

    // Progressive disclosure state for optional project activity
    const hasInitialActivity = Boolean(leg.activity_notes && leg.activity_notes.trim().length > 0);
    const [showActivity, setShowActivity] = useState(hasInitialActivity || projectRestMins > 0);

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

    return (
        <div
            ref={cardRef}
            className={`ems-leg-card ${isActive ? 'ems-leg-card--active' : ''}`}
            onClick={onSelect}
        >
            {/* Header Area: Side-by-Side Vector + Flush Subtext + Inline Metadata Sub-bar */}
            <div className="ems-leg-card__header">
                {/* Horizontal Vector Row: [Badge] [FROM Input] [→] [TO Input] */}
                <div className="ems-leg-vector-row" onClick={(e) => e.stopPropagation()}>
                    <span className="ems-leg-number-badge" title={`Leg ${leg.leg_number}`}>
                        {leg.leg_number}
                    </span>

                    <div className="ems-waypoint-col">
                        <input
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

                    <span className="ems-vector-arrow" aria-hidden="true">→</span>

                    <div className="ems-waypoint-col">
                        <input
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

                {/* Inline Metadata & Action Sub-bar */}
                <div className="ems-leg-subbar" onClick={(e) => e.stopPropagation()}>
                    <div className="ems-leg-stats-inline">
                        <span className="ems-stat-num"><b>{leg.distance_km}</b> km</span>
                        <span className="ems-stat-sep">•</span>
                        <span className="ems-stat-num">{climbDescentStr}</span>
                        <span className="ems-stat-sep">•</span>
                        <span className="ems-stat-num">{formatHoursMins(leg.walking_minutes)} walk</span>
                    </div>

                    <div className="ems-leg-ghost-actions">
                        <button
                            type="button"
                            className="ems-ghost-link"
                            title="Split leg at midpoint"
                            onClick={onSplitLeg}
                        >
                            Split Leg
                        </button>
                        {!isLastLeg && (
                            <>
                                <span className="ems-ghost-sep">•</span>
                                <button
                                    type="button"
                                    className="ems-ghost-link"
                                    title="Merge with next leg"
                                    onClick={onMergeLeg}
                                >
                                    Merge with Next
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Body Area */}
            <div className="ems-leg-card__body">
                {/* Route Navigation Description */}
                <div className="ems-leg-input-block" onClick={(e) => e.stopPropagation()}>
                    <div className="ems-input-label-row">
                        <label htmlFor={navDescId} className="ems-field-label">
                            Route Navigation Description
                        </label>

                        <div className={`ems-quality-dot ems-quality-dot--${qualityStatus}`}>
                            <span className="ems-dot" aria-hidden="true">●</span>
                            <span>{qualityStatus === 'good' ? 'Detailed' : qualityStatus === 'medium' ? 'Basic' : 'Needs detail'}</span>
                        </div>
                    </div>

                    <textarea
                        id={navDescId}
                        className="ems-textarea"
                        rows={2}
                        value={desc}
                        onChange={(e) => handleTextChange('route_description', e.target.value)}
                        placeholder="Describe paths, tracks, handrails, terrain features, col crossings, and checkpoint arrival..."
                    />
                </div>

                {/* 2-Column Grid: Escape Route + Rest (mins) */}
                <div className="ems-leg-bottom-row" onClick={(e) => e.stopPropagation()}>
                    <div className="ems-leg-input-block ems-leg-input-block--escape">
                        <label htmlFor={escapeRouteId} className="ems-field-label">
                            Escape Route
                        </label>
                        <input
                            id={escapeRouteId}
                            type="text"
                            className="ems-input-text"
                            value={leg.escape_route || ''}
                            onChange={(e) => handleTextChange('escape_route', e.target.value)}
                            placeholder="Emergency egress / valley route in bad weather..."
                        />
                    </div>

                    <div className="ems-leg-input-block ems-leg-input-block--rest">
                        <div className="ems-label-with-addon">
                            <label htmlFor={restMinsId} className="ems-field-label">
                                Rest (min)
                            </label>
                            {!showActivity && projectRestMins === 0 && (
                                <button
                                    type="button"
                                    className="ems-add-activity-btn"
                                    onClick={() => setShowActivity(true)}
                                    title="Add expedition project or aim activity"
                                >
                                    + Project
                                </button>
                            )}
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

                {/* Conditional Project Activity Field */}
                {(showActivity || projectRestMins > 0 || Boolean(leg.activity_notes && leg.activity_notes.trim().length > 0)) && (
                    <div className="ems-leg-input-block ems-leg-input-block--activity" onClick={(e) => e.stopPropagation()}>
                        <label htmlFor={activityNotesId} className="ems-field-label">
                            Project Activity
                        </label>
                        <input
                            id={activityNotesId}
                            type="text"
                            className="ems-input-text"
                            value={leg.activity_notes || ''}
                            onChange={(e) => handleTextChange('activity_notes', e.target.value)}
                            placeholder="Expedition aim / team project observation..."
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
