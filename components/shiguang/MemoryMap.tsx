"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface MapPin {
  key: string;
  lat: number;
  lng: number;
  color: string;
  cover?: string | null;
  title: string;
  ownerName: string;
  size: number;
  active?: boolean;
  /** 被筛选条过滤掉的点：变暗但仍在地图上 */
  dim?: boolean;
  /** 我打过卡的点：加一圈金边 */
  visited?: boolean;
}

export interface MapLine {
  id: string;
  color: string;
  positions: [number, number][];
  label: string;
  dashed?: boolean;
}

interface Props {
  pins: MapPin[];
  lines?: MapLine[];
  selectedId: string | null;
  onSelect: (key: string | null) => void;
  focus?: { lat: number; lng: number } | null;
}

function FlyTo({ focus }: { focus: Props["focus"] }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lng], 6, { duration: 1.2 });
  }, [focus, map]);
  return null;
}

function FitAll({ pins, enabled }: { pins: MapPin[]; enabled: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!enabled || pins.length < 2) return;
    const bounds = L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [70, 70] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export default function MemoryMap({ pins, lines = [], selectedId, onSelect, focus }: Props) {
  const icons = useMemo(() => {
    const map = new Map<string, L.DivIcon>();
    pins.forEach((p) => {
      const size = Math.round(p.size);
      const border = p.active ? "#fcd34d" : p.visited ? "#fbbf24" : p.color;
      const inner = p.cover
        ? `<img src="${p.cover}" style="width:100%;height:100%;object-fit:cover;display:block" />`
        : `<div style="width:100%;height:100%;background:${p.color}22"></div>`;
      map.set(
        p.key,
        L.divIcon({
          className: "shiguang-pin",
          html: `<div style="position:relative;width:${size}px;height:${size}px;border-radius:9999px;overflow:hidden;border:2px solid ${border};box-shadow:0 0 ${p.active ? 24 : 10}px ${p.color}${p.active ? "cc" : "77"};background:#0f172a;opacity:${p.dim ? 0.22 : 1};filter:${p.dim ? "grayscale(1)" : "none"}">
              ${inner}
              ${p.visited ? `<span style="position:absolute;right:0;bottom:0;width:9px;height:9px;border-radius:9999px;background:#fbbf24;border:1.5px solid #0f172a"></span>` : ""}
            </div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
      );
    });
    return map;
  }, [pins, selectedId]);

  const center: [number, number] = pins.length
    ? [
        pins.reduce((a, p) => a + p.lat, 0) / pins.length,
        pins.reduce((a, p) => a + p.lng, 0) / pins.length,
      ]
    : [32, 112];

  return (
    <MapContainer
      center={center}
      zoom={4}
      minZoom={3}
      maxZoom={12}
      scrollWheelZoom
      style={{ height: "100%", width: "100%", background: "transparent" }}
      attributionControl
    >
      <TileLayer
        url="https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}"
        attribution="&copy; 高德地图"
        subdomains={["1", "2", "3", "4"]}
        maxZoom={18}
      />
      <FitAll pins={pins} enabled={!focus} />
      <FlyTo focus={focus} />

      {lines.map((line) =>
        line.positions.length > 1 ? (
          <Polyline
            key={line.id}
            positions={line.positions}
            pathOptions={{
              color: line.color,
              weight: 2.5,
              opacity: 0.85,
              dashArray: line.dashed ? "7 7" : undefined,
            }}
          >
            <Tooltip sticky>
              <span style={{ fontSize: 12 }}>{line.label}</span>
            </Tooltip>
          </Polyline>
        ) : null,
      )}

      {pins.map((p) => (
        <Marker
          key={p.key}
          position={[p.lat, p.lng]}
          icon={icons.get(p.key)}
          eventHandlers={{ click: () => onSelect(selectedId === p.key ? null : p.key) }}
        >
          <Tooltip direction="bottom" offset={[0, 14]} opacity={1}>
            <span style={{ fontSize: 12 }}>
              {p.ownerName} · {p.title}
            </span>
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
