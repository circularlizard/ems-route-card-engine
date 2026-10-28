import { useState, useEffect, useCallback, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faMountain,
    faUpload,
    faCheckCircle,
    faExclamationTriangle,
    faTrashAlt,
    faSearch,
    faSync,
    faHardDrive,
    faLayerGroup,
} from '@fortawesome/free-solid-svg-icons';

export interface DEMTile {
    square: string;
    name: string;
    region: string;
    dfe_priority: boolean;
    installed: boolean;
    file_path: string;
    file_size: number;
    is_valid_size: boolean;
    modified_at: string | null;
    benchmark: {
        passed: boolean;
        message: string;
    } | null;
}

export interface DEMTilesResponse {
    success: boolean;
    storage_dir: string;
    total_tiles: number;
    installed: number;
    valid: number;
    total_bytes: number;
    total_size_mb: number;
    tiles: DEMTile[];
    message?: string;
}

export function DEMTileManager() {
    const [data, setData] = useState<DEMTilesResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'priority' | 'installed' | 'missing'>('priority');
    const [search, setSearch] = useState('');
    const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const config = window.emsRouteCardStudioConfig;
    const rootUrl = config?.root_url ?? '/wp-json/ems-route/v1';
    const nonce = config?.nonce ?? '';

    const fetchTiles = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${rootUrl}/dem/tiles`, {
                headers: {
                    'X-WP-Nonce': nonce,
                },
            });
            const json = (await res.json()) as DEMTilesResponse;
            if (json.success) {
                setData(json);
            } else {
                setError(json.message || 'Failed to fetch DEM tiles');
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Network error fetching tiles');
        } finally {
            setLoading(false);
        }
    }, [rootUrl, nonce]);

    useEffect(() => {
        fetchTiles();
    }, [fetchTiles]);

    const handleUploadFiles = async (files: FileList | File[]) => {
        if (!files || files.length === 0) return;
        setUploading(true);
        setUploadProgress('Preparing upload...');
        setActionMessage(null);

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            setUploadProgress(`Uploading ${file.name} (${i + 1}/${files.length})...`);

            const formData = new FormData();
            formData.append('file', file);

            try {
                const res = await fetch(`${rootUrl}/dem/upload`, {
                    method: 'POST',
                    headers: {
                        'X-WP-Nonce': nonce,
                    },
                    body: formData,
                });
                const resData = await res.json();
                if (resData.success) {
                    successCount++;
                } else {
                    failCount++;
                    setActionMessage({ type: 'error', text: resData.message || `Failed to upload ${file.name}` });
                }
            } catch (err) {
                failCount++;
                setActionMessage({
                    type: 'error',
                    text: err instanceof Error ? err.message : `Network error uploading ${file.name}`,
                });
            }
        }

        setUploading(false);
        setUploadProgress(null);

        if (successCount > 0) {
            setActionMessage({
                type: 'success',
                text: `Successfully uploaded ${successCount} tile(s).`,
            });
            await fetchTiles();
        }
    };

    const handleDelete = async (square: string) => {
        if (!window.confirm(`Are you sure you want to delete ${square}.bin from storage?`)) {
            return;
        }

        try {
            const res = await fetch(`${rootUrl}/dem/${square}`, {
                method: 'DELETE',
                headers: {
                    'X-WP-Nonce': nonce,
                },
            });
            const resData = await res.json();
            if (resData.success) {
                setActionMessage({ type: 'success', text: `Deleted tile ${square}.bin` });
                await fetchTiles();
            } else {
                setActionMessage({ type: 'error', text: resData.message || 'Failed to delete tile' });
            }
        } catch (err) {
            setActionMessage({
                type: 'error',
                text: err instanceof Error ? err.message : 'Network error deleting tile',
            });
        }
    };

    // Filter tiles
    const filteredTiles = (data?.tiles || []).filter((tile) => {
        if (filter === 'priority' && !tile.dfe_priority) return false;
        if (filter === 'installed' && !tile.installed) return false;
        if (filter === 'missing' && tile.installed) return false;

        if (search.trim()) {
            const q = search.toLowerCase();
            return (
                tile.square.toLowerCase().includes(q) ||
                tile.name.toLowerCase().includes(q) ||
                tile.region.toLowerCase().includes(q)
            );
        }

        return true;
    });

    return (
        <div className="dem-tile-manager">
            {/* Header / Stats Banner */}
            <div className="dem-tile-manager__overview">
                <div className="dem-stat-card">
                    <FontAwesomeIcon icon={faHardDrive} className="dem-stat-card__icon" />
                    <div>
                        <div className="dem-stat-card__label">Storage Directory</div>
                        <div className="dem-stat-card__val dem-stat-card__val--sm">
                            <code>{data?.storage_dir || 'Loading...'}</code>
                        </div>
                    </div>
                </div>

                <div className="dem-stat-card">
                    <FontAwesomeIcon icon={faLayerGroup} className="dem-stat-card__icon" />
                    <div>
                        <div className="dem-stat-card__label">Coverage Installed</div>
                        <div className="dem-stat-card__val">
                            {data ? `${data.installed} / ${data.total_tiles}` : '...'}
                            <span className="dem-stat-card__subval">
                                ({data ? `${data.total_size_mb} MB` : '0 MB'})
                            </span>
                        </div>
                    </div>
                </div>

                <div className="dem-stat-card">
                    <FontAwesomeIcon icon={faMountain} className="dem-stat-card__icon" />
                    <div>
                        <div className="dem-stat-card__label">Validated 8MB Tiles</div>
                        <div className="dem-stat-card__val">
                            {data ? `${data.valid} Valid` : '...'}
                        </div>
                    </div>
                </div>
            </div>

            {/* Notification Banner */}
            {actionMessage && (
                <div className={`dem-alert dem-alert--${actionMessage.type}`}>
                    {actionMessage.text}
                </div>
            )}
            {error && <div className="dem-alert dem-alert--error">{error}</div>}

            {/* Upload Zone */}
            <div
                className={`dem-upload-zone ${uploading ? 'dem-upload-zone--uploading' : ''}`}
                onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
                onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        handleUploadFiles(e.dataTransfer.files);
                    }
                }}
            >
                <input
                    type="file"
                    ref={fileInputRef}
                    multiple
                    accept=".bin,.zip"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                            handleUploadFiles(e.target.files);
                        }
                    }}
                />
                <FontAwesomeIcon icon={faUpload} className="dem-upload-zone__icon" />
                <h3>Upload Compiled Elevation Tiles (.bin or .zip)</h3>
                <p>Drag and drop compiled 8MB binary tiles (e.g. <code>NT.bin</code>, <code>NN.bin</code>) or zip bundles directly here.</p>
                <button
                    type="button"
                    className="button button-primary"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                >
                    {uploading ? uploadProgress || 'Uploading...' : 'Select Files to Upload'}
                </button>
            </div>

            {/* Filters & Search Toolbar */}
            <div className="dem-toolbar">
                <div className="dem-toolbar__filters">
                    <button
                        type="button"
                        className={`button ${filter === 'priority' ? 'button-primary' : ''}`}
                        onClick={() => setFilter('priority')}
                    >
                        Popular DofE Squares
                    </button>
                    <button
                        type="button"
                        className={`button ${filter === 'all' ? 'button-primary' : ''}`}
                        onClick={() => setFilter('all')}
                    >
                        All UK Squares ({data?.total_tiles || 55})
                    </button>
                    <button
                        type="button"
                        className={`button ${filter === 'installed' ? 'button-primary' : ''}`}
                        onClick={() => setFilter('installed')}
                    >
                        Installed ({data?.installed || 0})
                    </button>
                    <button
                        type="button"
                        className={`button ${filter === 'missing' ? 'button-primary' : ''}`}
                        onClick={() => setFilter('missing')}
                    >
                        Missing ({data ? data.total_tiles - data.installed : 0})
                    </button>
                </div>

                <div className="dem-toolbar__actions">
                    <div className="dem-search-box">
                        <FontAwesomeIcon icon={faSearch} className="dem-search-box__icon" />
                        <input
                            type="text"
                            placeholder="Search square, area or region..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <button
                        type="button"
                        className="button button-secondary"
                        onClick={fetchTiles}
                        disabled={loading}
                        title="Refresh tile status"
                    >
                        <FontAwesomeIcon icon={faSync} spin={loading} />
                    </button>
                </div>
            </div>

            {/* Tiles Grid */}
            <div className="dem-tiles-grid">
                {filteredTiles.map((tile) => {
                    const isInstalled = tile.installed;
                    const isValid = tile.is_valid_size;

                    return (
                        <div
                            key={tile.square}
                            className={`dem-tile-card ${
                                isInstalled
                                    ? isValid
                                        ? 'dem-tile-card--installed'
                                        : 'dem-tile-card--invalid'
                                    : 'dem-tile-card--missing'
                            }`}
                        >
                            <div className="dem-tile-card__header">
                                <span className="dem-tile-card__code">{tile.square}</span>
                                <span
                                    className={`dem-badge ${
                                        isInstalled
                                            ? isValid
                                                ? 'dem-badge--success'
                                                : 'dem-badge--warning'
                                            : 'dem-badge--neutral'
                                    }`}
                                >
                                    {isInstalled
                                        ? isValid
                                            ? 'Installed & 8MB'
                                            : 'Size Mismatch'
                                        : 'Missing'}
                                </span>
                            </div>

                            <div className="dem-tile-card__body">
                                <div className="dem-tile-card__name" title={tile.name}>
                                    {tile.name}
                                </div>
                                <div className="dem-tile-card__region">{tile.region}</div>

                                {isInstalled && (
                                    <div className="dem-tile-card__details">
                                        <div>Size: {(tile.file_size / 1048576).toFixed(2)} MB</div>
                                        {tile.modified_at && <div>Updated: {tile.modified_at}</div>}
                                    </div>
                                )}

                                {tile.benchmark && (
                                    <div
                                        className={`dem-tile-card__benchmark ${
                                            tile.benchmark.passed
                                                ? 'dem-tile-card__benchmark--pass'
                                                : 'dem-tile-card__benchmark--fail'
                                        }`}
                                    >
                                        <FontAwesomeIcon
                                            icon={tile.benchmark.passed ? faCheckCircle : faExclamationTriangle}
                                        />{' '}
                                        {tile.benchmark.message}
                                    </div>
                                )}
                            </div>

                            <div className="dem-tile-card__footer">
                                {isInstalled ? (
                                    <button
                                        type="button"
                                        className="button button-link-delete"
                                        onClick={() => handleDelete(tile.square)}
                                        title={`Delete ${tile.square}.bin`}
                                    >
                                        <FontAwesomeIcon icon={faTrashAlt} /> Remove
                                    </button>
                                ) : (
                                    <span className="dem-tile-card__missing-hint">Upload {tile.square}.bin to enable</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
