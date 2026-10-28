import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../css/ems-route-card.css';
import { DEMTileManager } from '../components/DEMTileManager';

interface StudioConfig {
    root_url: string;
    nonce: string;
}

declare global {
    interface Window {
        emsRouteCardStudioConfig?: StudioConfig;
    }
}

export function RouteCardStudio() {
    const [activeTab, setActiveTab] = useState<'sandbox' | 'dem_manager'>('dem_manager');

    return (
        <div className="ems-route-card-studio">
            <div className="ems-route-card-studio__header">
                <h2>Standalone DofE Route Card Studio</h2>
                <p>Plan expedition routes, manage local OS Terrain 50 binary elevation tiles, and verify geodesy benchmarks.</p>
            </div>

            {/* Navigation Tabs */}
            <div className="ems-studio-tabs">
                <button
                    type="button"
                    className={`ems-studio-tab ${activeTab === 'dem_manager' ? 'ems-studio-tab--active' : ''}`}
                    onClick={() => setActiveTab('dem_manager')}
                >
                    ⛰️ Local DEM Tile Manager
                </button>
                <button
                    type="button"
                    className={`ems-studio-tab ${activeTab === 'sandbox' ? 'ems-studio-tab--active' : ''}`}
                    onClick={() => setActiveTab('sandbox')}
                >
                    🗺️ Route Card Sandbox
                </button>
            </div>

            {activeTab === 'dem_manager' && <DEMTileManager />}

            {activeTab === 'sandbox' && (
                <div className="ems-route-card-studio__panel">
                    <p>Route Card Sandbox canvas initialized. Upload a GPX file or configure test waypoints.</p>
                </div>
            )}
        </div>
    );
}

const rootEl = document.getElementById('ems-route-card-studio-root');
if (rootEl) {
    createRoot(rootEl).render(<RouteCardStudio />);
}
