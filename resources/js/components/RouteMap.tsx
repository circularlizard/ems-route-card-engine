import { useEffect, useRef, useState } from 'react';
import * as L from 'leaflet';
import proj4 from 'proj4';
import proj4leaflet from 'proj4leaflet';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faExpand,
    faCompress,
    faLocationCrosshairs,
} from '@fortawesome/free-solid-svg-icons';
import { RouteLeg, RouteVertex } from '../types/route-card';

// Ensure browser globals for proj4leaflet and link Proj namespace
if (typeof window !== 'undefined') {
    (window as any).L = L;
    (window as any).proj4 = proj4;
}

// Define British National Grid projection
proj4.defs(
    'EPSG:27700',
    '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs'
);

// Extended BNG resolutions from Zoom 0 (896m/px) to Zoom 12 (0.21875m/px) for deep zooming into tracks
const BNG_RESOLUTIONS = [896.0, 448.0, 224.0, 112.0, 56.0, 28.0, 14.0, 7.0, 3.5, 1.75, 0.875, 0.4375, 0.21875];
const BNG_ORIGIN: [number, number] = [-238375.0, 1376256.0];

/**
 * Returns the EPSG:27700 British National Grid CRS for Ordnance Survey Leisure tiles.
 */
function getBngCrs(): L.CRS {
    const CrsConstructor: any =
        (proj4leaflet as any)?.CRS ||
        (proj4leaflet as any)?.default?.CRS ||
        (L as any)?.Proj?.CRS ||
        (typeof window !== 'undefined' && (window as any).L?.Proj?.CRS);

    if (CrsConstructor) {
        return new CrsConstructor(
            'EPSG:27700',
            '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs',
            {
                resolutions: BNG_RESOLUTIONS,
                origin: BNG_ORIGIN,
            }
        );
    }

    console.error('Proj4Leaflet CRS constructor not found, falling back to EPSG:3857');
    return L.CRS.EPSG3857;
}

interface RouteMapProps {
    vertices: RouteVertex[];
    legs: RouteLeg[];
    activeLegIndex: number;
    onSelectLeg: (legIndex: number) => void;
    onRequestSplitAtVertex?: (vertexIndex: number) => void;
    osMapsApiKey?: string;
    hoveredVertexIndex?: number | null;
    onHoverVertex?: (vertexIndex: number | null) => void;
}

