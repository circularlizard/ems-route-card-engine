import { useEffect } from 'react';
import { RouteLeg, RouteHeaderData } from '../types/route-card';
import {
    formatHoursMins,
    calculateLegSchedule,
    LegScheduleItem,
    createDefaultHeaderData,
} from '../utils/route-calculations';

interface RouteLegTableProps {
    legs: RouteLeg[];
    activeLegIndex?: number;
    onSelectLeg?: (legIndex: number) => void;
    onUpdateLeg: (legIndex: number, updatedLeg: RouteLeg) => void;
    onSplitLeg?: (legIndex: number) => void;
    onMergeLeg?: (legIndex: number) => void;
    headerData?: RouteHeaderData;
    onUpdateHeaderData?: (updatedHeader: Partial<RouteHeaderData>) => void;
    schedule?: LegScheduleItem[];
    dayNumber?: number;
    totalDistanceKm?: number;
    totalAscentM?: number;
    totalWalkingMins?: number;
    totalStopsMins?: number;
    totalExpeditionMins?: number;
}

export function RouteLegTable({
    legs,
    activeLegIndex = 0,
    onSelectLeg,
    onUpdateLeg,
    onMergeLeg: _onMergeLeg,
    headerData,
    onUpdateHeaderData,
    schedule: scheduleProp,
    dayNumber = 1,
    totalDistanceKm,
    totalAscentM,
    totalWalkingMins,
    totalStopsMins,
    totalExpeditionMins,
}: RouteLegTableProps) {
    const safeHeaderData: RouteHeaderData = headerData || createDefaultHeaderData(dayNumber);

    // Compute schedule if not explicitly provided
    const schedule: LegScheduleItem[] =
        scheduleProp ||
        calculateLegSchedule(
            legs,
            safeHeaderData.settingOutTime || '09:00',
            safeHeaderData.baseWalkingSpeedKmh || 4.0,
            safeHeaderData.elevationPenaltyMinsPer10m || 1.0
        );

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

    const handleHeaderChange = (field: keyof RouteHeaderData, value: any) => {
        onUpdateHeaderData?.({ [field]: value });
    };

    const handleDateChange = (newDate: string) => {
        const d = new Date(newDate);
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const newDayOfWeek = !isNaN(d.getTime()) ? dayNames[d.getDay()] : safeHeaderData.dayOfWeek;
        onUpdateHeaderData?.({ date: newDate, dayOfWeek: newDayOfWeek });
    };

    const handleTeamMembersChange = (raw: string) => {
        const members = raw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        onUpdateHeaderData?.({ teamMembers: members });
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

    // Totals fallback
    const computedDistKm = totalDistanceKm ?? legs.reduce((acc, l) => acc + l.distance_km, 0);
    const computedClimbM = totalAscentM ?? legs.reduce((acc, l) => acc + l.ascent_m, 0);
    const computedWalkMins = totalWalkingMins ?? schedule.reduce((acc, s) => acc + s.walkTimeMinutes, 0);
    const computedStopsMins = totalStopsMins ?? schedule.reduce((acc, s) => acc + s.stopsMinutes, 0);
    const computedExpedMins = totalExpeditionMins ?? computedWalkMins + computedStopsMins;

    const firstDeparture = schedule[0]?.departsFrom || safeHeaderData.settingOutTime || '09:00';
    const finalDeparture = schedule[schedule.length - 1]?.departsAt || '--';

    return (
        <div className="ems-route-card-full-container">
            {/* 1. Header Metadata Summary Block */}
            <div className="ems-route-card-meta-card">
                <div className="ems-meta-card-header">
                    <div>
                        <h3 className="ems-meta-card-title">DofE Expedition Route Card — Day {dayNumber}</h3>
                        <p className="ems-meta-card-sub">Official Expedition Timings, Checkpoints & Emergency Strategy</p>
                    </div>
                </div>

                <div className="ems-meta-grid">
                    {/* Expedition Aim */}
                    <div className="ems-meta-field ems-meta-field--full">
                        <label className="ems-meta-label">EXPEDITION AIM / PURPOSE</label>
                        <input
                            type="text"
                            className="ems-meta-input"
                            value={safeHeaderData.aim || ''}
                            onChange={(e) => handleHeaderChange('aim', e.target.value)}
                            placeholder="e.g. Study human impact on mountain footpaths & historical landmarks"
                        />
                    </div>

                    {/* Date & Day of Week */}
                    <div className="ems-meta-field">
                        <label className="ems-meta-label">EXPEDITION DATE & DAY</label>
                        <div className="ems-meta-input-group">
                            <input
                                type="date"
                                className="ems-meta-input"
                                value={safeHeaderData.date || ''}
                                onChange={(e) => handleDateChange(e.target.value)}
                            />
                            <input
                                type="text"
                                className="ems-meta-input ems-meta-input--short"
                                value={safeHeaderData.dayOfWeek || ''}
                                onChange={(e) => handleHeaderChange('dayOfWeek', e.target.value)}
                                placeholder="Day of Week"
                            />
                        </div>
                    </div>

                    {/* Unit & Team */}
                    <div className="ems-meta-field">
                        <label className="ems-meta-label">UNIT & TEAM NAME</label>
                        <div className="ems-meta-input-group">
                            <input
                                type="text"
                                className="ems-meta-input"
                                value={safeHeaderData.unitName || ''}
                                onChange={(e) => handleHeaderChange('unitName', e.target.value)}
                                placeholder="Unit (e.g. Pentland District DofE)"
                            />
                            <input
                                type="text"
                                className="ems-meta-input ems-meta-input--short"
                                value={safeHeaderData.teamName || ''}
                                onChange={(e) => handleHeaderChange('teamName', e.target.value)}
                                placeholder="Team (e.g. Team G)"
                            />
                        </div>
                    </div>

                    {/* Team Members */}
                    <div className="ems-meta-field ems-meta-field--full">
                        <label className="ems-meta-label">TEAM PARTICIPANTS</label>
                        <input
                            type="text"
                            className="ems-meta-input"
                            value={safeHeaderData.teamMembers?.join(', ') || ''}
                            onChange={(e) => handleTeamMembersChange(e.target.value)}
                            placeholder="Comma-separated names (e.g. Alice Smith, Bob Jones, Charlie Davis, Diana Prince)"
                        />
                    </div>

                    {/* Supervisor Contact */}
                    <div className="ems-meta-field">
                        <label className="ems-meta-label">PRIMARY SUPERVISOR / LEADER</label>
                        <div className="ems-meta-input-group">
                            <input
                                type="text"
                                className="ems-meta-input"
                                value={safeHeaderData.supervisorName || ''}
                                onChange={(e) => handleHeaderChange('supervisorName', e.target.value)}
                                placeholder="Leader Name"
                            />
                            <input
                                type="text"
                                className="ems-meta-input"
                                value={safeHeaderData.supervisorPhone || ''}
                                onChange={(e) => handleHeaderChange('supervisorPhone', e.target.value)}
                                placeholder="Leader Contact Phone"
                            />
                        </div>
                    </div>

                    {/* Home / Backup Contact */}
                    <div className="ems-meta-field">
                        <label className="ems-meta-label">HOME / BACKUP CONTACT</label>
                        <div className="ems-meta-input-group">
                            <input
                                type="text"
                                className="ems-meta-input"
                                value={safeHeaderData.backupName || ''}
                                onChange={(e) => handleHeaderChange('backupName', e.target.value)}
                                placeholder="Backup Contact Name"
                            />
                            <input
                                type="text"
                                className="ems-meta-input"
                                value={safeHeaderData.backupPhone || ''}
                                onChange={(e) => handleHeaderChange('backupPhone', e.target.value)}
                                placeholder="Backup Contact Phone"
                            />
                        </div>
                    </div>

                    {/* Start Location */}
                    <div className="ems-meta-field">
                        <label className="ems-meta-label">START POINT LOCATION & GRID REF</label>
                        <div className="ems-meta-input-group">
                            <input
                                type="text"
                                className="ems-meta-input"
                                value={safeHeaderData.startPointDescription || (legs[0]?.start_name || '')}
                                onChange={(e) => handleHeaderChange('startPointDescription', e.target.value)}
                                placeholder="Start Location (e.g. Bonaly Scout Centre)"
                            />
                            <input
                                type="text"
                                className="ems-meta-input ems-meta-input--short font-mono"
                                value={safeHeaderData.startGridRef || (legs[0]?.start_grid_ref || '')}
                                onChange={(e) => handleHeaderChange('startGridRef', e.target.value)}
                                placeholder="Grid Ref (e.g. NT 212 677)"
                            />
                        </div>
                    </div>

                    {/* Timing & Pacing Parameters */}
                    <div className="ems-meta-field ems-meta-field--timing">
                        <label className="ems-meta-label">SETTING OUT TIME & PACING ENGINE</label>
                        <div className="ems-meta-pacing-row">
                            <div className="ems-meta-pacing-item">
                                <span className="ems-meta-sublabel">Depart:</span>
                                <input
                                    type="time"
                                    className="ems-meta-time-input"
                                    value={safeHeaderData.settingOutTime || '09:00'}
                                    onChange={(e) => handleHeaderChange('settingOutTime', e.target.value)}
                                    title="Setting Out Time (Start of Leg 1)"
                                />
                            </div>
                            <div className="ems-meta-pacing-item">
                                <span className="ems-meta-sublabel">Base Speed:</span>
                                <input
                                    type="number"
                                    step="0.1"
                                    min="1.0"
                                    max="10.0"
                                    className="ems-meta-number-input"
                                    value={safeHeaderData.baseWalkingSpeedKmh ?? 4.0}
                                    onChange={(e) => handleHeaderChange('baseWalkingSpeedKmh', parseFloat(e.target.value) || 4.0)}
                                    title="Base Walking Speed in km/h (Default 4.0)"
                                />
                                <span className="ems-meta-unit">km/h</span>
                            </div>
                            <div className="ems-meta-pacing-item">
                                <span className="ems-meta-sublabel">Climb Penalty:</span>
                                <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    max="5.0"
                                    className="ems-meta-number-input"
                                    value={safeHeaderData.elevationPenaltyMinsPer10m ?? 1.0}
                                    onChange={(e) => handleHeaderChange('elevationPenaltyMinsPer10m', parseFloat(e.target.value) || 0)}
                                    title="Ascent Climbing Penalty (Default 1 min per 10m ascent)"
                                />
                                <span className="ems-meta-unit">min / 10m</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. Comprehensive 13-Column Tabular Grid */}
            <div className="ems-table-responsive-wrapper">
                <table className="ems-route-table ems-route-card-table">
                    <thead>
                        <tr>
                            <th style={{ width: '38px' }} className="ems-text-center">#</th>
                            <th style={{ minWidth: '130px' }}>From</th>
                            <th style={{ minWidth: '130px' }}>To</th>
                            <th style={{ width: '70px' }} className="ems-text-center">Dist (km)</th>
                            <th style={{ width: '70px' }} className="ems-text-center">Climb (m)</th>
                            <th style={{ width: '80px' }} className="ems-text-center">Walk Time</th>
                            <th style={{ width: '85px' }} className="ems-text-center">Stops (min)</th>
                            <th style={{ width: '80px' }} className="ems-text-center">Total</th>
                            <th style={{ width: '85px' }} className="ems-text-center">Start Time</th>
                            <th style={{ width: '95px' }} className="ems-text-center">End Time (inc stops)</th>
                            <th style={{ minWidth: '220px' }}>Leg Description &amp; Escape Route</th>
                            <th style={{ minWidth: '160px' }}>Activity for Goal / Project Work</th>
                        </tr>
                    </thead>
                    <tbody>
                        {legs.map((leg, idx) => {
                            const sched = schedule[idx] || {
                                legNumber: leg.leg_number,
                                walkTimeMinutes: leg.walking_minutes,
                                stopsMinutes: (leg.rest_minutes || 0) + (leg.activity_minutes || 0),
                                totalDurationMinutes: leg.walking_minutes + (leg.rest_minutes || 0),
                                departsFrom: '09:00',
                                arrivesAt: '09:00',
                                departsAt: '09:00',
                            };
                            const isActive = idx === activeLegIndex;

                            return (
                                <tr
                                    key={leg.leg_number}
                                    className={`ems-route-table__row ${isActive ? 'ems-route-table__row--active' : ''}`}
                                    onClick={() => onSelectLeg?.(idx)}
                                >
                                    {/* 1. Leg # */}
                                    <td className="ems-text-center">
                                        <span className="ems-table-leg-badge">{leg.leg_number}</span>
                                    </td>

                                    {/* 2. From */}
                                    <td>
                                        <input
                                            type="text"
                                            className="ems-table-waypoint-input"
                                            value={leg.start_name}
                                            onChange={(e) => handleTextChange(idx, 'start_name', e.target.value)}
                                            placeholder="Origin"
                                        />
                                        <div className="ems-table-point-coord">
                                            {leg.start_grid_ref} ({Math.round(leg.start_elevation_m)}m)
                                        </div>
                                    </td>

                                    {/* 3. To */}
                                    <td>
                                        <input
                                            type="text"
                                            className="ems-table-waypoint-input"
                                            value={leg.end_name}
                                            onChange={(e) => handleTextChange(idx, 'end_name', e.target.value)}
                                            placeholder="Destination"
                                        />
                                        <div className="ems-table-point-coord">
                                            {leg.end_grid_ref} ({Math.round(leg.end_elevation_m)}m)
                                        </div>
                                    </td>

                                    {/* 4. Distance */}
                                    <td className="ems-text-center font-mono">
                                        <b>{leg.distance_km.toFixed(2)}</b>
                                    </td>

                                    {/* 5. Height Climbed */}
                                    <td className="ems-text-center font-mono">
                                        +{Math.round(leg.ascent_m)}m
                                    </td>

                                    {/* 6. Leg Walk Time */}
                                    <td className="ems-text-center font-mono">
                                        <b>{formatHoursMins(sched.walkTimeMinutes)}</b>
                                    </td>

                                    {/* 7. Stops (min) */}
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                                            <input
                                                type="number"
                                                min="0"
                                                max="300"
                                                className="ems-table-input-number"
                                                value={sched.stopsMinutes}
                                                onClick={(e) => e.stopPropagation()}
                                                onChange={(e) => handleTextChange(idx, 'rest_minutes', parseInt(e.target.value, 10) || 0)}
                                                title="Stops Duration in minutes (Project & Rest)"
                                            />
                                            <span className="font-mono" style={{ fontSize: '11px', color: '#64748b' }}>
                                                m
                                            </span>
                                        </div>
                                    </td>

                                    {/* 8. Total Duration */}
                                    <td className="ems-text-center font-mono">
                                        <b>{formatHoursMins(sched.totalDurationMinutes)}</b>
                                    </td>

                                    {/* 9. Start Time */}
                                    <td className="ems-text-center font-mono ems-time-cell">
                                        {sched.departsFrom}
                                    </td>

                                    {/* 10. End Time (inc stops) */}
                                    <td className="ems-text-center font-mono ems-time-cell ems-time-cell--eta">
                                        <b>{sched.departsAt}</b>
                                    </td>

                                    {/* 11. Leg Description & Escape Route */}
                                    <td>
                                        <textarea
                                            rows={1}
                                            className="ems-auto-expand ems-table-textarea"
                                            value={leg.route_description || ''}
                                            onClick={(e) => e.stopPropagation()}
                                            onInput={(e) => syncTextareaHeight(e.currentTarget)}
                                            onChange={(e) => handleTextChange(idx, 'route_description', e.target.value)}
                                            placeholder="Paths, compass bearings, landmarks..."
                                        />
                                        <textarea
                                            rows={1}
                                            className="ems-auto-expand ems-table-textarea ems-table-textarea--escape"
                                            value={leg.escape_route || ''}
                                            onClick={(e) => e.stopPropagation()}
                                            onInput={(e) => syncTextareaHeight(e.currentTarget)}
                                            onChange={(e) => handleTextChange(idx, 'escape_route', e.target.value)}
                                            placeholder="Escape route / abort direction..."
                                        />
                                    </td>

                                    {/* 13. Activity for Goal / Project Work */}
                                    <td>
                                        <textarea
                                            rows={1}
                                            className="ems-auto-expand ems-table-textarea"
                                            value={leg.activity_notes || ''}
                                            onClick={(e) => e.stopPropagation()}
                                            onInput={(e) => syncTextareaHeight(e.currentTarget)}
                                            onChange={(e) => handleTextChange(idx, 'activity_notes', e.target.value)}
                                            placeholder="Aim / project observation..."
                                        />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot>
                        <tr className="ems-route-table__totals-row">
                            <td className="ems-text-center"><b>TOTAL</b></td>
                            <td colSpan={2}>
                                <b>{legs.length} Legs</b> ({legs[0]?.start_name || 'Start'} → {legs[legs.length - 1]?.end_name || 'Finish'})
                            </td>
                            <td className="ems-text-center font-mono"><b>{computedDistKm.toFixed(2)} km</b></td>
                            <td className="ems-text-center font-mono"><b>+{Math.round(computedClimbM)}m</b></td>
                            <td className="ems-text-center font-mono"><b>{formatHoursMins(computedWalkMins)}</b></td>
                            <td className="ems-text-center font-mono"><b>{formatHoursMins(computedStopsMins)}</b></td>
                            <td className="ems-text-center font-mono"><b>{formatHoursMins(computedExpedMins)}</b></td>
                            <td className="ems-text-center font-mono"><b>{firstDeparture}</b></td>
                            <td className="ems-text-center font-mono ems-time-cell--eta"><b>{finalDeparture}</b></td>
                            <td colSpan={2} className="ems-totals-note">
                                Day Finish: <b>{finalDeparture}</b>
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            {/* 3. Overall Emergency Plan Block */}
            <div className="ems-route-card-emergency-block">
                <div className="ems-emergency-block-header">
                    <h4>Overall Day Emergency Plan &amp; Escape Strategy</h4>
                    <span className="ems-emergency-block-sub">Bad weather thresholds, valley bail-out lines, and team abort protocols</span>
                </div>
                <textarea
                    rows={3}
                    className="ems-auto-expand ems-emergency-textarea"
                    value={safeHeaderData.emergencyPlan || ''}
                    onChange={(e) => handleHeaderChange('emergencyPlan', e.target.value)}
                    placeholder="e.g. In event of sustained ridge winds > 40mph or lightning, abort east into valley via Checkpoint 3. If member injured, shelter casualty in bothy at NT 245 612 and contact supervisor. Emergency rendezvous: Glen Car Park..."
                />
            </div>
        </div>
    );
}
