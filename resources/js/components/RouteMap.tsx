import { useCallback, useEffect, useRef, useState } from 'react';
import * as L from 'leaflet';
import proj4 from 'proj4';
import proj4leaflet from 'proj4leaflet';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faExpand,
    faCompress,
    faLocationCrosshairs,
    faPlus,
    faMinus,
    faLayerGroup,
    faCheck,
} from '@fortawesome/free-solid-svg-icons';
import { RouteLeg, RouteVertex } from '../types/route-card';
import { findNearestTrackPointIndex } from '../utils/route-calculations';

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

type BaseLayerId = 'opentopo' | 'os' | 'cyclosm' | 'osm' | 'esri';

interface BaseLayerDef {
    id: BaseLayerId;
    label: string;
    title: string;
    requiresKey?: boolean;
}

const BASE_LAYERS: BaseLayerDef[] = [
    { id: 'opentopo', label: 'OpenTopo', title: 'Topographic Contours (OpenTopoMap)' },
    { id: 'os', label: 'OS Leisure', title: 'Official Ordnance Survey 1:25k / 1:50k', requiresKey: true },
    { id: 'cyclosm', label: 'CyclOSM', title: 'Outdoor Topo with Contours & Trails (CyclOSM)' },
    { id: 'osm', label: 'Street', title: 'Standard OpenStreetMap' },
    { id: 'esri', label: 'ESRI', title: 'ESRI World Topo with Shaded Relief & Contours' },
];

interface RouteMapProps {
    vertices: RouteVertex[];
    legs: RouteLeg[];
    activeLegIndex: number;
    onSelectLeg: (legIndex: number) => void;
    onRequestSplitAtVertex?: (vertexIndex: number) => void;
    onMoveCheckpoint?: (checkpointIdx: number, newVertexIdx: number) => void;
    onDeleteCheckpoint?: (checkpointIdx: number) => void;
    ghostSplitVertexIndex?: number | null;
    onGhostHoverVertex?: (vertexIdx: number | null) => void;
    draggingCheckpoint?: { checkpointIndex: number; vertexIndex: number } | null;
    onDragCheckpointChange?: (dragging: { checkpointIndex: number; vertexIndex: number } | null) => void;
    osMapsApiKey?: string;
    hoveredVertexIndex?: number | null;
    onHoverVertex?: (vertexIndex: number | null) => void;
    hoveredLegIndex?: number | null;
    isFocusMode?: boolean;
    onToggleFocusMode?: (focused: boolean) => void;
}