export function RouteMap({
    vertices,
    legs,
    activeLegIndex,
    onSelectLeg,
    onRequestSplitAtVertex,
    osMapsApiKey,
    hoveredVertexIndex,
    onHoverVertex,
}: RouteMapProps) {
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const mapInstanceRef = useRef<L.Map | null>(null);
    const routeLayerGroupRef = useRef<L.LayerGroup | null>(null);
    const hoverMarkerRef = useRef<L.CircleMarker | null>(null);
    const loadedRouteSigRef = useRef<string>('');
    const prevActiveLegIndexRef = useRef<number | null>(null);
    const [mapReady, setMapReady] = useState(0);

    const [baseLayer, setBaseLayer] = useState<'opentopo' | 'cyclosm' | 'esri' | 'osm' | 'os'>('opentopo');
    const [isExpanded, setIsExpanded] = useState(false);

    const isBng = baseLayer === 'os' && Boolean(osMapsApiKey);

    // Initialize Leaflet Map whenever the projection (isBng) changes or mounts
    useEffect(() => {
        if (!mapContainerRef.current) return;

        // Determine CRS and zoom constraints
        const crs = isBng ? getBngCrs() : L.CRS.EPSG3857;
        const minZoom = isBng ? 0 : 2;
        const maxZoom = isBng ? 12 : 19;
        const zoomSnap = isBng ? 0.5 : 0.25;

        // Default initial center & zoom
        let center: L.LatLngExpression = [54.5, -3.2];
        let zoom = isBng ? 7 : 7;

        if (vertices.length > 0) {
            center = [vertices[0].lat, vertices[0].lon];
        }

        const map = L.map(mapContainerRef.current, {
            center,
            zoom,
            crs,
            minZoom,
            maxZoom,
            zoomControl: false,
            zoomSnap,
            zoomDelta: 0.5,
        });

        // Add custom zoom control top-right
        L.control.zoom({ position: 'topright' }).addTo(map);

        routeLayerGroupRef.current = L.layerGroup().addTo(map);
        mapInstanceRef.current = map;
        setMapReady((c) => c + 1);

        // If route has vertices, fit route to view
        if (vertices.length >= 2) {
            const allCoords: [number, number][] = vertices.map((v) => [v.lat, v.lon]);
            map.fitBounds(allCoords, {
                padding: [15, 15],
                maxZoom: isBng ? 9 : 16,
            });
        }

        return () => {
            try {
                map.remove();
            } catch {
                // Ignore teardown errors
            }
            mapInstanceRef.current = null;
            routeLayerGroupRef.current = null;
            hoverMarkerRef.current = null;
        };
    }, [isBng]);

    // Switch Base Map Tile Layer
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map) return;

        // Remove existing tile layers
        map.eachLayer((layer) => {
            if (layer instanceof L.TileLayer) {
                map.removeLayer(layer);
            }
        });

        let tileUrl = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
        let minZoom = 0;
        let maxZoom = 17;
        let attribution = '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (&copy; <a href="https://openstreetmap.org">OSM</a>)';
        let subdomains: string | string[] = ['a', 'b', 'c'];

        if (baseLayer === 'os' && osMapsApiKey) {
            tileUrl = `https://api.os.uk/maps/raster/v1/zxy/Leisure_27700/{z}/{x}/{y}.png?key=${osMapsApiKey}`;
            minZoom = 0;
            maxZoom = 12;
            attribution = 'Contains OS data &copy; Crown copyright and database right';
            subdomains = [];
        } else if (baseLayer === 'cyclosm') {
            tileUrl = 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png';
            minZoom = 0;
            maxZoom = 20;
            attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors. Tiles courtesy of <a href="https://www.cyclosm.org">CyclOSM</a>';
            subdomains = ['a', 'b', 'c'];
        } else if (baseLayer === 'esri') {
            tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}';
            minZoom = 0;
            maxZoom = 19;
            attribution = 'Tiles &copy; Esri &mdash; Esri, DeLorme, USGS, NPS, Ordnance Survey';
            subdomains = [];
        } else if (baseLayer === 'osm') {
            tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
            minZoom = 0;
            maxZoom = 19;
            attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
            subdomains = [];
        }

        const tileLayer = L.tileLayer(tileUrl, {
            minZoom,
            maxNativeZoom: baseLayer === 'os' ? 9 : undefined,
            maxZoom,
            attribution,
            subdomains,
        });

        tileLayer.addTo(map);
    }, [mapReady, baseLayer, osMapsApiKey]);

    // Redraw Polylines & Markers when legs or vertices change
    useEffect(() => {
        const map = mapInstanceRef.current;
        const group = routeLayerGroupRef.current;
        if (!map || !group || vertices.length < 2) return;

        group.clearLayers();

        // 1. Draw Background Inactive Legs
        legs.forEach((leg, idx) => {
            const isActive = idx === activeLegIndex;
            const legPts: [number, number][] = [];

            for (let v = leg.start_vertex_index; v <= leg.end_vertex_index; v++) {
                if (vertices[v]) {
                    legPts.push([vertices[v].lat, vertices[v].lon]);
                }
            }

            if (legPts.length < 2) return;

            // Inactive polyline
            if (!isActive) {
                // Wide transparent buffer line (22px) so users can easily click near the leg to select it
                const hitBuffer = L.polyline(legPts, {
                    weight: 22,
                    opacity: 0.001,
                    lineCap: 'round',
                    lineJoin: 'round',
                });
                hitBuffer.on('click', () => onSelectLeg(idx));
                group.addLayer(hitBuffer);

                // High-contrast white casing underlay so dashes pop vividly over grey contour and terrain shading
                const casingLine = L.polyline(legPts, {
                    color: '#ffffff',
                    weight: 6,
                    opacity: 0.9,
                    lineCap: 'round',
                    lineJoin: 'round',
                    interactive: false,
                });
                group.addLayer(casingLine);

                const inactiveLine = L.polyline(legPts, {
                    color: '#7c3aed',
                    weight: 4,
                    opacity: 1.0,
                    dashArray: '6, 6',
                });

                inactiveLine.on('click', () => onSelectLeg(idx));
                group.addLayer(inactiveLine);
            }
        });

        // 2. Draw Active Leg in High Contrast
        const activeLeg = legs[activeLegIndex];
        if (activeLeg) {
            const activePts: [number, number][] = [];
            for (let v = activeLeg.start_vertex_index; v <= activeLeg.end_vertex_index; v++) {
                if (vertices[v]) {
                    activePts.push([vertices[v].lat, vertices[v].lon]);
                }
            }

            if (activePts.length >= 2) {
                // Glow outer line (non-interactive so it doesn't intercept clicks)
                const glowLine = L.polyline(activePts, {
                    color: '#60a5fa',
                    weight: 8,
                    opacity: 0.5,
                    interactive: false,
                });
                group.addLayer(glowLine);

                // Main vibrant inner line
                const activeLine = L.polyline(activePts, {
                    color: '#2563eb',
                    weight: 5,
                    opacity: 1.0,
                });

                // Hover mousemove along active line to report hover vertex
                if (onHoverVertex) {
                    activeLine.on('mousemove', (e) => {
                        const clickLatLng = e.latlng;
                        let closestIdx = activeLeg.start_vertex_index;
                        let minD = Infinity;

                        for (let v = activeLeg.start_vertex_index; v <= activeLeg.end_vertex_index; v++) {
                            if (!vertices[v]) continue;
                            const d = clickLatLng.distanceTo([vertices[v].lat, vertices[v].lon]);
                            if (d < minD) {
                                minD = d;
                                closestIdx = v;
                            }
                        }
                        onHoverVertex(closestIdx);
                    });

                    activeLine.on('mouseout', () => {
                        onHoverVertex(null);
                    });
                }

                // Click on line to trigger split
                if (onRequestSplitAtVertex) {
                    activeLine.on('click', (e) => {
                        // Find closest vertex to click coordinate
                        const clickLatLng = e.latlng;
                        let closestIdx = activeLeg.start_vertex_index + 1;
                        let minD = Infinity;

                        for (let v = activeLeg.start_vertex_index + 1; v < activeLeg.end_vertex_index; v++) {
                            const d = clickLatLng.distanceTo([vertices[v].lat, vertices[v].lon]);
                            if (d < minD) {
                                minD = d;
                                closestIdx = v;
                            }
                        }

                        onRequestSplitAtVertex(closestIdx);
                    });
                }

                group.addLayer(activeLine);
            }
        }

        // 3. Draw Checkpoint Pins
        legs.forEach((leg, idx) => {
            const vStart = vertices[leg.start_vertex_index];
            if (!vStart) return;

            const isStart = idx === 0;
            const badgeText = isStart ? 'S' : `${idx}`;
            const badgeBg = isStart ? '#10b981' : '#3b82f6';

            const icon = L.divIcon({
                className: 'ems-map-marker',
                html: `<div class="ems-marker-pin" style="background:${badgeBg};">${badgeText}</div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 14],
            });

            const marker = L.marker([vStart.lat, vStart.lon], { icon });
            marker.on('click', () => onSelectLeg(idx));
            marker.bindTooltip(`<b>${leg.start_name}</b><br/>${vStart.grid_ref_6} (${vStart.ele_dem}m)`, {
                direction: 'top',
                offset: [0, -10],
            });

            group.addLayer(marker);

            // If it's the final leg, draw the Finish pin too
            if (idx === legs.length - 1) {
                const vEnd = vertices[leg.end_vertex_index];
                if (vEnd) {
                    const finishIcon = L.divIcon({
                        className: 'ems-map-marker',
                        html: `<div class="ems-marker-pin ems-marker-pin--finish">F</div>`,
                        iconSize: [28, 28],
                        iconAnchor: [14, 14],
                    });
                    const finishMarker = L.marker([vEnd.lat, vEnd.lon], { icon: finishIcon });
                    finishMarker.bindTooltip(`<b>${leg.end_name} (Finish)</b><br/>${vEnd.grid_ref_6} (${vEnd.ele_dem}m)`, {
                        direction: 'top',
                        offset: [0, -10],
                    });
                    group.addLayer(finishMarker);
                }
            }
        });
    }, [mapReady, vertices, legs, activeLegIndex, onRequestSplitAtVertex, onSelectLeg, onHoverVertex]);

    // Fit entire route bounds on new route import or day switch
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map || vertices.length < 2) {
            if (vertices.length === 0) {
                loadedRouteSigRef.current = '';
            }
            return;
        }

        // Generate a signature for the route (start coord + end coord + approximate vertex count)
        const vStart = vertices[0];
        const vEnd = vertices[vertices.length - 1];
        const sig = `${vertices.length}-${vStart.lat.toFixed(4)},${vStart.lon.toFixed(4)}-${vEnd.lat.toFixed(4)},${vEnd.lon.toFixed(4)}`;

        if (loadedRouteSigRef.current !== sig) {
            loadedRouteSigRef.current = sig;
            // Prevent active leg effect from immediately overwriting whole route view on import
            prevActiveLegIndexRef.current = activeLegIndex;

            const allCoords: [number, number][] = vertices.map((v) => [v.lat, v.lon]);
            map.fitBounds(allCoords, {
                padding: [15, 15],
                maxZoom: isBng ? 9 : 16,
            });
        }
    }, [mapReady, vertices, activeLegIndex, isBng]);

    // Pan / Zoom smoothly when active leg changes via user selection
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map || vertices.length === 0 || !legs[activeLegIndex]) return;

        // Only zoom if the user actually switched legs (not on import or split)
        if (prevActiveLegIndexRef.current !== null && prevActiveLegIndexRef.current !== activeLegIndex) {
            const leg = legs[activeLegIndex];
            const legCoords: [number, number][] = [];
            for (let v = leg.start_vertex_index; v <= leg.end_vertex_index; v++) {
                if (vertices[v]) {
                    legCoords.push([vertices[v].lat, vertices[v].lon]);
                }
            }

            if (legCoords.length >= 2) {
                map.fitBounds(legCoords, {
                    padding: [45, 45],
                    maxZoom: isBng ? 10 : 15,
                    animate: true,
                    duration: 0.5,
                });
            }
        }
        prevActiveLegIndexRef.current = activeLegIndex;
    }, [mapReady, activeLegIndex, legs, vertices, isBng]);

    // Update hover crosshair cursor along the route
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map) return;

        if (hoveredVertexIndex !== null && hoveredVertexIndex !== undefined && vertices[hoveredVertexIndex]) {
            const v = vertices[hoveredVertexIndex];
            if (!hoverMarkerRef.current) {
                hoverMarkerRef.current = L.circleMarker([v.lat, v.lon], {
                    radius: 7,
                    color: '#ffffff',
                    weight: 2,
                    fillColor: '#ef4444',
                    fillOpacity: 0.9,
                }).addTo(map);
            } else {
                hoverMarkerRef.current.setLatLng([v.lat, v.lon]);
            }
        } else if (hoverMarkerRef.current) {
            map.removeLayer(hoverMarkerRef.current);
            hoverMarkerRef.current = null;
        }
    }, [mapReady, hoveredVertexIndex, vertices]);

    const fitEntireRoute = () => {
        const map = mapInstanceRef.current;
        if (!map || vertices.length < 2) return;
        const allCoords: [number, number][] = vertices.map((v) => [v.lat, v.lon]);
        map.fitBounds(allCoords, {
            padding: [15, 15],
            maxZoom: isBng ? 10 : 16,
            animate: true,
            duration: 0.5,
        });
    };

    return (
        <div className={`ems-route-map-wrapper ${isExpanded ? 'ems-route-map-wrapper--expanded' : ''}`}>
            {/* Map Top Bar Controls */}
            <div className="ems-route-map__toolbar">
                <div className="ems-route-map__layer-select" role="group" aria-label="Map Tile Layer">
                    <button
                        type="button"
                        className={`ems-map-btn ${baseLayer === 'opentopo' ? 'ems-map-btn--active' : ''}`}
                        onClick={() => setBaseLayer('opentopo')}
                        title="Topographic Contours (OpenTopoMap)"
                    >
                        OpenTopo
                    </button>
                    <button
                        type="button"
                        className={`ems-map-btn ${baseLayer === 'cyclosm' ? 'ems-map-btn--active' : ''}`}
                        onClick={() => setBaseLayer('cyclosm')}
                        title="Outdoor Topo with Contours & Trails (CyclOSM)"
                    >
                        CyclOSM Topo
                    </button>
                    <button
                        type="button"
                        className={`ems-map-btn ${baseLayer === 'esri' ? 'ems-map-btn--active' : ''}`}
                        onClick={() => setBaseLayer('esri')}
                        title="ESRI World Topo with Shaded Relief & Contours"
                    >
                        ESRI Topo
                    </button>
                    <button
                        type="button"
                        className={`ems-map-btn ${baseLayer === 'osm' ? 'ems-map-btn--active' : ''}`}
                        onClick={() => setBaseLayer('osm')}
                        title="Standard OpenStreetMap"
                    >
                        Street
                    </button>
                    {osMapsApiKey && (
                        <button
                            type="button"
                            className={`ems-map-btn ${baseLayer === 'os' ? 'ems-map-btn--active' : ''}`}
                            onClick={() => setBaseLayer('os')}
                            title="Official Ordnance Survey 1:25k Explorer / 1:50k Landranger"
                        >
                            OS Leisure
                        </button>
                    )}
                </div>

                <div className="ems-route-map__actions">
                    <button
                        type="button"
                        className="ems-map-action-btn"
                        onClick={fitEntireRoute}
                        title="Zoom to Entire Expedition Route"
                    >
                        <FontAwesomeIcon icon={faLocationCrosshairs} /> Fit All
                    </button>

                    <button
                        type="button"
                        className="ems-map-action-btn"
                        onClick={() => {
                            setIsExpanded(!isExpanded);
                            setTimeout(() => mapInstanceRef.current?.invalidateSize(), 200);
                        }}
                        title={isExpanded ? 'Collapse Map' : 'Expand Map on Mobile'}
                    >
                        <FontAwesomeIcon icon={isExpanded ? faCompress : faExpand} />
                        <span className="ems-hide-sm">{isExpanded ? 'Collapse' : 'Expand'}</span>
                    </button>
                </div>
            </div>

            {/* Map Div */}
            <div
                key={isBng ? 'bng-map' : 'mercator-map'}
                ref={mapContainerRef}
                className="ems-route-map-canvas"
            />
        </div>
    );
}
