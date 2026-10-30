import { useRef } from 'react';
import { RouteLeg, RouteVertex } from '../types/route-card';

interface RouteElevationProfileProps {
    vertices: RouteVertex[];
    legs: RouteLeg[];
    activeLegIndex: number;
    onSelectLeg: (legIndex: number) => void;
    onHoverVertex?: (vertexIndex: number | null) => void;
}

export function RouteElevationProfile({
    vertices,
    legs,
    activeLegIndex,
    onSelectLeg,
    onHoverVertex,
}: RouteElevationProfileProps) {
    const svgRef = useRef<SVGSVGElement | null>(null);

    if (vertices.length < 2) {
        return null;
    }

    const totalDistM = vertices[vertices.length - 1].dist_from_start_m;
    if (totalDistM <= 0) return null;

    // Determine min and max elevation with padding
    const elevations = vertices.map((v) => v.ele_dem);
    const rawMinEle = Math.min(...elevations);
    const rawMaxEle = Math.max(...elevations);
    const minEle = Math.max(0, Math.floor(rawMinEle / 50) * 50 - 50);
    const maxEle = Math.ceil(rawMaxEle / 50) * 50 + 50;
    const eleRange = Math.max(50, maxEle - minEle);

    const width = 800;
    const height = 140;
    const paddingLeft = 45;
    const paddingRight = 20;
    const paddingTop = 15;
    const paddingBottom = 25;

    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;

    // Coordinate conversion functions
    const getX = (distM: number) => paddingLeft + (distM / totalDistM) * plotWidth;
    const getY = (eleM: number) => paddingTop + (1.0 - (eleM - minEle) / eleRange) * plotHeight;

    // Build overall profile SVG path
    let fullProfilePath = `M ${getX(vertices[0].dist_from_start_m)} ${getY(vertices[0].ele_dem)}`;
    for (let i = 1; i < vertices.length; i++) {
        fullProfilePath += ` L ${getX(vertices[i].dist_from_start_m)} ${getY(vertices[i].ele_dem)}`;
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

    // Handle mouse/touch scrub
    const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
        if (!svgRef.current || !onHoverVertex) return;
        const rect = svgRef.current.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const ratio = (clientX - paddingLeft) / plotWidth;
        const targetDistM = Math.max(0, Math.min(1.0, ratio)) * totalDistM;

        // Binary search or scan for closest vertex
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

    return (
        <div className="ems-elevation-profile-container">
            <div className="ems-elevation-profile-header">
                <span className="ems-elevation-profile-title">Elevation Profile</span>
                <span className="ems-elevation-profile-stats">
                    Min: <b>{Math.round(rawMinEle)}m</b> &bull; Max: <b>{Math.round(rawMaxEle)}m</b> &bull; Total: <b>{Math.round(totalDistM / 1000 * 10) / 10}km</b>
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
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.5" />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.05" />
                    </linearGradient>
                    <linearGradient id="fullTrackGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.25" />
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

                {/* Full Profile Background Area */}
                <path
                    d={`${fullProfilePath} L ${getX(totalDistM)} ${getY(minEle)} L ${getX(0)} ${getY(minEle)} Z`}
                    fill="url(#fullTrackGrad)"
                />

                {/* Active Leg Highlight Area */}
                {activeLegFillPath && (
                    <path d={activeLegFillPath} fill="url(#activeLegGrad)" />
                )}

                {/* Main Profile Line */}
                <path
                    d={fullProfilePath}
                    fill="none"
                    stroke="#475569"
                    strokeWidth="2"
                    strokeLinecap="round"
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
                        strokeWidth="3.5"
                        strokeLinecap="round"
                    />
                )}

                {/* Checkpoint Markers on Profile */}
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
                                r={isActive ? 5 : 3.5}
                                fill={isActive ? '#2563eb' : '#ffffff'}
                                stroke={isActive ? '#ffffff' : '#64748b'}
                                strokeWidth="2"
                            />
                            <text
                                x={cx}
                                y={height - paddingBottom + 12}
                                textAnchor="middle"
                                fontSize="9"
                                fontWeight={isActive ? '700' : '500'}
                                fill={isActive ? '#2563eb' : '#64748b'}
                            >
                                {idx === 0 ? 'S' : `${idx}`}
                            </text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}
