import type { MouseEvent } from 'react';
import { distanceM } from '@attendance/shared';
import { fmtMetres, humanize } from '../../lib/format';
import { CLASS_COLOR, GEOFENCE_COLOR, fromOffsetM, offsetM, roundCoord, type GeofenceMapProps } from './types';

const SIZE = 400;

function niceScale(extent: number): number {
  const target = extent / 2.5;
  const pow = 10 ** Math.floor(Math.log10(target));
  for (const m of [5, 2, 1]) if (m * pow <= target) return m * pow;
  return pow;
}

/**
 * Key-less fallback: plots the geofence and evidence in metres around the centre (north up).
 * Clicking moves the centre when `onCenterChange` is set.
 */
export function SvgGeofenceMap({ center, radiusM, evidence = [], onCenterChange, height = 360 }: GeofenceMapProps) {
  const pts = evidence.map((e) => ({ e, ...offsetM(center, e), d: distanceM({ centerLat: center.lat, centerLng: center.lng }, e) }));
  const extent =
    Math.max(radiusM * 1.3, ...pts.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y)) + (p.e.accuracyM ?? 0))) * 1.1 || 100;
  const k = SIZE / 2 / extent; // px per metre
  const scale = niceScale(extent);

  const handleClick = (ev: MouseEvent<SVGSVGElement>) => {
    if (!onCenterChange) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const px = ((ev.clientX - rect.left) / rect.width) * SIZE - SIZE / 2;
    const py = ((ev.clientY - rect.top) / rect.height) * SIZE - SIZE / 2;
    const c = fromOffsetM(center, px / k, -py / k);
    onCenterChange({ lat: roundCoord(c.lat), lng: roundCoord(c.lng) });
  };

  return (
    <div className="map-box" style={{ height }}>
      <svg
        viewBox={`${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Geofence plot: radius ${Math.round(radiusM)} m, ${evidence.length} evidence point(s)`}
        onClick={handleClick}
        style={{ cursor: onCenterChange ? 'crosshair' : 'default', width: '100%', height: '100%' }}
      >
        <defs>
          <pattern id="grid" width={scale * k} height={scale * k} patternUnits="userSpaceOnUse" x={0} y={0}>
            <path d={`M ${scale * k} 0 L 0 0 0 ${scale * k}`} fill="none" stroke="#e5e7eb" strokeWidth={1} />
          </pattern>
        </defs>
        <rect x={-SIZE / 2} y={-SIZE / 2} width={SIZE} height={SIZE} fill="url(#grid)" />
        <circle r={radiusM * k} fill={GEOFENCE_COLOR} fillOpacity={0.1} stroke={GEOFENCE_COLOR} strokeWidth={2} />
        <line x1={-6} x2={6} y1={0} y2={0} stroke={GEOFENCE_COLOR} strokeWidth={2} />
        <line x1={0} x2={0} y1={-6} y2={6} stroke={GEOFENCE_COLOR} strokeWidth={2} />
        {pts.map(({ e, x, y, d }) => (
          <g key={e.id} transform={`translate(${x * k} ${-y * k})`}>
            <title>{`${e.label}: ${humanize(e.classification)}, ${fmtMetres(d)} from centre, accuracy ${fmtMetres(e.accuracyM)}`}</title>
            {e.accuracyM ? (
              <circle
                r={Math.max(e.accuracyM * k, 2)}
                fill={CLASS_COLOR[e.classification]}
                fillOpacity={0.15}
                stroke={CLASS_COLOR[e.classification]}
                strokeDasharray="3 3"
              />
            ) : null}
            <circle r={4.5} fill={CLASS_COLOR[e.classification]} stroke="#fff" strokeWidth={1.5} />
          </g>
        ))}
        <text x={-SIZE / 2 + 10} y={-SIZE / 2 + 20} fontSize={13} fill="#475569">
          N ↑
        </text>
        <g transform={`translate(${-SIZE / 2 + 12} ${SIZE / 2 - 14})`}>
          <line x1={0} x2={scale * k} y1={0} y2={0} stroke="#334155" strokeWidth={2} />
          <text x={0} y={-5} fontSize={11} fill="#334155">
            {fmtMetres(scale)}
          </text>
        </g>
      </svg>
      <div className="map-note">
        Schematic view (no Google Maps key configured){onCenterChange ? ' — click to move the centre.' : '.'}
      </div>
    </div>
  );
}
