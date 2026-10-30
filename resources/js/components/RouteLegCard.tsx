import { useState, useId } from 'react';
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
import { RouteLeg } from '../types/route-card';

interface RouteLegCardProps {
    leg: RouteLeg;
    isActive: boolean;
    isLastLeg: boolean;
    onSelect: () => void;
    onUpdateLeg: (updatedLeg: RouteLeg) => void;
    onSplitLeg: () => void;
    onMergeLeg: () => void;
}

export function RouteLegCard({
    leg,
    isActive,
    isLastLeg,
    onSelect,
    onUpdateLeg,
    onSplitLeg,
    onMergeLeg,
}: RouteLegCardProps) {
    const [isEditingNames, setIsEditingNames] = useState(false);
    const startNameId = useId();
    const endNameId = useId();
    const navDescId = useId();
    const restMinsId = useId();
    const activityNotesId = useId();
    const escapeRouteId = useId();

    // Check description quality
    const desc = leg.route_description || '';
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
            [field]: value,
        });
    };

    const insertChipText = (textToInsert: string) => {
        const newText = desc ? `${desc} ${textToInsert}` : textToInsert;
        handleTextChange('route_description', newText);
    };

    return (
        <div
            className={`ems-leg-card ${isActive ? 'ems-leg-card--active' : ''}`}
            onClick={onSelect}
        >
            {/* Header with Journey Direction */}
            <div className="ems-leg-card__header">
                <div className="ems-leg-card__title-group">
                    <span className="ems-leg-badge">Leg {leg.leg_number}</span>
                    {!isEditingNames ? (
                        <h4 className="ems-leg-title" onClick={() => setIsEditingNames(true)} title="Click to rename checkpoints">
                            <span className="ems-checkpoint-name">{leg.start_name}</span>
                            <FontAwesomeIcon icon={faArrowRight} className="ems-arrow-icon" />
                            <span className="ems-checkpoint-name">{leg.end_name}</span>
                        </h4>
                    ) : (
                        <div className="ems-leg-name-editor" onClick={(e) => e.stopPropagation()}>
                            <label htmlFor={startNameId} className="screen-reader-text">Start Checkpoint Name</label>
                            <input
                                id={startNameId}
                                type="text"
                                className="ems-input-sm"
                                value={leg.start_name}
                                onChange={(e) => handleTextChange('start_name', e.target.value)}
                                placeholder="Start name"
                            />
                            <FontAwesomeIcon icon={faArrowRight} />
                            <label htmlFor={endNameId} className="screen-reader-text">End Checkpoint Name</label>
                            <input
                                id={endNameId}
                                type="text"
                                className="ems-input-sm"
                                value={leg.end_name}
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
                    <span className="ems-pill-val">{leg.start_name}</span>
                    <span className="ems-pill-coord">{leg.start_grid_ref} ({leg.start_elevation_m}m)</span>
                </div>

                <div className="ems-checkpoint-pill ems-checkpoint-pill--dest">
                    <span className="ems-pill-label">TO</span>
                    <span className="ems-pill-val">{leg.end_name}</span>
                    <span className="ems-pill-coord">{leg.end_grid_ref} ({leg.end_elevation_m}m)</span>
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
                    <span><b>{String(leg.magnetic_bearing).padStart(3, '0')}°</b> mag</span>
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
                            (How to get from {leg.start_name} to {leg.end_name})
                        </span>
                    </label>

                    <div className={`ems-quality-badge ems-quality-badge--${qualityStatus}`}>
                        {qualityStatus === 'good' && <FontAwesomeIcon icon={faCheckCircle} />}
                        {qualityStatus === 'medium' && <FontAwesomeIcon icon={faLightbulb} />}
                        {qualityStatus === 'poor' && <FontAwesomeIcon icon={faTriangleExclamation} />}
                        <span>{qualityStatus === 'good' ? 'Detailed navigation' : qualityStatus === 'medium' ? 'Basic' : 'Needs detail'}</span>
                    </div>
                </div>

                {/* Coaching Guidance Chips */}
                <div className="ems-coaching-chips">
                    {leg.ascent_m >= 120 && (
                        <button
                            type="button"
                            className="ems-chip ems-chip--coach"
                            onClick={() => insertChipText('Steep climb, pacing steadily with zig-zag ascent')}
                        >
                            <FontAwesomeIcon icon={faLightbulb} /> + Steeper ascent pacing
                        </button>
                    )}

                    {leg.distance_km >= 1.5 && (
                        <button
                            type="button"
                            className="ems-chip ems-chip--coach"
                            onClick={() => insertChipText('Following ridge handrail NE')}
                        >
                            <FontAwesomeIcon icon={faLightbulb} /> + Add handrail (ridge/stream)
                        </button>
                    )}

                    <button
                        type="button"
                        className="ems-chip ems-chip--action"
                        onClick={() => insertChipText(`bearing ${String(leg.magnetic_bearing).padStart(3, '0')}° mag`)}
                    >
                        + Insert {String(leg.magnetic_bearing).padStart(3, '0')}° mag
                    </button>

                    <button
                        type="button"
                        className="ems-chip ems-chip--action"
                        onClick={() => insertChipText(`to ${leg.end_name} (${leg.end_grid_ref})`)}
                    >
                        + Insert grid ref
                    </button>
                </div>

                <textarea
                    id={navDescId}
                    className="ems-textarea"
                    rows={isActive ? 3 : 2}
                    value={leg.route_description || ''}
                    onChange={(e) => handleTextChange('route_description', e.target.value)}
                    placeholder="e.g. Follow the footpath NE alongside the stream (handrail) to the col, then bear 048° mag up the ridge towards the summit cairn."
                />
            </div>

            {/* Input 2: Destination Activity & Rest */}
            <div className="ems-leg-split-inputs" onClick={(e) => e.stopPropagation()}>
                <div className="ems-leg-input-block ems-leg-input-block--half">
                    <label htmlFor={activityNotesId} className="ems-field-label">
                        <FontAwesomeIcon icon={faCoffee} /> At Destination Checkpoint ({leg.end_name})
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
                        placeholder="e.g. In severe weather or injury: Retrace steps SW down spur to Bothy."
                    />
                </div>
            </div>
        </div>
    );
}
