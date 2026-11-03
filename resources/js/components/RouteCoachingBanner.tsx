import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faTriangleExclamation,
    faCheckCircle,
    faChevronDown,
    faChevronUp,
    faClock,
} from '@fortawesome/free-solid-svg-icons';
import { RouteLeg } from '../types/route-card';
import { formatHoursMins } from '../utils/route-calculations';

export function getLegIssues(leg: RouteLeg): string[] {
    const issues: string[] = [];
    if (leg.distance_km > 3.5) {
        issues.push('Leg > 3.5 km');
    }
    const desc = (leg.route_description || (leg as any).description || '').trim();
    if (desc.length === 0) {
        issues.push('Add route notes');
    } else if (desc.length < 15) {
        issues.push('Add bearings, paths or landmarks');
    }
    const escape = (leg.escape_route || '').trim();
    if (escape.length === 0) {
        issues.push('Add escape route');
    }
    return issues;
}

interface RouteCoachingBannerProps {
    legs: RouteLeg[];
    totalWalkingMinutes: number;
    totalRestMinutes: number;
    totalProjectMinutes?: number;
    dofeLevel?: 'bronze' | 'silver' | 'gold';
    onSelectLeg?: (legIndex: number) => void;
}

export function RouteCoachingBanner({
    legs,
    totalWalkingMinutes,
    totalRestMinutes,
    totalProjectMinutes = 0,
    dofeLevel = 'silver',
    onSelectLeg,
}: RouteCoachingBannerProps) {
    const [isCollapsed, setIsCollapsed] = useState(true);

    // 1. Identify problem legs
    const problemLegs = legs
        .map((leg, idx) => ({
            leg,
            idx,
            legNumber: leg.leg_number,
            name: `${leg.start_name || 'Start'} → ${leg.end_name || 'End'}`,
            issues: getLegIssues(leg),
        }))
        .filter((item) => item.issues.length > 0);

    // 2. Minimum DofE Expedition Hours
    const totalExpMins = totalWalkingMinutes + totalRestMinutes + totalProjectMinutes;
    const totalExpHours = totalExpMins / 60.0;
    const minHours = dofeLevel === 'bronze' ? 6 : dofeLevel === 'silver' ? 7 : 8;
    const isUnderTime = totalExpHours < minHours;

    if (problemLegs.length === 0 && !isUnderTime) {
        return (
            <div className="ems-coaching-banner ems-coaching-banner--success">
                <div className="ems-coaching-banner__summary">
                    <FontAwesomeIcon icon={faCheckCircle} className="ems-coaching-banner__icon" />
                    <span><b>Pre-Flight Checks Passed:</b> Route card meets minimum DofE requirements.</span>
                </div>
            </div>
        );
    }

    if (problemLegs.length === 0 && isUnderTime) {
        return (
            <div className="ems-coaching-banner ems-coaching-banner--warning">
                <div className="ems-coaching-banner__summary">
                    <div className="ems-coaching-banner__title">
                        <FontAwesomeIcon icon={faClock} className="ems-coaching-banner__icon" />
                        <span className="ems-coaching-banner__text">
                            <b>Total expedition time is under {minHours}h</b> ({formatHoursMins(totalExpMins)}). DofE {dofeLevel.toUpperCase()} requires a minimum of {minHours} hours planned activity per day.
                        </span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="ems-coaching-banner ems-coaching-banner--warning">
            <div className="ems-coaching-banner__summary">
                <div className="ems-coaching-banner__title">
                    <FontAwesomeIcon icon={faTriangleExclamation} className="ems-coaching-banner__icon" />
                    <span className="ems-coaching-banner__text">
                        <b>Issues with {problemLegs.length === 1 ? 'leg' : 'legs'} </b>
                        {problemLegs.map((item, i) => (
                            <span key={item.legNumber}>
                                {i > 0 && ', '}
                                <button
                                    type="button"
                                    className="ems-coaching-leg-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onSelectLeg?.(item.idx);
                                    }}
                                    title={`Leg ${item.legNumber} (${item.name}): ${item.issues.join(', ')} — click to expand`}
                                >
                                    {item.legNumber}
                                </button>
                            </span>
                        ))}
                        {isUnderTime && (
                            <span className="ems-coaching-time-note">
                                {' '}(and under {minHours}h minimum planned time)
                            </span>
                        )}
                    </span>
                </div>
                <button
                    type="button"
                    className="ems-coaching-banner__toggle-btn"
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsCollapsed(!isCollapsed);
                    }}
                    aria-expanded={!isCollapsed}
                >
                    {isCollapsed ? 'Show Details' : 'Hide Details'}
                    <FontAwesomeIcon icon={isCollapsed ? faChevronDown : faChevronUp} className="ems-toggle-icon" />
                </button>
            </div>

            {!isCollapsed && (
                <ul className="ems-coaching-list">
                    {problemLegs.map((item) => (
                        <li key={item.legNumber} className="ems-coaching-item ems-coaching-item--warning">
                            <FontAwesomeIcon icon={faTriangleExclamation} className="ems-coaching-item__icon" />
                            <span>
                                <button
                                    type="button"
                                    className="ems-coaching-leg-btn ems-coaching-leg-btn--inline"
                                    onClick={() => onSelectLeg?.(item.idx)}
                                    title="Click to expand this leg"
                                >
                                    Leg {item.legNumber} ({item.name})
                                </button>
                                : {item.issues.join(' • ')}
                            </span>
                        </li>
                    ))}
                    {isUnderTime && (
                        <li className="ems-coaching-item ems-coaching-item--warning">
                            <FontAwesomeIcon icon={faClock} className="ems-coaching-item__icon" />
                            <span>
                                Total expedition time is {formatHoursMins(totalExpMins)} ({totalExpHours.toFixed(1)} hrs).
                                DofE {dofeLevel.toUpperCase()} requires a minimum of {minHours} hours planned activity per day.
                            </span>
                        </li>
                    )}
                </ul>
            )}
        </div>
    );
}
