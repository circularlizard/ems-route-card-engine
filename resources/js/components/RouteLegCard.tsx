import { useId, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
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
    nextLegStartName,
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

    // Auto-scroll active card into view when selected by user
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
    const resolvedEndName = !isLastLeg && nextLegStartName !== undefined
        ? nextLegStartName
        : (leg.end_name || (leg as any).checkpoint_to || (isLastLeg ? 'Finish' : `Checkpoint ${leg.leg_number + 1}`));

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

    // Project & rest time is unified into one number
    const projectRestMins = leg.rest_minutes || 0;
    const totalLegMins = leg.walking_minutes + projectRestMins;

    const handleTextChange = (field: keyof RouteLeg, value: string | number) => {
        const updatedLeg: any = {
            ...leg,
            start_name: field === 'start_name' ? value : startName,
            end_name: field === 'end_name' ? value : resolvedEndName,
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

    return (
        <div
            ref={cardRef}
            className={`ems-leg-card ${isActive ? 'ems-leg-card--active' : ''}`}
            onClick={onSelect}
        >
            {/* Line 1: Header with Leg Number in Top Left and Start / End Checkpoints */}
            <div className="ems-leg-card__line-1">
                <span className="ems-leg-number-badge" title={`Leg ${leg.leg_number}`}>
                    {leg.leg_number}
                </span>

                <div className="ems-leg-endpoints" onClick={(e) => e.stopPropagation()}>
                    <div className="ems-endpoint">
                        <span className="ems-endpoint-label">From:</span>
                        <div className="ems-endpoint-col">
                            <input
                                id={startNameId}
                                type="text"
                                className="ems-endpoint-input"
                                value={startName}
                                onChange={(e) => handleTextChange('start_name', e.target.value)}
                                placeholder="Start point"
                                title="Edit start checkpoint name"
                            />
                            {startGrid && (
                                <span className="ems-endpoint-meta">{startGrid} • {Math.round(startEle)}m</span>
                            )}
                        </div>
                    </div>

                    <div className="ems-endpoint">
                        <span className="ems-endpoint-label">To:</span>
                        <div className="ems-endpoint-col">
                            <input
                                id={endNameId}
                                type="text"
                                className={`ems-endpoint-input ${!isLastLeg ? 'ems-endpoint-input--readonly' : ''}`}
                                value={resolvedEndName}
                                readOnly={!isLastLeg}
                                tabIndex={!isLastLeg ? -1 : 0}
                                onChange={(e) => handleTextChange('end_name', e.target.value)}
                                placeholder="End point"
                                title={!isLastLeg ? `Linked to start of Leg ${leg.leg_number + 1}` : 'Edit finish checkpoint name'}
                            />
                            {endGrid && (
                                <span className="ems-endpoint-meta">{endGrid} • {Math.round(endEle)}m</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Line 2: Split / Merge Controls */}
            <div className="ems-leg-card__line-2" onClick={(e) => e.stopPropagation()}>
                <div className="ems-leg-action-buttons">
                    <button
                        type="button"
                        className="ems-leg-tool-btn"
                        title="Split leg at midpoint"
                        onClick={onSplitLeg}
                    >
                        <FontAwesomeIcon icon={faScissors} /> Split Leg
                    </button>

                    {!isLastLeg && (
                        <button
                            type="button"
                            className="ems-leg-tool-btn"
                            title="Merge with next leg"
                            onClick={onMergeLeg}
                        >
                            <FontAwesomeIcon icon={faCodeMerge} /> Merge with Next Leg
                        </button>
                    )}
                </div>
            </div>

            {/* Line 3: Distance, Elevation and Time (No Bearing) */}
            <div className="ems-leg-card__line-3 ems-leg-metrics">
                <div className="ems-metric-item" title="Horizontal Distance">
                    <FontAwesomeIcon icon={faRoute} className="ems-metric-icon" />
                    <span><b>{leg.distance_km}</b> km</span>
                </div>

                <div className="ems-metric-item" title="Elevation Ascent">
                    <FontAwesomeIcon icon={faMountain} className="ems-metric-icon" />
                    <span><b>+{Math.round(leg.ascent_m)}m</b> climb</span>
                    {leg.descent_m > 0 && (
                        <span className="ems-metric-sub">(-{Math.round(leg.descent_m)}m)</span>
                    )}
                </div>

                <div className="ems-metric-item" title="Walking Time & Total Leg Duration">
                    <FontAwesomeIcon icon={faClock} className="ems-metric-icon" />
                    <span><b>{formatHoursMins(leg.walking_minutes)}</b> walk</span>
                    {projectRestMins > 0 && (
                        <span className="ems-metric-total">
                            ({formatHoursMins(totalLegMins)} total)
                        </span>
                    )}
                </div>
            </div>

            {/* Line 4: Route Navigation Description */}
            <div className="ems-leg-card__line-4 ems-leg-input-block" onClick={(e) => e.stopPropagation()}>
                <div className="ems-input-label-row">
                    <label htmlFor={navDescId} className="ems-field-label">
                        Route Navigation Description
                    </label>

                    <div className={`ems-quality-badge ems-quality-badge--${qualityStatus}`}>
                        {qualityStatus === 'good' && <FontAwesomeIcon icon={faCheckCircle} />}
                        {qualityStatus === 'medium' && <FontAwesomeIcon icon={faLightbulb} />}
                        {qualityStatus === 'poor' && <FontAwesomeIcon icon={faTriangleExclamation} />}
                        <span>{qualityStatus === 'good' ? 'Detailed' : qualityStatus === 'medium' ? 'Basic' : 'Needs detail'}</span>
                    </div>
                </div>

                <textarea
                    id={navDescId}
                    className="ems-textarea"
                    rows={isActive ? 3 : 2}
                    value={desc}
                    onChange={(e) => handleTextChange('route_description', e.target.value)}
                    placeholder="Describe paths, tracks, handrails, terrain features, and checkpoint arrival..."
                />
            </div>

            {/* Line 5: Escape Route */}
            <div className="ems-leg-card__line-5 ems-leg-input-block" onClick={(e) => e.stopPropagation()}>
                <label htmlFor={escapeRouteId} className="ems-field-label">
                    <FontAwesomeIcon icon={faShieldHalved} /> Escape Route
                </label>
                <textarea
                    id={escapeRouteId}
                    className="ems-textarea ems-textarea--sm"
                    rows={2}
                    value={leg.escape_route || ''}
                    onChange={(e) => handleTextChange('escape_route', e.target.value)}
                    placeholder="Emergency / escape route in severe weather or injury..."
                />
            </div>

            {/* Line 6: Project & Rest Time (One Number) and Project Activity */}
            <div className="ems-leg-card__line-6 ems-leg-project-row" onClick={(e) => e.stopPropagation()}>
                <div className="ems-leg-input-block ems-leg-input-block--time">
                    <label htmlFor={restMinsId} className="ems-field-label">
                        <FontAwesomeIcon icon={faCoffee} /> Project & Rest
                    </label>
                    <div className="ems-time-inputs-group">
                        <div className="ems-time-input-field">
                            <input
                                id={restMinsId}
                                type="number"
                                min="0"
                                max="300"
                                step="5"
                                className="ems-input-number"
                                value={projectRestMins}
                                onChange={(e) => handleTextChange('rest_minutes', parseInt(e.target.value, 10) || 0)}
                            />
                            <span className="ems-unit">mins</span>
                        </div>
                        {projectRestMins > 0 && (
                            <span className="ems-time-formatted">({formatHoursMins(projectRestMins)})</span>
                        )}
                    </div>
                </div>

                <div className="ems-leg-input-block ems-leg-input-block--activity">
                    <label htmlFor={activityNotesId} className="ems-field-label">
                        Project Activity
                    </label>
                    <textarea
                        id={activityNotesId}
                        className="ems-textarea ems-textarea--sm"
                        rows={2}
                        value={leg.activity_notes || ''}
                        onChange={(e) => handleTextChange('activity_notes', e.target.value)}
                        placeholder="Expedition project or aim activity (e.g. survey, photo record, water testing)..."
                    />
                </div>
            </div>
        </div>
    );
}
