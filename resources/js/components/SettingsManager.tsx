import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faGear,
    faKey,
    faLock,
    faEye,
    faEyeSlash,
    faCheckCircle,
    faExclamationTriangle,
    faFloppyDisk,
    faPlug,
    faSpinner,
    faMapLocationDot,
    faCircleInfo,
} from '@fortawesome/free-solid-svg-icons';

interface SettingsManagerProps {
    onUpdateApiKey?: (key: string) => void;
}

export function SettingsManager({ onUpdateApiKey }: SettingsManagerProps) {
    const config = window.emsRouteCardStudioConfig;
    const rootUrl = config?.root_url ?? '/wp-json/ems-route/v1';
    const nonce = config?.nonce ?? '';

    const [apiKey, setApiKey] = useState(config?.os_maps_api_key ?? '');
    const [apiSecret, setApiSecret] = useState(config?.os_maps_api_secret ?? '');
    const [showKey, setShowKey] = useState(false);
    const [showSecret, setShowSecret] = useState(false);

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [hasConstantOverride, setHasConstantOverride] = useState(false);

    // Fetch stored settings on mount
    useEffect(() => {
        let isMounted = true;
        const fetchSettings = async () => {
            try {
                const res = await fetch(`${rootUrl}/settings`, {
                    headers: { 'X-WP-Nonce': nonce },
                });
                const data = await res.json();
                if (isMounted && data.success && data.settings) {
                    setApiKey(data.settings.os_maps_api_key || '');
                    setApiSecret(data.settings.os_maps_api_secret || '');
                    setHasConstantOverride(Boolean(data.settings.has_constant_override));
                }
            } catch {
                // If fetch fails, keep default config values
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        fetchSettings();
        return () => {
            isMounted = false;
        };
    }, [rootUrl, nonce]);

    // Save credentials to WordPress database
    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setStatusMessage(null);

        try {
            const res = await fetch(`${rootUrl}/settings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-WP-Nonce': nonce,
                },
                body: JSON.stringify({
                    os_maps_api_key: apiKey.trim(),
                    os_maps_api_secret: apiSecret.trim(),
                }),
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.message || 'Failed to save settings');
            }

            // Update in-memory global config and inform parent
            if (window.emsRouteCardStudioConfig) {
                window.emsRouteCardStudioConfig.os_maps_api_key = apiKey.trim();
                window.emsRouteCardStudioConfig.os_maps_api_secret = apiSecret.trim();
            }

            if (onUpdateApiKey) {
                onUpdateApiKey(apiKey.trim());
            }

            setStatusMessage({
                type: 'success',
                text: 'Settings saved successfully! The OS Leisure map layer is now enabled in the studio.',
            });
        } catch (err: any) {
            setStatusMessage({
                type: 'error',
                text: err.message || 'Error saving settings.',
            });
        } finally {
            setIsSaving(false);
        }
    };

    // Test OS Data Hub Raster Tile connection
    const handleTestConnection = async () => {
        const keyToTest = apiKey.trim();
        if (!keyToTest) {
            setTestResult({
                success: false,
                message: 'Please enter an API Key first before testing.',
            });
            return;
        }

        setIsTesting(true);
        setTestResult(null);

        try {
            // Test fetch a UK overview tile from the OS Raster API
            const testUrl = `https://api.os.uk/maps/raster/v1/zxy/Outdoor_3857/7/63/42.png?key=${encodeURIComponent(keyToTest)}`;
            const res = await fetch(testUrl, { method: 'GET' });

            if (res.ok) {
                setTestResult({
                    success: true,
                    message: 'Connection Verified! Your API key is active and successfully authenticated with the OS Maps Raster API.',
                });
            } else if (res.status === 401 || res.status === 403) {
                setTestResult({
                    success: false,
                    message: `Authentication Failed (HTTP ${res.status}): The API key was rejected. Please ensure the key has access to the OS Maps API (Raster) in your OS Data Hub project.`,
                });
            } else {
                setTestResult({
                    success: false,
                    message: `Unexpected response from OS Data Hub (HTTP ${res.status}): ${res.statusText}`,
                });
            }
        } catch (err: any) {
            setTestResult({
                success: false,
                message: `Connection error: ${err.message || 'Could not connect to api.os.uk'}.`,
            });
        } finally {
            setIsTesting(false);
        }
    };

    return (
        <div className="ems-settings-container">
            <div className="ems-settings-card">
                <div className="ems-settings-card__header">
                    <div className="ems-settings-card__title-group">
                        <FontAwesomeIcon icon={faGear} className="ems-settings-icon" />
                        <div>
                            <h3>Map &amp; API Credentials</h3>
                            <p className="ems-settings-card__subtitle">
                                Configure your Ordnance Survey (OS) Data Hub credentials to unlock official 1:25k Explorer and 1:50k Landranger leisure cartography.
                            </p>
                        </div>
                    </div>
                </div>

                {hasConstantOverride && (
                    <div className="ems-settings-alert ems-settings-alert--info">
                        <FontAwesomeIcon icon={faCircleInfo} />
                        <div>
                            <strong>Server Constant Active:</strong> <code>EMS_OS_MAPS_API_KEY</code> is defined in <code>wp-config.php</code> and takes precedence.
                        </div>
                    </div>
                )}

                {statusMessage && (
                    <div className={`ems-settings-alert ems-settings-alert--${statusMessage.type}`}>
                        <FontAwesomeIcon icon={statusMessage.type === 'success' ? faCheckCircle : faExclamationTriangle} />
                        <div>{statusMessage.text}</div>
                    </div>
                )}

                <form onSubmit={handleSave} className="ems-settings-form">
                    {/* API Key */}
                    <div className="ems-settings-field">
                        <label htmlFor="ems-os-api-key" className="ems-settings-label">
                            <FontAwesomeIcon icon={faKey} /> OS Maps API Key (ZXY / Raster)
                        </label>
                        <div className="ems-settings-input-group">
                            <input
                                id="ems-os-api-key"
                                type={showKey ? 'text' : 'password'}
                                className="ems-settings-input"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="Paste your OS Data Hub API Key..."
                                disabled={isLoading || isSaving}
                                autoComplete="off"
                                spellCheck={false}
                            />
                            <button
                                type="button"
                                className="ems-settings-btn-ghost"
                                onClick={() => setShowKey(!showKey)}
                                title={showKey ? 'Hide API Key' : 'Show API Key'}
                            >
                                <FontAwesomeIcon icon={showKey ? faEyeSlash : faEye} />
                            </button>
                        </div>
                        <span className="ems-settings-hint">
                            Required for loading official OS Leisure Web Mercator tiles (<code>Outdoor_3857</code>).
                        </span>
                    </div>

                    {/* API Secret */}
                    <div className="ems-settings-field">
                        <label htmlFor="ems-os-api-secret" className="ems-settings-label">
                            <FontAwesomeIcon icon={faLock} /> OS Maps API Secret (Optional)
                        </label>
                        <div className="ems-settings-input-group">
                            <input
                                id="ems-os-api-secret"
                                type={showSecret ? 'text' : 'password'}
                                className="ems-settings-input"
                                value={apiSecret}
                                onChange={(e) => setApiSecret(e.target.value)}
                                placeholder="Paste your OS Data Hub API Secret..."
                                disabled={isLoading || isSaving}
                                autoComplete="off"
                                spellCheck={false}
                            />
                            <button
                                type="button"
                                className="ems-settings-btn-ghost"
                                onClick={() => setShowSecret(!showSecret)}
                                title={showSecret ? 'Hide Secret' : 'Show Secret'}
                            >
                                <FontAwesomeIcon icon={showSecret ? faEyeSlash : faEye} />
                            </button>
                        </div>
                        <span className="ems-settings-hint">
                            Stored securely in the WordPress database for server-to-server OAuth2 endpoints.
                        </span>
                    </div>

                    {/* Test Connection Results */}
                    {testResult && (
                        <div className={`ems-settings-alert ems-settings-alert--${testResult.success ? 'success' : 'error'}`}>
                            <FontAwesomeIcon icon={testResult.success ? faCheckCircle : faExclamationTriangle} />
                            <div>{testResult.message}</div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="ems-settings-actions">
                        <button
                            type="button"
                            className="ems-settings-btn ems-settings-btn--secondary"
                            onClick={handleTestConnection}
                            disabled={isTesting || !apiKey.trim()}
                        >
                            {isTesting ? (
                                <>
                                    <FontAwesomeIcon icon={faSpinner} spin /> Testing Connection...
                                </>
                            ) : (
                                <>
                                    <FontAwesomeIcon icon={faPlug} /> Test Connection
                                </>
                            )}
                        </button>

                        <button
                            type="submit"
                            className="ems-settings-btn ems-settings-btn--primary"
                            disabled={isSaving || isLoading}
                        >
                            {isSaving ? (
                                <>
                                    <FontAwesomeIcon icon={faSpinner} spin /> Saving...
                                </>
                            ) : (
                                <>
                                    <FontAwesomeIcon icon={faFloppyDisk} /> Save Settings
                                </>
                            )}
                        </button>
                    </div>
                </form>

                {/* Helpful OS Data Hub Information Box */}
                <div className="ems-settings-guide">
                    <h4>
                        <FontAwesomeIcon icon={faMapLocationDot} /> How to obtain your OS Data Hub API Key
                    </h4>
                    <ol>
                        <li>
                            Log into the official <a href="https://osdatahub.os.uk" target="_blank" rel="noopener noreferrer">OS Data Hub</a>.
                        </li>
                        <li>
                            Create or open a <strong>Project</strong> and add the <strong>OS Maps API</strong>.
                        </li>
                        <li>
                            Copy your project's <strong>API Key</strong> and paste it into the field above.
                        </li>
                        <li>
                            Click <strong>Test Connection</strong> to verify, then click <strong>Save Settings</strong>.
                        </li>
                    </ol>
                </div>
            </div>
        </div>
    );
}
