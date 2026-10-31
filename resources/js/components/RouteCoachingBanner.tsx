import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faTriangleExclamation,
    faCheckCircle,
    faChevronDown,
    faChevronUp,
    faShieldHalved,
    faRoute,
    faClock,
} from '@fortawesome/free-solid-svg-icons';
import { RouteLeg } from '../types/route-card';
import { formatHoursMins } from '../utils/route-calculations';

interface RouteCoachingBannerProps {
    legs: RouteLeg[];
    totalWalkingMinutes: number;
    totalRestMinutes: number;
    totalProjectMinutes?: number;
    dofeLevel?: 'bronze' | 'silver' | 'gold';
}

export function RouteCoachingBanner({
    legs,
    totalWalkingMinutes,
    totalRestMinutes,
    totalProjectMinutes = 0,
    dofeLevel = 'silver',
}: RouteCoachingBannerProps) {
    const [isCollapsed, setIsCollapsed] = useState(true);

    const issues: { type: 'warning' | 'info'; message: string; icon: typeof faTriangleExclamation }[] = [];
    const summarySnippets: string[] = [];

    // 1. Minimum DofE Expedition Hours
    const totalExpMins = totalWalkingMinutes + totalRestMinutes + totalProjectMinutes;
    const totalExpHours = totalExpMins / 60.0;
    const minHours = dofeLevel === 'bronze' ? 6 : dofeLevel === 'silver' ? 7 : 8;

    if (totalExpHours < minHours) {
        issues.push({
            type: 'warning',
            icon: faClock,
            message: `Total expedition time is ${formatHoursMins(totalExpMins)} (${totalExpHours.toFixed(1)} hrs). DofE ${dofeLevel.toUpperCase()} requires a minimum of ${minHours} hours planned activity per day.`,
        });
        summarySnippets.push(`Under ${minHours}h planned time`);
    }

    // 2. Long legs without checkpoints (> 3.5km)
    const longLegs = legs.filter((l) => l.distance_km > 3.5);
    if (longLegs.length > 0) {
        issues.push({
            type: 'info',
            icon: faRoute,
            message: `${longLegs.length} leg(s) exceed 3.5 km without an intermediate checkpoint (e.g. Leg ${longLegs.map((l) => l.leg_number).join(', ')}). Consider adding a split point at a col or river crossing.`,
        });
        summarySnippets.push(`${longLegs.length} leg(s) > 3.5km`);
    }

    // 3. Missing descriptions or escape routes
    const missingDesc = legs.filter((l) => !l.route_description || l.route_description.trim().length < 10);
    if (missingDesc.length > 0) {
        issues.push({
            type: 'warning',
            icon: faTriangleExclamation,
            message: `${missingDesc.length} leg(s) have brief or missing route navigation descriptions.`,
        });
        summarySnippets.push(`${missingDesc.length} leg(s) missing detail`);
    }

    const missingEscape = legs.filter((l) => !l.escape_route || l.escape_route.trim().length < 5);
    if (missingEscape.length > 0) {
        issues.push({
            type: 'warning',
            icon: faShieldHalved,
            message: `${missingEscape.length} leg(s) are missing safety and escape route instructions.`,
        });
        summarySnippets.push(`${missingEscape.length} missing escape`);
    }

    if (issues.length === 0) {
        return (
            <div className="ems-coaching-banner ems-coaching-banner--success">
                <div className="ems-coaching-banner__summary">
                    <FontAwesomeIcon icon={faCheckCircle} className="ems-coaching-banner__icon" />
                    <span><b>Pre-Flight Checks Passed:</b> Route card meets minimum DofE requirements.</span>
                </div>
            </div>
        );
    }

    const summaryLine = summarySnippets.join(', ');

    return (
        <div className="ems-coaching-banner ems-coaching-banner--warning">
            <div className="ems-coaching-banner__summary" onClick={() => setIsCollapsed(!isCollapsed)}>
                <div className="ems-coaching-banner__title">
                    <FontAwesomeIcon icon={faTriangleExclamation} className="ems-coaching-banner__icon" />
                    <span className="ems-coaching-banner__text">
                        <b>{issues.length} Route Check{issues.length > 1 ? 's' : ''}</b>
                        {summaryLine ? ` — ${summaryLine}` : ''}
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
                    {issues.map((iss, i) => (
                        <li key={i} className={`ems-coaching-item ems-coaching-item--${iss.type}`}>
                            <FontAwesomeIcon icon={iss.icon} className="ems-coaching-item__icon" />
                            <span>{iss.message}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
