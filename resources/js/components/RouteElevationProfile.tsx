import { useRef } from 'react';
import { RouteLeg, RouteVertex } from '../types/route-card';

interface RouteElevationProfileProps {
    vertices: RouteVertex[];
    legs: RouteLeg[];
    activeLegIndex: number;
    hoveredVertexIndex?: number | null;
    onSelectLeg: (legIndex: number) => void;
    onHoverVertex?: (vertexIndex: number | null) => void;
}

export function RouteElevationProfile({
    vertices,
    legs,
    activeLegIndex,
    hoveredVertexIndex,
    onSelectLeg,
    onHoverVertex,
}: RouteElevationProfileProps) {
    const svgRef = useRef<SVGSVGElement | null>(null);

    if (vertices.length < 2) {
        return null;
    }

    const totalDistM = vertices[vertices.length - 1]?.dist_from_start_m || 0;
    if (totalDistM <= 0) return null;

    const totalDistKm = totalDistM / 1000.0;

    // Determine min and max elevation with padding
    const elevations = vertices.map((v) => v.ele_dem);
    const rawMinEle = Math.min(...elevations);
    const rawMaxEle = Math.max(...elevations);
    const minEle = Math.max(0, Math.floor(rawMinEle / 50) * 50 - 50);
    const maxEle = Math.ceil(rawMaxEle / 50) * 50 + 50;
    const eleRange = Math.max(50, maxEle - minEle);

    const width = 800;
    const height = 150;
    const paddingLeft = 45;
    const paddingRight = 30;
    const paddingTop = 15;
    const paddingBottom = 30;

    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;

    // Coordinate conversion functions
    const getX = (distM: number) => paddingLeft + (distM / totalDistM) * plotWidth;
    const getY = (eleM: number) => paddingTop + (1.0 - (eleM - minEle) / eleRange) * plotHeight;

    // Build overall profile SVG path
    let fullProfilePath = `M ${getX(vertices[0].dist_from_start_m)} ${getY(vertices[0].ele_dem)}`;
    for (let i = 1; i < vertices.length; i++) {
        if (vertices[i]) {
            fullProfilePath += ` L ${getX(vertices[i].dist_from_start_m)} ${getY(vertices[i].ele_dem)}`;
        }
    }

    // Build active leg highlight path
    let activeLegFillPath = '';
    const activeLeg = legs[activeLegIndex];
    if (activeLeg) {
        const vStart = vertices[activeLeg.start_vertex_index];
        const vEnd = vertices[activeLeg.end_vertex_index];

        if (vStart && vEnd) {
            const startX = getX(vStart.dist_from_start_m);
            const endX = getX(vEnd.dist_from_start_m);
            const bottomY = getY(minEle);

            activeLegFillPath = `M ${startX} ${bottomY}`;
            for (let i = activeLeg.start_vertex_index; i <= activeLeg.end_vertex_index; i++) {
                if (vertices[i]) {
                    activeLegFillPath += ` L ${getX(vertices[i].dist_from_start_m)} ${getY(vertices[i].ele_dem)}`;
                }
            }
            activeLegFillPath += ` L ${endX} ${bottomY} Z`;
        }
    }

    // Generate distance axis intervals (4-5 ticks along the bottom)
    const distanceTicks = [
        0,
        Math.round(totalDistKm * 0.25 * 10) / 10,
        Math.round(totalDistKm * 0.5 * 10) / 10,
        Math.round(totalDistKm * 0.75 * 10) / 10,
        Math.round(totalDistKm * 10) / 10,
    ];

    // Handle mouse/touch scrub
    const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
        if (!svgRef.current || !onHoverVertex) return;
        const rect = svgRef.current.getBoundingClientRect();
        const rectWidth = rect.width > 0 ? rect.width : width;

        // Scale clientX from screen pixels to SVG coordinate space
        const scaleX = width / rectWidth;
        const svgX = (e.clientX - rect.left) * scaleX;
        const ratio = Math.max(0, Math.min(1.0, (svgX - paddingLeft) / plotWidth));
        const targetDistM = ratio * totalDistM;

        let closestIdx = 0;
        let minDiff = Infinity;
        for (let i = 0; i < vertices.length; i++) {
            const diff = Math.abs(vertices[i].dist_from_start_m - targetDistM);
            if (diff < minDiff) {
                minDiff = diff;
                closestIdx = i;
            }
        }

        onHoverVertex(closestIdx);
    };

    const handlePointerLeave = () => {
        if (onHoverVertex) onHoverVertex(null);
    };

    const lastLeg = legs[legs.length - 1];

    return (
        <div className="ems-elevation-profile-container">
            <div className="ems-elevation-profile-header">
                <span className="ems-elevation-profile-title">Elevation Profile</span>
                <span className="ems-elevation-profile-stats">
                    Min: <b>{Math.round(rawMinEle)}m</b> &bull; Max: <b>{Math.round(rawMaxEle)}m</b> &bull; Total: <b>{totalDistKm.toFixed(1)}km</b>
                </span>
            </div>

            <svg
                ref={svgRef}
                viewBox={`0 0 ${width} ${height}`}
                className="ems-elevation-profile-svg"
                onPointerMove={handlePointerMove}
                onPointerLeave={handlePointerLeave}
            >
                <defs>
                    <linearGradient id="activeLegGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.55" />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.08" />
                    </linearGradient>
                    <linearGradient id="fullTrackGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#f1f5f9" stopOpacity="0.05" />
                    </linearGradient>
                </defs>

                {/* Y-Axis Horizontal Gridlines */}
                {[minEle, Math.round(minEle + eleRange / 2), maxEle].map((eleVal) => {
                    const y = getY(eleVal);
                    return (
                        <g key={eleVal}>
                            <line
                                x1={paddingLeft}
                                y1={y}
                                x2={width - paddingRight}
                                y2={y}
                                stroke="#e2e8f0"
                                strokeDasharray="3,3"
                            />
                            <text
                                x={paddingLeft - 6}
                                y={y + 4}
                                textAnchor="end"
                                fontSize="10"
                                fill="#94a3b8"
                            >
                                {eleVal}m
                            </text>
                        </g>
                    );
                })}

                {/* Baseline X-Axis (Distance Axis) */}
                <line
                    x1={paddingLeft}
                    y1={height - paddingBottom}
                    x2={width - paddingRight}
                    y2={height - paddingBottom}
                    stroke="#cbd5e1"
                    strokeWidth="1"
                />

                {/* Distance Axis Tick Marks and Labels */}
                {distanceTicks.map((tickKm, i) => {
                    const x = getX(tickKm * 1000);
                    return (
                        <g key={i}>
                            <line
                                x1={x}
                                y1={height - paddingBottom}
                                x2={x}
                                y2={height - paddingBottom + 4}
                                stroke="#94a3b8"
                                strokeWidth="1"
                            />
                            <text
                                x={x}
                                y={height - paddingBottom + 16}
                                textAnchor="middle"
                                fontSize="9"
                                fill="#64748b"
                            >
                                {tickKm}km
                            </text>
                        </g>
                    );
                })}

                {/* Full Profile Background Area */}
                <path
                    d={`${fullProfilePath} L ${getX(totalDistM)} ${getY(minEle)} L ${getX(0)} ${getY(minEle)} Z`}
                    fill="url(#fullTrackGrad)"
                />

                {/* Active Leg Highlight Area */}
                {activeLegFillPath && (
                    <path d={activeLegFillPath} fill="url(#activeLegGrad)" />
                )}

                {/* Main Profile Line for the ENTIRE route */}
                <path
                    d={fullProfilePath}
                    fill="none"
                    stroke="#64748b"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />

                {/* Active Leg Line Segment */}
                {activeLeg && vertices[activeLeg.start_vertex_index] && (
                    <path
                        d={(() => {
                            let p = `M ${getX(vertices[activeLeg.start_vertex_index].dist_from_start_m)} ${getY(vertices[activeLeg.start_vertex_index].ele_dem)}`;
                            for (let i = activeLeg.start_vertex_index + 1; i <= activeLeg.end_vertex_index; i++) {
                                if (vertices[i]) {
                                    p += ` L ${getX(vertices[i].dist_from_start_m)} ${getY(vertices[i].ele_dem)}`;
                                }
                            }
                            return p;
                        })()}
                        fill="none"
                        stroke="#2563eb"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                )}

                {/* Checkpoint Markers (Start of each leg) */}
                {legs.map((leg, idx) => {
                    const v = vertices[leg.start_vertex_index];
                    if (!v) return null;
                    const cx = getX(v.dist_from_start_m);
                    const cy = getY(v.ele_dem);
                    const isActive = idx === activeLegIndex;

                    return (
                        <g
                            key={idx}
                            className="ems-elevation-checkpoint-marker"
                            onClick={() => onSelectLeg(idx)}
                            style={{ cursor: 'pointer' }}
                        >
                            <line
                                x1={cx}
                                y1={cy}
                                x2={cx}
                                y2={height - paddingBottom}
                                stroke={isActive ? '#2563eb' : '#cbd5e1'}
                                strokeWidth={isActive ? '2' : '1'}
                            />
                            <circle
                                cx={cx}
                                cy={cy}
                                r={isActive ? 5.5 : 4}
                                fill={isActive ? '#2563eb' : '#ffffff'}
                                stroke={isActive ? '#ffffff' : '#64748b'}
                                strokeWidth="2"
                            />
                            <text
                                x={cx}
                                y={height - paddingBottom - 6}
                                textAnchor="middle"
                                fontSize="9"
                                fontWeight={isActive ? '700' : '600'}
                                fill={isActive ? '#2563eb' : '#475569'}
                            >
                                {idx === 0 ? 'S' : `${idx}`}
                            </text>
                        </g>
                    );
                })}

                {/* Finish Checkpoint Marker (at the very end of the route) */}
                {lastLeg && vertices[lastLeg.end_vertex_index] && (() => {
                    const vFinish = vertices[lastLeg.end_vertex_index];
                    const cx = getX(vFinish.dist_from_start_m);
                    const cy = getY(vFinish.ele_dem);
                    const isLastActive = activeLegIndex === legs.length - 1;

                    return (
                        <g
                            key="finish-marker"
                            className="ems-elevation-checkpoint-marker"
                            onClick={() => onSelectLeg(legs.length - 1)}
                            style={{ cursor: 'pointer' }}
                        >
                            <line
                                x1={cx}
                                y1={cy}
                                x2={cx}
                                y2={height - paddingBottom}
                                stroke={isLastActive ? '#ef4444' : '#f87171'}
                                strokeWidth="1.5"
                                strokeDasharray="2,2"
                            />
                            <circle
                                cx={cx}
                                cy={cy}
                                r={isLastActive ? 5.5 : 4}
                                fill="#ef4444"
                                stroke="#ffffff"
                                strokeWidth="2"
                            />
                            <text
                                x={cx}
                                y={height - paddingBottom - 6}
                                textAnchor="middle"
                                fontSize="9"
                                fontWeight="700"
                                fill="#ef4444"
                            >
                                F
                            </text>
                        </g>
                    );
                })()}

                {/* Scrubbing Hover Crosshair & Red Dot matching map marker */}
                {hoveredVertexIndex !== null && hoveredVertexIndex !== undefined && vertices[hoveredVertexIndex] && (() => {
                    const hVertex = vertices[hoveredVertexIndex];
                    const hx = getX(hVertex.dist_from_start_m);
                    const hy = getY(hVertex.ele_dem);

                    return (
                        <g key="elevation-hover-point" pointerEvents="none">
                            {/* Vertical tracker dashed guideline */}
                            <line
                                x1={hx}
                                y1={paddingTop}
                                x2={hx}
                                y2={height - paddingBottom}
                                stroke="#ef4444"
                                strokeWidth="1.5"
                                strokeDasharray="3,3"
                                opacity="0.8"
                            />

                            {/* Red dot matching the map hover marker */}
                            <circle
                                cx={hx}
                                cy={hy}
                                r={7}
                                fill="#ef4444"
                                fillOpacity={0.9}
                                stroke="#ffffff"
                                strokeWidth="2"
                            />

                            {/* Tooltip badge with Elevation and Distance */}
                            <g
                                transform={`translate(${Math.max(paddingLeft + 42, Math.min(width - paddingRight - 42, hx))}, ${hy > paddingTop + 24 ? hy - 14 : hy + 22})`}
                            >
                                <rect
                                    x="-38"
                                    y="-12"
                                    width="76"
                                    height="18"
                                    rx="3"
                                    fill="#1e293b"
                                    fillOpacity="0.9"
                                />
                                <text
                                    x="0"
                                    y="1"
                                    textAnchor="middle"
                                    fontSize="10"
                                    fontWeight="600"
                                    fill="#ffffff"
                                >
                                    {Math.round(hVertex.ele_dem)}m &bull; {(hVertex.dist_from_start_m / 1000).toFixed(1)}km
                                </text>
                            </g>
                        </g>
                    );
                })()}
            </svg>
        </div>
    );
}
