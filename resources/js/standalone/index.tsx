import { createRoot } from 'react-dom/client';
import '../../css/ems-route-card.css';

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
    return (
        <div className="ems-route-card-studio">
            <div className="ems-route-card-studio__header">
                <h2>Standalone DofE Route Card Studio</h2>
                <p>Upload a GPX file or test coordinates against the local OS Terrain 50 binary elevation dataset.</p>
            </div>
            <div className="ems-route-card-studio__panel">
                <p>Studio canvas initialized. Ready for GPX ingestion and terrain engine integration.</p>
            </div>
        </div>
    );
}

const rootEl = document.getElementById('ems-route-card-studio-root');
if (rootEl) {
    createRoot(rootEl).render(<RouteCardStudio />);
}
