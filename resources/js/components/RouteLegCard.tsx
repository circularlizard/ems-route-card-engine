import { useId, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faArrowRight,
    faCompass,
    faMountain,
    faClock,
    faRoute,
    faScissors,
    faCodeMerge,
    faShieldHalved,
    faLightbulb,
    faCheckCircle,
    faTriangleExclamation,
    faCoffee,
} from '@fortawesome/free-solid-svg-icons';
import { RouteLeg, RouteVertex } from '../types/route-card';
import { getCompassDirection, formatHoursMins } from '../utils/route-calculations';

interface RouteLegCardProps {
    leg: RouteLeg;
    vertices?: RouteVertex[];
    isActive: boolean;
    isLastLeg: boolean;
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
    onSelect,
    onUpdateLeg,
    onSplitLeg,
    onMergeLeg,
}: RouteLegCardProps) {
    const cardRef = useRef<HTMLDivElement | null>(null);

    const startNameId = useId();
    const endNameId = useId();
    const navDescId = useId();
    const restMinsId = useId();
    const activityNotesId = useId();
    const escapeRouteId = useId();

    // Auto-scroll active card into view when selected
    useEffect(() => {
        if (isActive && cardRef.current && typeof cardRef.current.scrollIntoView === 'function') {
            cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

    // Real compass direction computed from actual magnetic bearing
    const compassDir = getCompassDirection(leg.magnetic_bearing);

    // Check description quality
    const desc = leg.route_description || (leg as any).description || '';
    const wordCount = desc.trim() ? desc.trim().split(/\s+/).length : 0;
    const navKeywords = ['bearing', 'stream', 'burn', 'track', 'path', 'ridge', 'cairn', 'col', 'contour', 'handrail', 'wall', 'fence', 'summit'];
    const foundKeywords = navKeywords.filter((kw) => desc.toLowerCase().includes(kw));

    let qualityStatus: 'poor' | 'medium' | 'good' = 'poor';
    if (wordCount >= 15 && foundKeywords.length >= 2) {
        qualityStatus = 'good';
    } else if (wordCount >= 8 || foundKeywords.length >= 1) {
        qualityStatus = 'medium';
    }

    const handleTextChange = (field: keyof RouteLeg, value: string | number) => {
        onUpdateLeg({
            ...leg,
            start_name: startName,
            end_name: endName,
            start_grid_ref: startGrid,
            end_grid_ref: endGrid,
            start_elevation_m: startEle,
            end_elevation_m: endEle,
            [field]: value,
        });
    };

    return (
        <div
            ref={cardRef}
            className={`ems-leg-card ${isActive ? 'ems-leg-card--active' : ''}`}
            onClick={onSelect}
        >
            {/* Header: Leg badge, Checkpoint Origin ➔ Destination, and Actions */}
            <div className="ems-leg-card__header">
                <div className="ems-leg-card__title-group">
                    <span className="ems-leg-badge">Leg {leg.leg_number}</span>

                    <div className="ems-leg-endpoints" onClick={(e) => e.stopPropagation()}>
                        <div className="ems-endpoint">
                            <span className="ems-endpoint-label">From:</span>
                            <input
                                id={startNameId}
                                type="text"
                                className="ems-endpoint-input"
                                value={startName}
                                onChange={(e) => handleTextChange('start_name', e.target.value)}
                                placeholder="Start name"
                                title="Edit start checkpoint name"
                            />
                            {startGrid && (
                                <span className="ems-endpoint-meta">({startGrid} • {Math.round(startEle)}m)</span>
                            )}
                        </div>

                        <FontAwesomeIcon icon={faArrowRight} className="ems-arrow-icon" />

                        <div className="ems-endpoint">
                            <span className="ems-endpoint-label">To:</span>
                            <input
                                id={endNameId}
                                type="text"
                                className="ems-endpoint-input"
                                value={endName}
                                onChange={(e) => handleTextChange('end_name', e.target.value)}
                                placeholder="End name"
                                title="Edit end checkpoint name"
                            />
                            {endGrid && (
                                <span className="ems-endpoint-meta">({endGrid} • {Math.round(endEle)}m)</span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="ems-leg-card__actions" onClick={(e) => e.stopPropagation()}>
                    <button
                        type="button"
                        className="ems-btn-icon"
                        title="Split leg at midpoint"
                        onClick={onSplitLeg}
                    >
                        <FontAwesomeIcon icon={faScissors} />
                        <span className="ems-hide-sm">Split</span>
                    </button>

                    {!isLastLeg && (
                        <button
                            type="button"
                            className="ems-btn-icon"
                            title="Merge with next leg"
                            onClick={onMergeLeg}
                        >
                            <FontAwesomeIcon icon={faCodeMerge} />
                            <span className="ems-hide-sm">Merge</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Metrics Row */}
            <div className="ems-leg-metrics">
                <div className="ems-metric-item" title="Distance">
                    <FontAwesomeIcon icon={faRoute} className="ems-metric-icon" />
                    <span><b>{leg.distance_km}</b> km</span>
                </div>

                <div className="ems-metric-item" title="Magnetic Bearing for compass navigation">
                    <FontAwesomeIcon icon={faCompass} className="ems-metric-icon" />
                    <span><b>{String(leg.magnetic_bearing).padStart(3, '0')}°</b> mag ({compassDir})</span>
                </div>

                <div className="ems-metric-item" title="Elevation Ascent">
                    <FontAwesomeIcon icon={faMountain} className="ems-metric-icon" />
                    <span><b>+{Math.round(leg.ascent_m)}m</b> climb</span>
                </div>

                <div className="ems-metric-item" title="Walking Time">
                    <FontAwesomeIcon icon={faClock} className="ems-metric-icon" />
                    <span><b>{formatHoursMins(leg.walking_minutes)}</b> walk</span>
                    {(leg.rest_minutes || 0) > 0 && (
                        <span style={{ marginLeft: '4px', color: '#64748b', fontSize: '11px' }}>
                            ({formatHoursMins(leg.walking_minutes + (leg.rest_minutes || 0))} total)
                        </span>
                    )}
                </div>
            </div>

            {/* Route Navigation Description */}
            <div className="ems-leg-input-block" onClick={(e) => e.stopPropagation()}>
                <div className="ems-input-label-row">
                    <label htmlFor={navDescId} className="ems-field-label">
                        Route Navigation Description
                    </label>

                    <div className={`ems-quality-badge ems-quality-badge--${qualityStatus}`}>
                        {qualityStatus === 'good' && <FontAwesomeIcon icon={faCheckCircle} />}
                        {qualityStatus === 'medium' && <FontAwesomeIcon icon={faLightbulb} />}
                        {qualityStatus === 'poor' && <FontAwesomeIcon icon={faTriangleExclamation} />}
                        <span>{qualityStatus === 'good' ? 'Detailed navigation' : qualityStatus === 'medium' ? 'Basic' : 'Needs detail'}</span>
                    </div>
                </div>

                <textarea
                    id={navDescId}
                    className="ems-textarea"
                    rows={isActive ? 3 : 2}
                    value={desc}
                    onChange={(e) => handleTextChange('route_description', e.target.value)}
                    placeholder="Describe paths, bearings, handrails, terrain features, and checkpoint arrival..."
                />
            </div>

            {/* Checkpoint Rest, Activity & Escape Route */}
            <div className="ems-leg-split-inputs" onClick={(e) => e.stopPropagation()}>
                <div className="ems-leg-input-block ems-leg-input-block--half">
                    <label htmlFor={restMinsId} className="ems-field-label">
                        <FontAwesomeIcon icon={faCoffee} /> Checkpoint Rest & Activity
                    </label>
                    <div className="ems-rest-controls">
                        <input
                            id={restMinsId}
                            type="number"
                            min="0"
                            max="180"
                            step="5"
                            className="ems-input-number"
                            value={leg.rest_minutes || 0}
                            onChange={(e) => handleTextChange('rest_minutes', parseInt(e.target.value, 10) || 0)}
                        />
                        <span className="ems-unit">mins rest ({formatHoursMins(leg.rest_minutes || 0)})</span>
                    </div>
                    <input
                        id={activityNotesId}
                        type="text"
                        className="ems-input-sm ems-mt-1"
                        value={leg.activity_notes || ''}
                        onChange={(e) => handleTextChange('activity_notes', e.target.value)}
                        placeholder="Activity (e.g. Lunch break, rest, survey)"
                    />
                </div>

                <div className="ems-leg-input-block ems-leg-input-block--half">
                    <label htmlFor={escapeRouteId} className="ems-field-label">
                        <FontAwesomeIcon icon={faShieldHalved} /> Escape / Bad Weather Route
                    </label>
                    <textarea
                        id={escapeRouteId}
                        className="ems-textarea ems-textarea--sm"
                        rows={2}
                        value={leg.escape_route || ''}
                        onChange={(e) => handleTextChange('escape_route', e.target.value)}
                        placeholder="Emergency / escape route in severe weather or injury"
                    />
                </div>
            </div>
        </div>
    );
}
