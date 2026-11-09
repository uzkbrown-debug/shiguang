/**
 * 路线几何：地图上那条线到底怎么走
 *
 * 后端拿高德驾车规划算出「沿公路的折线」并缓存，这里只负责取回来 + 兜底。
 * 兜底分两种：境外路线（高德没有道路数据）用一条平滑弧线，看着像航线，
 * 总比一条直愣愣的直线好；接口直接挂了就还是原始站点直连。
 */

export type GeometrySource = "amap" | "mixed" | "straight" | "none";

export interface RouteGeometry {
  route_id: string;
  mode: string;
  /** [[lat, lng], …] */
  points: [number, number][];
  distance_m: number;
  source: GeometrySource;
  cached: boolean;
}

const memo = new Map<string, RouteGeometry>();

/** 取一条路线的沿路折线；同一次会话里只问后端一次 */
export async function fetchRouteGeometry(
  routeId: string,
  opts?: { refresh?: boolean },
): Promise<RouteGeometry | null> {
  if (!opts?.refresh) {
    const hit = memo.get(routeId);
    if (hit) return hit;
  }
  try {
    const res = await fetch(`/api/routes/${routeId}/geometry`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as RouteGeometry;
    if (!data || !Array.isArray(data.points)) return null;
    memo.set(routeId, data);
    return data;
  } catch {
    return null;
  }
}

export function clearRouteGeometry(routeId?: string) {
  if (routeId) memo.delete(routeId);
  else memo.clear();
}

/** 两点之间一条向外鼓起的弧，t 是鼓起来的高度占直线长度的比例 */
function arc(
  a: [number, number],
  b: [number, number],
  bend: number,
  steps: number,
): [number, number][] {
  const [lat1, lng1] = a;
  const [lat2, lng2] = b;
  const dx = lng2 - lng1;
  const dy = lat2 - lat1;
  const midLat = (lat1 + lat2) / 2;
  // 垂直于连线的方向（经度按纬度压缩，弧才不会歪）
  const kx = Math.cos((midLat * Math.PI) / 180) || 1;
  const nx = -dy / kx;
  const ny = dx * kx;
  const norm = Math.hypot(nx, ny) || 1;
  const lift = Math.hypot(dx * kx, dy) * bend;
  const cx = (lng1 + lng2) / 2 + (nx / norm) * lift;
  const cy = (lat1 + lat2) / 2 + (ny / norm) * lift;
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    out.push([u * u * lat1 + 2 * u * t * cy + t * t * lat2, u * u * lng1 + 2 * u * t * cx + t * t * lng2]);
  }
  return out;
}

/**
 * 没有道路数据时的兜底：一段一段鼓起来的弧，方向左右交替，整体呈 S 形。
 * 三条城市串起来就像一条飞行航线，不会出现「穿过水面、穿过别人家」的直线。
 */
export function smoothCurve(
  stops: [number, number][],
  bend = 0.16,
  steps = 20,
): [number, number][] {
  const pts = stops.filter((p) => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1]));
  if (pts.length < 2) return pts;
  const out: [number, number][] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const sign = i % 2 === 0 ? 1 : -1;
    const seg = arc(pts[i], pts[i + 1], bend * sign, steps);
    out.push(...seg.slice(1));
  }
  return out;
}

/** 折线总长（米），用来在按钮旁边标一句「沿路 67 km」 */
export function polylineLength(points: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const [lat1, lng1] = points[i - 1];
    const [lat2, lng2] = points[i];
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    total += 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  return total;
}

export function kmText(meters: number): string {
  if (!meters || !Number.isFinite(meters)) return "";
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${km >= 100 ? Math.round(km) : km.toFixed(1)} km`;
}
