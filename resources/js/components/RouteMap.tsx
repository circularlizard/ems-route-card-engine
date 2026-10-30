import { useEffect, useRef, useState } from 'react';
import * as L from 'leaflet';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faLayerGroup,
    faExpand,
    faCompress,
    faLocationCrosshairs,
} from '@fortawesome/free-solid-svg-icons';
import { RouteLeg, RouteVertex } from '../types/route-card';

interface RouteMapProps {
    vertices: RouteVertex[];
    legs: RouteLeg[];
    activeLegIndex: number;
    onSelectLeg: (legIndex: number) => void;
    onRequestSplitAtVertex?: (vertexIndex: number) => void;
    osMapsApiKey?: string;
    hoveredVertexIndex?: number | null;
}

export function RouteMap({
    vertices,
    legs,
    activeLegIndex,
    onSelectLeg,
    onRequestSplitAtVertex,
    osMapsApiKey,
    hoveredVertexIndex,
}: RouteMapProps) {
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const mapInstanceRef = useRef<L.Map | null>(null);
    const routeLayerGroupRef = useRef<L.LayerGroup | null>(null);
    const hoverMarkerRef = useRef<L.CircleMarker | null>(null);

    const [baseLayer, setBaseLayer] = useState<'topo' | 'osm' | 'os'>('topo');
    const [isExpanded, setIsExpanded] = useState(false);

    // Initialize Leaflet Map
    useEffect(() => {
        if (!mapContainerRef.current || mapInstanceRef.current) return;

        // Default center: UK center
        const map = L.map(mapContainerRef.current, {
            center: [56.4907, -4.2026],
            zoom: 7,
            zoomControl: false,
        });

        // Add custom zoom control top-right
        L.control.zoom({ position: 'topright' }).addTo(map);

        mapInstanceRef.current = map;
        routeLayerGroupRef.current = L.layerGroup().addTo(map);

        return () => {
            map.remove();
            mapInstanceRef.current = null;
        };
    }, []);

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
        let maxZoom = 17;
        let attribution = '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (&copy; <a href="https://openstreetmap.org">OSM</a>)';

        if (baseLayer === 'os' && osMapsApiKey) {
            tileUrl = `https://api.os.uk/maps/raster/v1/zxy/Outdoor_3857/{z}/{x}/{y}.png?key=${osMapsApiKey}`;
            maxZoom = 18;
            attribution = 'Contains OS data &copy; Crown copyright and database right';
        } else if (baseLayer === 'osm') {
            tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
            maxZoom = 19;
            attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
        }

        const tileLayer = L.tileLayer(tileUrl, {
            maxZoom,
            attribution,
            subdomains: baseLayer === 'topo' ? 'abc' : [],
        });

        tileLayer.addTo(map);
    }, [baseLayer, osMapsApiKey]);

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
                const inactiveLine = L.polyline(legPts, {
                    color: '#64748b',
                    weight: 4,
                    opacity: 0.7,
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
                // Glow outer line
                const glowLine = L.polyline(activePts, {
                    color: '#60a5fa',
                    weight: 8,
                    opacity: 0.5,
                });
                group.addLayer(glowLine);

                // Main vibrant inner line
                const activeLine = L.polyline(activePts, {
                    color: '#2563eb',
                    weight: 5,
                    opacity: 1.0,
                });

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

        // 4. Fit bounds on initial load
        if (activeLegIndex === 0 && legs.length > 0) {
            const allCoords: [number, number][] = vertices.map((v) => [v.lat, v.lon]);
            map.fitBounds(allCoords, { padding: [25, 25] });
        }
    }, [vertices, legs, activeLegIndex, onRequestSplitAtVertex, onSelectLeg]);

    // Pan / Zoom smoothly when active leg changes
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map || vertices.length === 0 || !legs[activeLegIndex]) return;

        const leg = legs[activeLegIndex];
        const legCoords: [number, number][] = [];
        for (let v = leg.start_vertex_index; v <= leg.end_vertex_index; v++) {
            if (vertices[v]) {
                legCoords.push([vertices[v].lat, vertices[v].lon]);
            }
        }

        if (legCoords.length >= 2) {
            map.fitBounds(legCoords, {
                padding: [40, 40],
                maxZoom: 15,
                animate: true,
                duration: 0.6,
            });
        }
    }, [activeLegIndex, legs, vertices]);

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
    }, [hoveredVertexIndex, vertices]);

    const fitEntireRoute = () => {
        if (!mapInstanceRef.current || vertices.length < 2) return;
        const allCoords: [number, number][] = vertices.map((v) => [v.lat, v.lon]);
        mapInstanceRef.current.fitBounds(allCoords, { padding: [30, 30] });
    };

    return (
        <div className={`ems-route-map-wrapper ${isExpanded ? 'ems-route-map-wrapper--expanded' : ''}`}>
            {/* Map Top Bar Controls */}
            <div className="ems-route-map__toolbar">
                <div className="ems-route-map__layer-select">
                    <FontAwesomeIcon icon={faLayerGroup} className="ems-map-btn-icon" />
                    <button
                        type="button"
                        className={`ems-map-btn ${baseLayer === 'topo' ? 'ems-map-btn--active' : ''}`}
                        onClick={() => setBaseLayer('topo')}
                        title="Topographic Contours (OpenTopoMap)"
                    >
                        Topo Contours
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
                            title="Official Ordnance Survey 1:25k/1:50k"
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
            <div ref={mapContainerRef} className="ems-route-map-canvas" />
        </div>
    );
}
