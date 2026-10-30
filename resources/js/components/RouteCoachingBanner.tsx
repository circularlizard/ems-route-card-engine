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
    dofeLevel?: 'bronze' | 'silver' | 'gold';
}

export function RouteCoachingBanner({
    legs,
    totalWalkingMinutes,
    totalRestMinutes,
    dofeLevel = 'silver',
}: RouteCoachingBannerProps) {
    const [isCollapsed, setIsCollapsed] = useState(false);

    const issues: { type: 'warning' | 'info'; message: string; icon: typeof faTriangleExclamation }[] = [];

    // 1. Minimum DofE Expedition Hours
    const totalExpMins = totalWalkingMinutes + totalRestMinutes;
    const totalExpHours = totalExpMins / 60.0;
    const minHours = dofeLevel === 'bronze' ? 6 : dofeLevel === 'silver' ? 7 : 8;

    if (totalExpHours < minHours) {
        issues.push({
            type: 'warning',
            icon: faClock,
            message: `Total expedition time is ${formatHoursMins(totalExpMins)} (${totalExpHours.toFixed(1)} hrs). DofE ${dofeLevel.toUpperCase()} requires a minimum of ${minHours} hours planned activity per day.`,
        });
    }

    // 2. Long legs without checkpoints (> 3.5km)
    const longLegs = legs.filter((l) => l.distance_km > 3.5);
    if (longLegs.length > 0) {
        issues.push({
            type: 'info',
            icon: faRoute,
            message: `${longLegs.length} leg(s) exceed 3.5 km without an intermediate checkpoint (e.g. Leg ${longLegs.map((l) => l.leg_number).join(', ')}). Consider adding a split point at a col or river crossing.`,
        });
    }

    // 3. Missing descriptions or escape routes
    const missingDesc = legs.filter((l) => !l.route_description || l.route_description.trim().length < 10);
    if (missingDesc.length > 0) {
        issues.push({
            type: 'warning',
            icon: faTriangleExclamation,
            message: `${missingDesc.length} leg(s) have brief or missing route navigation descriptions.`,
        });
    }

    const missingEscape = legs.filter((l) => !l.escape_route || l.escape_route.trim().length < 5);
    if (missingEscape.length > 0) {
        issues.push({
            type: 'warning',
            icon: faShieldHalved,
            message: `${missingEscape.length} leg(s) are missing safety and escape route instructions.`,
        });
    }

    if (issues.length === 0) {
        return (
            <div className="ems-coaching-banner ems-coaching-banner--success">
                <FontAwesomeIcon icon={faCheckCircle} className="ems-coaching-banner__icon" />
                <div className="ems-coaching-banner__content">
                    <b>All pre-flight route checks pass!</b> Your route card is ready for leader review.
                </div>
            </div>
        );
    }

    return (
        <div className="ems-coaching-banner ems-coaching-banner--warning">
            <div className="ems-coaching-banner__header" onClick={() => setIsCollapsed(!isCollapsed)}>
                <div className="ems-coaching-banner__title">
                    <FontAwesomeIcon icon={faTriangleExclamation} className="ems-coaching-banner__icon" />
                    <span><b>Pre-Flight Coaching ({issues.length} feedback items)</b></span>
                </div>
                <button type="button" className="ems-btn-icon">
                    <FontAwesomeIcon icon={isCollapsed ? faChevronDown : faChevronUp} />
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