export function RouteMap({
    vertices,
    legs,
    activeLegIndex,
    onSelectLeg,
    onRequestSplitAtVertex,
    onMoveCheckpoint,
    onDeleteCheckpoint,
    ghostSplitVertexIndex,
    onGhostHoverVertex,
    draggingCheckpoint,
    onDragCheckpointChange,
    osMapsApiKey,
    hoveredVertexIndex,
    onHoverVertex,
    hoveredLegIndex,
    isFocusMode: isFocusModeProp,
    onToggleFocusMode,
}: RouteMapProps) {
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const mapInstanceRef = useRef<L.Map | null>(null);
    const routeLayerGroupRef = useRef<L.LayerGroup | null>(null);
    const hoverMarkerRef = useRef<L.CircleMarker | null>(null);
    const ghostMarkerRef = useRef<L.Marker | null>(null);
    const checkpointMarkersRef = useRef<Map<number, L.Marker>>(new Map());
    const isDraggingRef = useRef(false);
    const currentSnappedVertexRef = useRef<number | null>(null);
    const loadedRouteSigRef = useRef<string>('');
    const prevActiveLegIndexRef = useRef<number | null>(null);
    const [mapReady, setMapReady] = useState(0);

    // Floating UI controls refs and state
    const layerControlRef = useRef<HTMLDivElement | null>(null);
    const actionDockRef = useRef<HTMLDivElement | null>(null);
    const layerMenuCloseTimerRef = useRef<number | null>(null);
    const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(false);

    // Left-column Focus Mode state (managed internally or via parent prop)
    const [internalFocusMode, setInternalFocusMode] = useState(false);
    const isFocusMode = isFocusModeProp !== undefined ? isFocusModeProp : internalFocusMode;

    const toggleFocusMode = useCallback(() => {
        const next = !isFocusMode;
        if (onToggleFocusMode) {
            onToggleFocusMode(next);
        } else {
            setInternalFocusMode(next);
        }
    }, [isFocusMode, onToggleFocusMode]);

    // Keep callback props updated in a ref so layer effects never destroy layers on parent re-renders
    const callbacksRef = useRef({
        onSelectLeg,
        onRequestSplitAtVertex,
        onMoveCheckpoint,
        onDeleteCheckpoint,
        onHoverVertex,
        onGhostHoverVertex,
        onDragCheckpointChange,
    });
    useEffect(() => {
        callbacksRef.current = {
            onSelectLeg,
            onRequestSplitAtVertex,
            onMoveCheckpoint,
            onDeleteCheckpoint,
            onHoverVertex,
            onGhostHoverVertex,
            onDragCheckpointChange,
        };
    });

    const [baseLayer, setBaseLayer] = useState<BaseLayerId>('opentopo');

    const isBng = baseLayer === 'os' && Boolean(osMapsApiKey);

    // Esc key: closes layer flyout first if open; otherwise exits focus mode
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (isLayerMenuOpen) {
                    setIsLayerMenuOpen(false);
                    e.stopPropagation();
                    return;
                }
                if (isFocusMode) {
                    if (onToggleFocusMode) {
                        onToggleFocusMode(false);
                    } else {
                        setInternalFocusMode(false);
                    }
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isLayerMenuOpen, isFocusMode, onToggleFocusMode]);

    // Crucial Leaflet Fix: Invalidate map size whenever focus mode toggles so tiles & routes render cleanly
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map) return;
        map.invalidateSize();
        const t1 = window.setTimeout(() => map.invalidateSize(), 150);
        const t2 = window.setTimeout(() => map.invalidateSize(), 350);
        return () => {
            window.clearTimeout(t1);
            window.clearTimeout(t2);
        };
    }, [isFocusMode]);

    // Dismiss layer menu on click outside
    useEffect(() => {
        if (!isLayerMenuOpen) return;
        const handleClickOutside = (e: MouseEvent | TouchEvent) => {
            if (layerControlRef.current && !layerControlRef.current.contains(e.target as Node)) {
                setIsLayerMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [isLayerMenuOpen]);

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
        if (isDraggingRef.current) return;

        // Clean up any dangling ghost marker reference from prior leg
        if (ghostMarkerRef.current) {
            try {
                group.removeLayer(ghostMarkerRef.current);
            } catch (e) {}
            ghostMarkerRef.current = null;
        }
        currentSnappedVertexRef.current = null;

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
                const isHovered = hoveredLegIndex !== undefined && hoveredLegIndex !== null && idx === hoveredLegIndex;

                const handleInactiveClick = (e: L.LeafletMouseEvent) => {
                    if (e.originalEvent) {
                        L.DomEvent.preventDefault(e.originalEvent);
                        L.DomEvent.stopPropagation(e.originalEvent);
                    }
                    callbacksRef.current.onSelectLeg(idx);
                };

                // Wide transparent buffer line (24px) so users can easily click near the leg to select it
                const hitBuffer = L.polyline(legPts, {
                    weight: 24,
                    opacity: 0.001,
                    lineCap: 'round',
                    lineJoin: 'round',
                });
                hitBuffer.on('click', handleInactiveClick);
                group.addLayer(hitBuffer);

                // High-contrast white casing underlay so dashes pop vividly over grey contour and terrain shading
                const casingLine = L.polyline(legPts, {
                    color: '#ffffff',
                    weight: isHovered ? 8 : 6,
                    opacity: 0.9,
                    lineCap: 'round',
                    lineJoin: 'round',
                    interactive: false,
                });
                group.addLayer(casingLine);

                const inactiveLine = L.polyline(legPts, {
                    color: isHovered ? '#9333ea' : '#7c3aed',
                    weight: isHovered ? 6 : 4,
                    opacity: 1.0,
                    dashArray: isHovered ? '4, 4' : '6, 6',
                });

                inactiveLine.on('click', handleInactiveClick);
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

                const ghostIcon = L.divIcon({
                    className: 'ems-ghost-bead-wrapper',
                    html: `<div class="ems-ghost-bead"><span class="ems-ghost-plus">+</span></div>`,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12],
                });

                const handleActiveLineMouseMove = (e: L.LeafletMouseEvent) => {
                    if (!activeLeg || vertices.length < 2 || isDraggingRef.current) return;

                    // Disable passive hover Ghost Bead on touch devices
                    if (typeof window !== 'undefined' && window.matchMedia && !window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
                        return;
                    }

                    const snapped = findNearestTrackPointIndex(
                        vertices,
                        e.latlng,
                        activeLeg.start_vertex_index,
                        activeLeg.end_vertex_index,
                        5,
                        100
                    );
                    if (snapped !== null && vertices[snapped]) {
                        const v = vertices[snapped];
                        const vStart = vertices[activeLeg.start_vertex_index];
                        const vEnd = vertices[activeLeg.end_vertex_index];
                        const d1 = (v.dist_from_start_m - vStart.dist_from_start_m) / 1000;
                        const d2 = (vEnd.dist_from_start_m - v.dist_from_start_m) / 1000;

                        // Strict minimum distance guard: minimum 0.15km from both start and end checkpoints
                        if (d1 < 0.15 || d2 < 0.15) {
                            if (ghostMarkerRef.current) {
                                group.removeLayer(ghostMarkerRef.current);
                                ghostMarkerRef.current = null;
                            }
                            currentSnappedVertexRef.current = null;
                            callbacksRef.current.onGhostHoverVertex?.(null);
                            return;
                        }

                        currentSnappedVertexRef.current = snapped;
                        const dist1 = d1.toFixed(2);
                        const dist2 = d2.toFixed(2);
                        const tooltipHtml = `<b>+ Click to split leg</b> • ${dist1} km | ${dist2} km<br/><span style="color:#64748b">${v.grid_ref_6} · ${Math.round(v.ele_dem)}m</span>`;

                        if (!ghostMarkerRef.current) {
                            const gm = L.marker([v.lat, v.lon], {
                                icon: ghostIcon,
                                zIndexOffset: 1200,
                                interactive: false, // pointer-events: none ensures underlying polyline gets all clicks!
                            });
                            gm.bindTooltip(tooltipHtml, {
                                permanent: true,
                                direction: 'top',
                                offset: [0, -12],
                                className: 'ems-ghost-tooltip',
                                interactive: false,
                            });
                            gm.addTo(group);
                            ghostMarkerRef.current = gm;
                        } else {
                            ghostMarkerRef.current.setLatLng([v.lat, v.lon]);
                            ghostMarkerRef.current.setTooltipContent(tooltipHtml);
                        }
                        // Hide any red hover marker because the Ghost Bead is the active cursor
                        if (hoverMarkerRef.current) {
                            map.removeLayer(hoverMarkerRef.current);
                            hoverMarkerRef.current = null;
                        }
                        callbacksRef.current.onGhostHoverVertex?.(snapped);
                    }
                };

                const handleActiveLineMouseOut = () => {
                    if (isDraggingRef.current) return;
                    if (ghostMarkerRef.current) {
                        group.removeLayer(ghostMarkerRef.current);
                        ghostMarkerRef.current = null;
                    }
                    currentSnappedVertexRef.current = null;
                    callbacksRef.current.onGhostHoverVertex?.(null);
                };

                const handleActiveLineClick = (e: L.LeafletMouseEvent) => {
                    if (e.originalEvent) {
                        L.DomEvent.preventDefault(e.originalEvent);
                        L.DomEvent.stopPropagation(e.originalEvent);
                    }
                    if (!activeLeg || vertices.length < 2) return;
                    const targetIdx = currentSnappedVertexRef.current ?? findNearestTrackPointIndex(
                        vertices,
                        e.latlng,
                        activeLeg.start_vertex_index,
                        activeLeg.end_vertex_index,
                        5,
                        100
                    );
                    if (targetIdx !== null && vertices[targetIdx]) {
                        const v = vertices[targetIdx];
                        const vStart = vertices[activeLeg.start_vertex_index];
                        const vEnd = vertices[activeLeg.end_vertex_index];
                        if (vStart && vEnd) {
                            const d1 = (v.dist_from_start_m - vStart.dist_from_start_m) / 1000;
                            const d2 = (vEnd.dist_from_start_m - v.dist_from_start_m) / 1000;
                            if (d1 < 0.15 || d2 < 0.15) {
                                return;
                            }
                        }

                        if (ghostMarkerRef.current) {
                            group.removeLayer(ghostMarkerRef.current);
                            ghostMarkerRef.current = null;
                        }
                        currentSnappedVertexRef.current = null;
                        callbacksRef.current.onRequestSplitAtVertex?.(targetIdx);
                    }
                };

                // Generous 42px hit-buffer line making splitting effortless
                const activeHitBuffer = L.polyline(activePts, {
                    weight: 42,
                    opacity: 0.001,
                    lineCap: 'round',
                    lineJoin: 'round',
                    className: 'ems-active-leg-hit-buffer',
                });
                activeHitBuffer.on('mousemove', handleActiveLineMouseMove);
                activeHitBuffer.on('mouseout', handleActiveLineMouseOut);
                activeHitBuffer.on('click', handleActiveLineClick);
                group.addLayer(activeHitBuffer);

                activeLine.on('mousemove', handleActiveLineMouseMove);
                activeLine.on('mouseout', handleActiveLineMouseOut);
                activeLine.on('click', handleActiveLineClick);
                group.addLayer(activeLine);
            }
        }

        // 3. Draw Checkpoint Pins
        checkpointMarkersRef.current.clear();
        legs.forEach((leg, idx) => {
            const vStart = vertices[leg.start_vertex_index];
            if (!vStart) return;

            const isStart = idx === 0;
            const badgeText = isStart ? 'S' : `${idx}`;
            const isIntermediate = !isStart;
            const isBoundingActive = idx === activeLegIndex || idx === activeLegIndex + 1;

            let pinClass = 'ems-marker-pin';
            let badgeBg = '#64748b';

            if (isStart) {
                badgeBg = '#10b981';
                if (activeLegIndex === 0) {
                    pinClass += ' ems-marker-pin--start-active';
                }
            } else if (isBoundingActive) {
                badgeBg = '#2563eb';
                pinClass += ' ems-marker-pin--active ems-marker-pin--intermediate';
            } else {
                badgeBg = '#64748b';
                pinClass += ' ems-marker-pin--inactive ems-marker-pin--intermediate';
            }

            const icon = L.divIcon({
                className: 'ems-map-marker',
                html: `<div class="${pinClass}" style="background:${badgeBg};">${badgeText}</div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 14],
            });

            const marker = L.marker([vStart.lat, vStart.lon], {
                icon,
                draggable: isIntermediate,
                zIndexOffset: isIntermediate ? (isBoundingActive ? 750 : 500) : (activeLegIndex === 0 ? 750 : 600),
            });
            checkpointMarkersRef.current.set(idx, marker);

            const normalTooltip = `<b>${leg.start_name}</b><br/>${vStart.grid_ref_6} (${vStart.ele_dem}m)`;
            marker.bindTooltip(normalTooltip, {
                direction: 'top',
                offset: [0, -10],
            });

            if (isIntermediate) {
                marker.on('dragstart', () => {
                    isDraggingRef.current = true;
                    map.dragging.disable();
                    map.getContainer().classList.add('ems-dragging-map');
                    marker.openTooltip();
                });

                marker.on('drag', () => {
                    const minIdx = legs[idx - 1].start_vertex_index;
                    const maxIdx = legs[idx].end_vertex_index;
                    const snapped = findNearestTrackPointIndex(vertices, marker.getLatLng(), minIdx, maxIdx, 5, 100);
                    if (snapped !== null && vertices[snapped]) {
                        const v = vertices[snapped];
                        marker.setLatLng([v.lat, v.lon]);
                        const dist1 = ((v.dist_from_start_m - vertices[minIdx].dist_from_start_m) / 1000).toFixed(2);
                        const dist2 = ((vertices[maxIdx].dist_from_start_m - v.dist_from_start_m) / 1000).toFixed(2);
                        const liveTooltip = `<b>${v.grid_ref_6} · ${Math.round(v.ele_dem)}m</b><br/>Leg ${idx}: ${dist1} km • Leg ${idx + 1}: ${dist2} km`;
                        marker.setTooltipContent(liveTooltip);
                        callbacksRef.current.onDragCheckpointChange?.({ checkpointIndex: idx, vertexIndex: snapped });
                    }
                });

                marker.on('dragend', () => {
                    map.dragging.enable();
                    map.getContainer().classList.remove('ems-dragging-map');
                    const minIdx = legs[idx - 1].start_vertex_index;
                    const maxIdx = legs[idx].end_vertex_index;
                    const finalSnapped = findNearestTrackPointIndex(vertices, marker.getLatLng(), minIdx, maxIdx, 5, 100);
                    setTimeout(() => {
                        isDraggingRef.current = false;
                        callbacksRef.current.onDragCheckpointChange?.(null);
                    }, 60);

                    if (finalSnapped !== null && finalSnapped !== leg.start_vertex_index) {
                        callbacksRef.current.onMoveCheckpoint?.(idx, finalSnapped);
                    } else {
                        marker.setLatLng([vStart.lat, vStart.lon]);
                        marker.setTooltipContent(normalTooltip);
                    }
                });

                marker.on('contextmenu', (e) => {
                    if (e.originalEvent) {
                        L.DomEvent.preventDefault(e.originalEvent);
                        L.DomEvent.stopPropagation(e.originalEvent);
                    }
                    callbacksRef.current.onDeleteCheckpoint?.(idx);
                });

                marker.on('click', (e) => {
                    if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
                    if ((e.originalEvent as MouseEvent)?.altKey) {
                        callbacksRef.current.onDeleteCheckpoint?.(idx);
                    } else {
                        callbacksRef.current.onSelectLeg(idx);
                    }
                });
            } else {
                // Start marker
                marker.on('click', (e) => {
                    if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
                    callbacksRef.current.onSelectLeg(0);
                });
            }

            group.addLayer(marker);

            // If it's the final leg, draw the Finish pin too
            if (idx === legs.length - 1) {
                const vEnd = vertices[leg.end_vertex_index];
                if (vEnd) {
                    const isFinishActive = activeLegIndex === legs.length - 1;
                    const finishIcon = L.divIcon({
                        className: 'ems-map-marker',
                        html: `<div class="ems-marker-pin ems-marker-pin--finish ${isFinishActive ? 'ems-marker-pin--finish-active' : ''}">F</div>`,
                        iconSize: [28, 28],
                        iconAnchor: [14, 14],
                    });
                    const finishMarker = L.marker([vEnd.lat, vEnd.lon], {
                        icon: finishIcon,
                        draggable: false,
                        zIndexOffset: isFinishActive ? 750 : 600,
                    });
                    finishMarker.bindTooltip(`<b>${leg.end_name} (Finish)</b><br/>${vEnd.grid_ref_6} (${vEnd.ele_dem}m)`, {
                        direction: 'top',
                        offset: [0, -10],
                    });
                    finishMarker.on('click', (e) => {
                        if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
                        callbacksRef.current.onSelectLeg(idx);
                    });
                    group.addLayer(finishMarker);
                }
            }
        });
    }, [
        mapReady,
        vertices,
        legs,
        activeLegIndex,
        hoveredLegIndex,
    ]);

    // Sync external ghost hover from Elevation Profile
    useEffect(() => {
        const group = routeLayerGroupRef.current;
        const activeLeg = legs[activeLegIndex];
        if (!group || !activeLeg || vertices.length < 2) return;

        const ghostIcon = L.divIcon({
            className: 'ems-ghost-bead-wrapper',
            html: `<div class="ems-ghost-bead"><span class="ems-ghost-plus">+</span></div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
        });

        if (ghostSplitVertexIndex !== null && ghostSplitVertexIndex !== undefined && vertices[ghostSplitVertexIndex]) {
            const v = vertices[ghostSplitVertexIndex];
            const vStart = vertices[activeLeg.start_vertex_index];
            const vEnd = vertices[activeLeg.end_vertex_index];
            const dist1 = ((v.dist_from_start_m - vStart.dist_from_start_m) / 1000).toFixed(2);
            const dist2 = ((vEnd.dist_from_start_m - v.dist_from_start_m) / 1000).toFixed(2);
            const tooltipHtml = `<b>+ Click to split leg</b> • ${dist1} km | ${dist2} km<br/><span style="color:#64748b">${v.grid_ref_6} · ${Math.round(v.ele_dem)}m</span>`;

            if (!ghostMarkerRef.current) {
                const gm = L.marker([v.lat, v.lon], {
                    icon: ghostIcon,
                    zIndexOffset: 1200,
                    interactive: false,
                });
                gm.bindTooltip(tooltipHtml, {
                    permanent: true,
                    direction: 'top',
                    offset: [0, -12],
                    className: 'ems-ghost-tooltip',
                    interactive: false,
                });
                gm.addTo(group);
                ghostMarkerRef.current = gm;
            } else {
                ghostMarkerRef.current.setLatLng([v.lat, v.lon]);
                ghostMarkerRef.current.setTooltipContent(tooltipHtml);
            }
        } else if (ghostSplitVertexIndex === null && ghostMarkerRef.current) {
            group.removeLayer(ghostMarkerRef.current);
            ghostMarkerRef.current = null;
        }
    }, [ghostSplitVertexIndex, activeLegIndex, legs, vertices]);

    // Sync external checkpoint dragging from Elevation Profile
    useEffect(() => {
        if (!draggingCheckpoint || !vertices[draggingCheckpoint.vertexIndex] || isDraggingRef.current) return;
        const marker = checkpointMarkersRef.current.get(draggingCheckpoint.checkpointIndex);
        if (marker) {
            const v = vertices[draggingCheckpoint.vertexIndex];
            marker.setLatLng([v.lat, v.lon]);
        }
    }, [draggingCheckpoint, vertices]);

    // Fit entire route bounds on new route import or projection switch
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
            prevActiveLegIndexRef.current = activeLegIndex;

            try {
                const allCoords: [number, number][] = vertices.map((v) => [v.lat, v.lon]);
                map.fitBounds(allCoords, {
                    padding: [15, 15],
                    maxZoom: isBng ? 9 : 16,
                });
            } catch (e) {
                // Ignore bounds calculation errors
            }
        }
    }, [mapReady, vertices, isBng]);

    // Pan / Zoom smoothly when active leg changes via user selection
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map || vertices.length === 0 || !legs[activeLegIndex]) return;

        try {
            const size = map.getSize();
            if (size.x > 0 && size.y > 0 && prevActiveLegIndexRef.current !== null && prevActiveLegIndexRef.current !== activeLegIndex) {
                const leg = legs[activeLegIndex];
                const legCoords: [number, number][] = [];
                for (let v = leg.start_vertex_index; v <= leg.end_vertex_index; v++) {
                    if (vertices[v]) {
                        legCoords.push([vertices[v].lat, vertices[v].lon]);
                    }
                }

                if (legCoords.length >= 2) {
                    const activeBounds = L.latLngBounds(legCoords);
                    if (activeBounds.isValid()) {
                        const mapBounds = map.getBounds();
                        if (!mapBounds.intersects(activeBounds)) {
                            map.fitBounds(activeBounds, {
                                padding: [45, 45],
                                maxZoom: isBng ? 10 : 15,
                                animate: true,
                                duration: 0.4,
                            });
                        }
                    }
                }
            }
        } catch (e) {
            // Ignore animation collisions
        }
        prevActiveLegIndexRef.current = activeLegIndex;
    }, [mapReady, activeLegIndex, legs, vertices, isBng]);

    // Update hover crosshair cursor along the route
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map) return;

        const activeLeg = legs[activeLegIndex];
        const isHoverInActiveLeg =
            activeLeg &&
            hoveredVertexIndex !== null &&
            hoveredVertexIndex !== undefined &&
            hoveredVertexIndex >= activeLeg.start_vertex_index &&
            hoveredVertexIndex <= activeLeg.end_vertex_index;

        const hasGhostActive =
            ghostMarkerRef.current !== null ||
            (ghostSplitVertexIndex !== null && ghostSplitVertexIndex !== undefined);

        if (
            hoveredVertexIndex !== null &&
            hoveredVertexIndex !== undefined &&
            vertices[hoveredVertexIndex] &&
            !hasGhostActive &&
            !isHoverInActiveLeg
        ) {
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
    }, [mapReady, hoveredVertexIndex, vertices, activeLegIndex, legs, ghostSplitVertexIndex]);

    const handleZoomIn = (e: React.MouseEvent) => {
        e.stopPropagation();
        mapInstanceRef.current?.zoomIn();
    };

    const handleZoomOut = (e: React.MouseEvent) => {
        e.stopPropagation();
        mapInstanceRef.current?.zoomOut();
    };

    const fitEntireRoute = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
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

    const handleLayerMouseEnter = () => {
        if (layerMenuCloseTimerRef.current) {
            window.clearTimeout(layerMenuCloseTimerRef.current);
            layerMenuCloseTimerRef.current = null;
        }
        setIsLayerMenuOpen(true);
    };

    const handleLayerMouseLeave = () => {
        layerMenuCloseTimerRef.current = window.setTimeout(() => {
            setIsLayerMenuOpen(false);
        }, 250);
    };

    return (
        <div
            className={`ems-route-map-wrapper ${isFocusMode ? 'ems-route-map-wrapper--focused' : ''}`}
            onTransitionEnd={(e) => {
                if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('ems-route-map-canvas')) {
                    mapInstanceRef.current?.invalidateSize();
                }
            }}
        >
            {/* Top-Left: Discrete Map Layer Switcher */}
            <div
                ref={layerControlRef}
                className="ems-map-layer-control"
                onMouseEnter={handleLayerMouseEnter}
                onMouseLeave={handleLayerMouseLeave}
                onMouseDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
            >
                <button
                    type="button"
                    className={`ems-map-floating-btn ${isLayerMenuOpen ? 'ems-map-floating-btn--active' : ''}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsLayerMenuOpen((prev) => !prev);
                    }}
                    title="Select Map Layer"
                    aria-label="Select map layer"
                    aria-expanded={isLayerMenuOpen}
                >
                    <FontAwesomeIcon icon={faLayerGroup} />
                </button>

                {isLayerMenuOpen && (
                    <div className="ems-map-layer-flyout" role="menu" aria-label="Map Tile Layers">
                        {BASE_LAYERS.map((layer) => {
                            if (layer.requiresKey && !osMapsApiKey) return null;
                            const isActive = baseLayer === layer.id;
                            return (
                                <button
                                    key={layer.id}
                                    type="button"
                                    role="menuitem"
                                    className={`ems-map-layer-option ${isActive ? 'ems-map-layer-option--active' : ''}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setBaseLayer(layer.id);
                                        setIsLayerMenuOpen(false);
                                    }}
                                    title={layer.title}
                                >
                                    <span className="ems-map-layer-option-name">{layer.label}</span>
                                    {isActive && <FontAwesomeIcon icon={faCheck} className="ems-map-layer-check" />}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Top-Right: Action Dock */}
            <div
                ref={actionDockRef}
                className="ems-map-action-dock"
                onMouseDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
            >
                <button
                    type="button"
                    className="ems-map-dock-btn"
                    onClick={handleZoomIn}
                    title="Zoom in"
                    aria-label="Zoom in"
                >
                    <FontAwesomeIcon icon={faPlus} />
                </button>

                <button
                    type="button"
                    className="ems-map-dock-btn"
                    onClick={handleZoomOut}
                    title="Zoom out"
                    aria-label="Zoom out"
                >
                    <FontAwesomeIcon icon={faMinus} />
                </button>

                <button
                    type="button"
                    className="ems-map-dock-btn"
                    onClick={fitEntireRoute}
                    title="Fit Entire Route"
                    aria-label="Fit all"
                >
                    <FontAwesomeIcon icon={faLocationCrosshairs} />
                </button>

                <button
                    type="button"
                    className={`ems-map-dock-btn ${isFocusMode ? 'ems-map-dock-btn--active' : ''}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        toggleFocusMode();
                    }}
                    title={isFocusMode ? 'Exit Focus Mode (Esc)' : 'Focus Mode (Maximize Map)'}
                    aria-label={isFocusMode ? 'Exit focus mode' : 'Focus mode'}
                    aria-pressed={isFocusMode}
                >
                    <FontAwesomeIcon icon={isFocusMode ? faCompress : faExpand} />
                </button>
            </div>

            {/* Map Div */}
            <div
                key={isBng ? 'bng-map' : 'mercator-map'}
                ref={mapContainerRef}
                className="ems-route-map-canvas"
                tabIndex={-1}
            />

            {/* Subtle Map Interaction Hint: Mouse desktop tip vs. Touch device tip */}
            <div className="ems-map-interaction-hint ems-hide-touch">
                Tip: Hover active leg on map to split (+) &bull; Drag checkpoints to move &bull; Right-click checkpoint to delete
            </div>
            <div className="ems-map-interaction-hint ems-show-touch">
                Tip: Drag checkpoints to reposition &bull; Tap a leg to select
            </div>
        </div>
    );
}
