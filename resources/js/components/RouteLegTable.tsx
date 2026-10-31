import { useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faScissors,
    faCodeMerge,
} from '@fortawesome/free-solid-svg-icons';
import { RouteLeg } from '../types/route-card';
import { formatHoursMins } from '../utils/route-calculations';

interface RouteLegTableProps {
    legs: RouteLeg[];
    activeLegIndex: number;
    onSelectLeg: (legIndex: number) => void;
    onUpdateLeg: (legIndex: number, updatedLeg: RouteLeg) => void;
    onSplitLeg: (legIndex: number) => void;
    onMergeLeg: (legIndex: number) => void;
}

export function RouteLegTable({
    legs,
    activeLegIndex,
    onSelectLeg,
    onUpdateLeg,
    onSplitLeg,
    onMergeLeg,
}: RouteLegTableProps) {
    const handleTextChange = (legIndex: number, field: keyof RouteLeg, value: string | number) => {
        const leg = legs[legIndex];
        if (!leg) return;
        const updated: any = {
            ...leg,
            [field]: value,
        };
        if (field === 'route_description') {
            updated.description = value;
        }
        onUpdateLeg(legIndex, updated as RouteLeg);
    };

    const syncTextareaHeight = (el: HTMLTextAreaElement | null) => {
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    };

    useEffect(() => {
        const textareas = document.querySelectorAll<HTMLTextAreaElement>('.ems-table-textarea.ems-auto-expand');
        textareas.forEach((el) => syncTextareaHeight(el));
    }, [legs]);

    return (
        <div className="ems-table-responsive-wrapper">
            <table className="ems-route-table">
                <thead>
                    <tr>
                        <th style={{ width: '36px' }}>#</th>
                        <th style={{ minWidth: '120px' }}>From (Origin)</th>
                        <th style={{ minWidth: '120px' }}>To (Destination)</th>
                        <th style={{ width: '65px' }}>Dist (km)</th>
                        <th style={{ width: '65px' }}>Climb (m)</th>
                        <th style={{ width: '75px' }}>Walk Time</th>
                        <th style={{ width: '95px' }}>Rest (min)</th>
                        <th style={{ width: '75px' }}>Total</th>
                        <th style={{ minWidth: '220px' }}>Navigation Description</th>
                        <th style={{ minWidth: '140px' }}>Project Activity</th>
                        <th style={{ minWidth: '140px' }}>Escape Route</th>
                        <th style={{ width: '70px' }}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {legs.map((leg, idx) => {
                        const isActive = idx === activeLegIndex;
                        const isLast = idx === legs.length - 1;
                        const projectRestMins = leg.rest_minutes || 0;
                        const totalMins = leg.walking_minutes + projectRestMins;

                        return (
                            <tr
                                key={leg.leg_number}
                                className={`ems-route-table__row ${isActive ? 'ems-route-table__row--active' : ''}`}
                                onClick={() => onSelectLeg(idx)}
                            >
                                <td className="ems-text-center">
                                    <span className="ems-table-leg-badge">{leg.leg_number}</span>
                                </td>
                                <td>
                                    <div className="ems-table-point-name">{leg.start_name}</div>
                                    <div className="ems-table-point-coord">{leg.start_grid_ref} ({leg.start_elevation_m}m)</div>
                                </td>
                                <td>
                                    <div className="ems-table-point-name">{leg.end_name}</div>
                                    <div className="ems-table-point-coord">{leg.end_grid_ref} ({leg.end_elevation_m}m)</div>
                                </td>
                                <td className="ems-text-center font-mono"><b>{leg.distance_km}</b></td>
                                <td className="ems-text-center font-mono">+{Math.round(leg.ascent_m)}m</td>
                                <td className="ems-text-center font-mono"><b>{formatHoursMins(leg.walking_minutes)}</b></td>
                                <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                        <input
                                            type="number"
                                            min="0"
                                            max="300"
                                            className="ems-table-input-number"
                                            value={projectRestMins}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => handleTextChange(idx, 'rest_minutes', parseInt(e.target.value, 10) || 0)}
                                            title="Project & Rest Duration (minutes)"
                                        />
                                        <span className="font-mono" style={{ fontSize: '11px', color: '#64748b' }}>
                                            m
                                        </span>
                                    </div>
                                </td>
                                <td className="ems-text-center font-mono">
                                    <b>{formatHoursMins(totalMins)}</b>
                                </td>
                                <td>
                                    <textarea
                                        rows={1}
                                        className="ems-auto-expand ems-table-textarea"
                                        value={leg.route_description || ''}
                                        onClick={(e) => e.stopPropagation()}
                                        onInput={(e) => syncTextareaHeight(e.currentTarget)}
                                        onChange={(e) => handleTextChange(idx, 'route_description', e.target.value)}
                                        placeholder="Path, handrails, features..."
                                    />
                                </td>
                                <td>
                                    <textarea
                                        rows={1}
                                        className="ems-auto-expand ems-table-textarea"
                                        value={leg.activity_notes || ''}
                                        onClick={(e) => e.stopPropagation()}
                                        onInput={(e) => syncTextareaHeight(e.currentTarget)}
                                        onChange={(e) => handleTextChange(idx, 'activity_notes', e.target.value)}
                                        placeholder="Project / aim activity..."
                                    />
                                </td>
                                <td>
                                    <textarea
                                        rows={1}
                                        className="ems-auto-expand ems-table-textarea"
                                        value={leg.escape_route || ''}
                                        onClick={(e) => e.stopPropagation()}
                                        onInput={(e) => syncTextareaHeight(e.currentTarget)}
                                        onChange={(e) => handleTextChange(idx, 'escape_route', e.target.value)}
                                        placeholder="Escape plan..."
                                    />
                                </td>
                                <td className="ems-text-center" onClick={(e) => e.stopPropagation()}>
                                    <div className="ems-table-actions">
                                        <button
                                            type="button"
                                            className="ems-btn-xs"
                                            title="Split leg at midpoint"
                                            onClick={() => onSplitLeg(idx)}
                                        >
                                            <FontAwesomeIcon icon={faScissors} />
                                        </button>
                                        {!isLast && (
                                            <button
                                                type="button"
                                                className="ems-btn-xs"
                                                title="Merge with next leg"
                                                onClick={() => onMergeLeg(idx)}
                                            >
                                                <FontAwesomeIcon icon={faCodeMerge} />
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
