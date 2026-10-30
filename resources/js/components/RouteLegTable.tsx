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
        onUpdateLeg(legIndex, {
            ...leg,
            [field]: value,
        });
    };

    return (
        <div className="ems-table-responsive-wrapper">
            <table className="ems-route-table">
                <thead>
                    <tr>
                        <th style={{ width: '45px' }}>Leg</th>
                        <th>From (Origin)</th>
                        <th>To (Destination)</th>
                        <th style={{ width: '70px' }}>Dist (km)</th>
                        <th style={{ width: '75px' }}>Bearing</th>
                        <th style={{ width: '70px' }}>Climb (m)</th>
                        <th style={{ width: '80px' }}>Walk Time</th>
                        <th style={{ width: '105px' }}>Rest</th>
                        <th style={{ width: '80px' }}>Total Time</th>
                        <th>Navigation Description</th>
                        <th>Escape Route</th>
                        <th style={{ width: '75px' }}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {legs.map((leg, idx) => {
                        const isActive = idx === activeLegIndex;
                        const isLast = idx === legs.length - 1;

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
                                <td className="ems-text-center font-mono">{String(leg.magnetic_bearing).padStart(3, '0')}° mag</td>
                                <td className="ems-text-center font-mono">+{Math.round(leg.ascent_m)}m</td>
                                <td className="ems-text-center font-mono"><b>{formatHoursMins(leg.walking_minutes)}</b></td>
                                <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <input
                                            type="number"
                                            min="0"
                                            max="120"
                                            className="ems-table-input-number"
                                            value={leg.rest_minutes || 0}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => handleTextChange(idx, 'rest_minutes', parseInt(e.target.value, 10) || 0)}
                                        />
                                        <span className="font-mono" style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>
                                            {formatHoursMins(leg.rest_minutes || 0)}
                                        </span>
                                    </div>
                                </td>
                                <td className="ems-text-center font-mono"><b>{formatHoursMins(leg.walking_minutes + (leg.rest_minutes || 0))}</b></td>
                                <td>
                                    <textarea
                                        rows={2}
                                        className="ems-table-textarea"
                                        value={leg.route_description || ''}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => handleTextChange(idx, 'route_description', e.target.value)}
                                        placeholder="Path, handrails, features..."
                                    />
                                </td>
                                <td>
                                    <textarea
                                        rows={2}
                                        className="ems-table-textarea"
                                        value={leg.escape_route || ''}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => handleTextChange(idx, 'escape_route', e.target.value)}
                                        placeholder="Escape plan..."
                                    />
                                </td>
                                <td>
                                    <div className="ems-table-actions" onClick={(e) => e.stopPropagation()}>
                                        <button
                                            type="button"
                                            className="ems-btn-icon"
                                            title="Split Leg at midpoint"
                                            onClick={() => onSplitLeg(idx)}
                                        >
                                            <FontAwesomeIcon icon={faScissors} />
                                        </button>
                                        {!isLast && (
                                            <button
                                                type="button"
                                                className="ems-btn-icon"
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
