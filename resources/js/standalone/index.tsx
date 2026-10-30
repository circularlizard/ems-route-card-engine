import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRoute, faMountainSun, faGear } from '@fortawesome/free-solid-svg-icons';
import '../../css/ems-route-card.css';
import { DEMTileManager } from '../components/DEMTileManager';
import { RouteCardBuilder } from '../components/RouteCardBuilder';
import { SettingsManager } from '../components/SettingsManager';

interface StudioConfig {
    root_url: string;
    nonce: string;
    expedition_id?: number;
    team_id?: number;
    day_number?: number;
    is_shortcode?: boolean;
    os_maps_api_key?: string;
    os_maps_api_secret?: string;
}

declare global {
    interface Window {
        emsRouteCardStudioConfig?: StudioConfig;
    }
}

interface RouteCardStudioProps {
    expeditionId?: number;
    teamId?: number;
    dayNumber?: number;
    isShortcode?: boolean;
    osMapsApiKey?: string;
}

export function RouteCardStudio({
    expeditionId = 1,
    teamId = 1,
    dayNumber = 1,
    isShortcode = false,
    osMapsApiKey,
}: RouteCardStudioProps) {
    const [activeTab, setActiveTab] = useState<'sandbox' | 'dem_manager' | 'settings'>('sandbox');
    const [currentApiKey, setCurrentApiKey] = useState<string | undefined>(osMapsApiKey);

    return (
        <div className="ems-route-card-studio">
            {!isShortcode && (
                <div className="ems-route-card-studio__header">
                    <h2>DofE Route Card Studio &amp; Terrain Engine</h2>
                    <p>Plan expedition routes, synchronize interactive maps with route cards, manage OS Terrain 50 elevation tiles, and export DofE-compliant cards.</p>
                </div>
            )}

            {/* Navigation Tabs (Only in standalone admin studio, hidden on front-end shortcodes) */}
            {!isShortcode && (
                <div className="ems-studio-tabs">
                    <button
                        type="button"
                        className={`ems-studio-tab ${activeTab === 'sandbox' ? 'ems-studio-tab--active' : ''}`}
                        onClick={() => setActiveTab('sandbox')}
                    >
                        <FontAwesomeIcon icon={faRoute} className="ems-tab-icon" /> Route Card Studio &amp; Sandbox
                    </button>
                    <button
                        type="button"
                        className={`ems-studio-tab ${activeTab === 'dem_manager' ? 'ems-studio-tab--active' : ''}`}
                        onClick={() => setActiveTab('dem_manager')}
                    >
                        <FontAwesomeIcon icon={faMountainSun} className="ems-tab-icon" /> Local DEM Tile Manager
                    </button>
                    <button
                        type="button"
                        className={`ems-studio-tab ${activeTab === 'settings' ? 'ems-studio-tab--active' : ''}`}
                        onClick={() => setActiveTab('settings')}
                    >
                        <FontAwesomeIcon icon={faGear} className="ems-tab-icon" /> Map &amp; API Settings
                    </button>
                </div>
            )}

            {activeTab === 'dem_manager' && !isShortcode && <DEMTileManager />}

            {activeTab === 'settings' && !isShortcode && (
                <SettingsManager
                    onUpdateApiKey={(newKey) => setCurrentApiKey(newKey)}
                />
            )}

            {activeTab === 'sandbox' && (
                <RouteCardBuilder
                    expeditionId={expeditionId}
                    teamId={teamId}
                    initialDay={dayNumber}
                    totalDays={3}
                    osMapsApiKey={currentApiKey}
                />
            )}
        </div>
    );
}

const rootEl = document.getElementById('ems-route-card-studio-root');
if (rootEl) {
    const config = window.emsRouteCardStudioConfig;
    const expId = parseInt(rootEl.dataset.expedition || '', 10) || config?.expedition_id || 1;
    const teamId = parseInt(rootEl.dataset.team || '', 10) || config?.team_id || 1;
    const day = parseInt(rootEl.dataset.day || '', 10) || config?.day_number || 1;
    const isShortcode = rootEl.dataset.shortcode === 'true' || Boolean(config?.is_shortcode);

    createRoot(rootEl).render(
        <RouteCardStudio
            expeditionId={expId}
            teamId={teamId}
            dayNumber={day}
            isShortcode={isShortcode}
            osMapsApiKey={config?.os_maps_api_key}
        />
    );
}
