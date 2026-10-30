import { useState, useId, useRef, useEffect } from 'react';
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
import { getCompassDirection } from '../utils/route-calculations';

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
    const [isEditingNames, setIsEditingNames] = useState(false);
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

    const insertChipText = (textToInsert: string) => {
        const newText = desc ? `${desc} ${textToInsert}` : textToInsert;
        handleTextChange('route_description', newText);
    };

    return (
        <div
            ref={cardRef}
            className={`ems-leg-card ${isActive ? 'ems-leg-card--active' : ''}`}
            onClick={onSelect}
        >
            {/* Header with Journey Direction */}
            <div className="ems-leg-card__header">
                <div className="ems-leg-card__title-group">
                    <span className="ems-leg-badge">Leg {leg.leg_number}</span>
                    {!isEditingNames ? (
                        <h4 className="ems-leg-title" onClick={() => setIsEditingNames(true)} title="Click to rename checkpoints">
                            <span className="ems-checkpoint-name">{startName}</span>
                            <FontAwesomeIcon icon={faArrowRight} className="ems-arrow-icon" />
                            <span className="ems-checkpoint-name">{endName}</span>
                        </h4>
                    ) : (
                        <div className="ems-leg-name-editor" onClick={(e) => e.stopPropagation()}>
                            <label htmlFor={startNameId} className="screen-reader-text">Start Checkpoint Name</label>
                            <input
                                id={startNameId}
                                type="text"
                                className="ems-input-sm"
                                value={startName}
                                onChange={(e) => handleTextChange('start_name', e.target.value)}
                                placeholder="Start name"
                            />
                            <FontAwesomeIcon icon={faArrowRight} />
                            <label htmlFor={endNameId} className="screen-reader-text">End Checkpoint Name</label>
                            <input
                                id={endNameId}
                                type="text"
                                className="ems-input-sm"
                                value={endName}
                                onChange={(e) => handleTextChange('end_name', e.target.value)}
                                placeholder="End name"
                            />
                            <button
                                type="button"
                                className="ems-btn-xs"
                                onClick={() => setIsEditingNames(false)}
                            >
                                Done
                            </button>
                        </div>
                    )}
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

            {/* Origin & Destination Badges */}
            <div className="ems-leg-checkpoints-row">
                <div className="ems-checkpoint-pill ems-checkpoint-pill--origin">
                    <span className="ems-pill-label">FROM</span>
                    <span className="ems-pill-val">{startName}</span>
                    <span className="ems-pill-coord">
                        {startGrid ? `${startGrid} • ${Math.round(startEle)}m` : `${Math.round(startEle)}m`}
                    </span>
                </div>

                <div className="ems-checkpoint-pill ems-checkpoint-pill--dest">
                    <span className="ems-pill-label">TO</span>
                    <span className="ems-pill-val">{endName}</span>
                    <span className="ems-pill-coord">
                        {endGrid ? `${endGrid} • ${Math.round(endEle)}m` : `${Math.round(endEle)}m`}
                    </span>
                </div>
            </div>

            {/* Metrics Row */}
            <div className="ems-leg-metrics">
                <div className="ems-metric-item">
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

                <div className="ems-metric-item" title="Naismith Walking Time">
                    <FontAwesomeIcon icon={faClock} className="ems-metric-icon" />
                    <span><b>{leg.walking_minutes}</b> min walk</span>
                </div>
            </div>

            {/* Input 1: Journey Navigation Description */}
            <div className="ems-leg-input-block" onClick={(e) => e.stopPropagation()}>
                <div className="ems-input-label-row">
                    <label htmlFor={navDescId} className="ems-field-label">
                        Route Navigation Description
                        <span className="ems-field-hint">
                            (How to get from {startName} to {endName})
                        </span>
                    </label>

                    <div className={`ems-quality-badge ems-quality-badge--${qualityStatus}`}>
                        {qualityStatus === 'good' && <FontAwesomeIcon icon={faCheckCircle} />}
                        {qualityStatus === 'medium' && <FontAwesomeIcon icon={faLightbulb} />}
                        {qualityStatus === 'poor' && <FontAwesomeIcon icon={faTriangleExclamation} />}
                        <span>{qualityStatus === 'good' ? 'Detailed navigation' : qualityStatus === 'medium' ? 'Basic' : 'Needs detail'}</span>
                    </div>
                </div>

                {/* Real Contextual Coaching Guidance Chips */}
                <div className="ems-coaching-chips">
                    {leg.ascent_m >= 120 && (
                        <button
                            type="button"
                            className="ems-chip ems-chip--coach"
                            onClick={() => insertChipText(`Steep climb (+${Math.round(leg.ascent_m)}m), pacing steadily ${compassDir} with zig-zag ascent`)}
                            title="Insert steep climb pacing guidance"
                        >
                            <FontAwesomeIcon icon={faLightbulb} /> + Steeper ascent pacing ({compassDir})
                        </button>
                    )}

                    {leg.distance_km >= 1.2 && (
                        <button
                            type="button"
                            className="ems-chip ems-chip--coach"
                            onClick={() => insertChipText(`Following handrail heading ${compassDir} on bearing ${String(leg.magnetic_bearing).padStart(3, '0')}° mag`)}
                            title="Insert handrail navigation suggestion"
                        >
                            <FontAwesomeIcon icon={faLightbulb} /> + Handrail heading {compassDir}
                        </button>
                    )}

                    <button
                        type="button"
                        className="ems-chip ems-chip--action"
                        onClick={() => insertChipText(`bearing ${String(leg.magnetic_bearing).padStart(3, '0')}° mag (${compassDir})`)}
                    >
                        + Insert {String(leg.magnetic_bearing).padStart(3, '0')}° mag
                    </button>

                    {endGrid && (
                        <button
                            type="button"
                            className="ems-chip ems-chip--action"
                            onClick={() => insertChipText(`to ${endName} (${endGrid})`)}
                        >
                            + Insert destination grid ref
                        </button>
                    )}
                </div>

                <textarea
                    id={navDescId}
                    className="ems-textarea"
                    rows={isActive ? 3 : 2}
                    value={desc}
                    onChange={(e) => handleTextChange('route_description', e.target.value)}
                    placeholder={`e.g. Follow the footpath ${compassDir} on bearing ${String(leg.magnetic_bearing).padStart(3, '0')}° mag towards ${endName}.`}
                />
            </div>

            {/* Input 2: Destination Activity & Rest */}
            <div className="ems-leg-split-inputs" onClick={(e) => e.stopPropagation()}>
                <div className="ems-leg-input-block ems-leg-input-block--half">
                    <label htmlFor={activityNotesId} className="ems-field-label">
                        <FontAwesomeIcon icon={faCoffee} /> At Destination Checkpoint ({endName})
                    </label>
                    <div className="ems-rest-controls">
                        <label htmlFor={restMinsId} className="screen-reader-text">Rest Duration (Minutes)</label>
                        <input
                            id={restMinsId}
                            type="number"
                            min="0"
                            max="120"
                            step="5"
                            className="ems-input-number"
                            value={leg.rest_minutes || 0}
                            onChange={(e) => handleTextChange('rest_minutes', parseInt(e.target.value, 10) || 0)}
                        />
                        <span className="ems-unit">mins rest</span>

                        <div className="ems-quick-rest-btns">
                            <button type="button" onClick={() => handleTextChange('rest_minutes', 10)}>10m</button>
                            <button type="button" onClick={() => handleTextChange('rest_minutes', 15)}>15m</button>
                            <button type="button" onClick={() => handleTextChange('rest_minutes', 30)}>30m Lunch</button>
                        </div>
                    </div>
                    <input
                        id={activityNotesId}
                        type="text"
                        className="ems-input-sm ems-mt-1"
                        value={leg.activity_notes || ''}
                        onChange={(e) => handleTextChange('activity_notes', e.target.value)}
                        placeholder="Activity: e.g. Lunch break, take compass bearing, photo"
                    />
                </div>

                {/* Input 3: Escape / Safety Plan */}
                <div className="ems-leg-input-block ems-leg-input-block--half">
                    <label htmlFor={escapeRouteId} className="ems-field-label">
                        <FontAwesomeIcon icon={faShieldHalved} /> Escape / Safety Route
                    </label>
                    <textarea
                        id={escapeRouteId}
                        className="ems-textarea ems-textarea--sm"
                        rows={2}
                        value={leg.escape_route || ''}
                        onChange={(e) => handleTextChange('escape_route', e.target.value)}
                        placeholder={`e.g. In severe weather or injury: Retrace steps back to ${startName}.`}
                    />
                </div>
            </div>
        </div>
    );
}
