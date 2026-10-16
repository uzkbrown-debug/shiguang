"use client";

// 旅行路线 / 攻略 / 地图共享的数据访问层

export const VISIBILITY_LABEL: Record<string, string> = {
  private: "仅自己",
  friends: "好友可见",
  public: "公开",
};

export const VISIBILITY_HINT: Record<string, string> = {
  private: "只有你自己能看到",
  friends: "通过申请的好友能看到",
  public: "任何人都能看到",
};

// 每个人在地图上一种颜色（按顺序分配，颜色稳定）
export const OWNER_COLORS = [
  "#38bdf8",
  "#f472b6",
  "#facc15",
  "#34d399",
  "#a78bfa",
  "#fb923c",
  "#22d3ee",
  "#f87171",
  "#4ade80",
  "#c084fc",
];

export function colorFor(index: number): string {
  return OWNER_COLORS[index % OWNER_COLORS.length];
}

export interface ExploreOwner {
  id: string;
  nickname: string;
  avatar?: string | null;
  is_me: boolean;
  is_friend: boolean;
}

export interface RefItem {
  route_id?: string;
  guide_id?: string;
  title: string;
  stop?: number;
  total?: number;
  day?: number;
  day_title?: string | null;
  transport?: string | null;
  owner_name?: string | null;
  is_mine?: boolean;
}

export interface ExplorePoint {
  memory_id: string;
  owner_id: string;
  title: string;
  summary?: string | null;
  happened_at: string;
  cover?: string | null;
  media_count: number;
  tags: string[];
  visibility: string;
  location_id: string;
  location_name: string;
  city?: string | null;
  latitude: number;
  longitude: number;
  person_ids: string[];
  photos?: { url: string; caption?: string | null; kind?: string }[];
  route_refs?: RefItem[];
  guide_refs?: RefItem[];
  visit?: string | null;
  person_names?: string[];
}

export interface PersonChip {
  id: string;
  name: string;
  avatar?: string | null;
  count: number;
}

export interface RoutePointItem {
  id?: number;
  sort: number;
  name: string;
  location_id?: string | null;
  latitude: number;
  longitude: number;
  arrive_date?: string | null;
  stay_days: number;
  transport?: string | null;
  note?: string | null;
  memory_id?: string | null;
}

export interface TravelRouteItem {
  id: string;
  user_id: string;
  owner_name?: string | null;
  owner_nickname?: string | null;
  owner_avatar?: string | null;
  title: string;
  summary?: string | null;
  cover?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  tags: string[];
  visibility: string;
  point_count?: number;
  days?: number;
  points: RoutePointItem[];
}

export interface GuideBrief {
  id: string;
  user_id: string;
  owner_name?: string | null;
  owner_avatar?: string | null;
  title: string;
  subtitle?: string | null;
  cover?: string | null;
  destination?: string | null;
  day_count: number;
  budget?: string | null;
  best_season?: string | null;
  summary?: string | null;
  visibility: string;
  status: string;
  route_id?: string | null;
  created_at?: string | null;
  photo_count?: number;
}

export interface GuideDayItem {
  id?: string;
  sort: number;
  title: string;
  content?: string | null;
  image_url?: string | null;
  transport?: string | null;
  cost?: string | null;
}

export interface GuideFull extends GuideBrief {
  transport_info?: string | null;
  stay_info?: string | null;
  tips?: string | null;
  days: GuideDayItem[];
  media: { id?: number; url: string; caption?: string | null }[];
  route?: TravelRouteItem | null;
}

export interface ExplorePayload {
  scope: string;
  owners: ExploreOwner[];
  points: ExplorePoint[];
  routes: TravelRouteItem[];
  persons: Record<string, string>;
  person_bar: PersonChip[];
  visited_count: number;
  wish_count: number;
  years: string[];
}

async function getJSON<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { detail?: string }).detail || "操作失败");
  return data as T;
}

export function fetchExplore(scope: string, year?: string): Promise<ExplorePayload | null> {
  const q = new URLSearchParams({ scope });
  if (year && year !== "all") q.set("year", year);
  return getJSON<ExplorePayload>(`/api/explore?${q.toString()}`);
}

export function fetchRoutes(params: { scope?: string; owner?: string; q?: string } = {}) {
  const q = new URLSearchParams();
  if (params.scope) q.set("scope", params.scope);
  if (params.owner) q.set("owner", params.owner);
  if (params.q) q.set("q", params.q);
  return getJSON<TravelRouteItem[]>(`/api/routes?${q.toString()}`);
}

export function fetchRoute(id: string) {
  return getJSON<TravelRouteItem>(`/api/routes/${id}`);
}

export function saveRoute(id: string | null, body: unknown) {
  return id
    ? send<TravelRouteItem>("PATCH", `/api/routes/${id}`, body)
    : send<TravelRouteItem>("POST", "/api/routes", body);
}

export function deleteRoute(id: string) {
  return send<{ deleted: string }>("DELETE", `/api/routes/${id}`);
}

export function fetchGuides(params: { scope?: string; owner?: string; q?: string } = {}) {
  const q = new URLSearchParams();
  if (params.scope) q.set("scope", params.scope);
  if (params.owner) q.set("owner", params.owner);
  if (params.q) q.set("q", params.q);
  return getJSON<GuideBrief[]>(`/api/guides?${q.toString()}`);
}

export function fetchGuide(id: string) {
  return getJSON<GuideFull>(`/api/guides/${id}`);
}

export function saveGuide(id: string | null, body: unknown) {
  return id
    ? send<GuideFull>("PATCH", `/api/guides/${id}`, body)
    : send<GuideFull>("POST", "/api/guides", body);
}

export function deleteGuide(id: string) {
  return send<{ deleted: string }>("DELETE", `/api/guides/${id}`);
}

export function setMemoryVisibility(memoryId: string, visibility: string) {
  return send<{ id: string; visibility: string }>(
    "PATCH",
    `/api/memories/${memoryId}/visibility`,
    { visibility },
  );
}

/** 巡礼打卡：visited 去过 / wish 想去 / none 取消 */
export function setVisit(memoryId: string, state: "visited" | "wish" | "none") {
  return send<{ memory_id: string; state: string | null }>("POST", "/api/visits", {
    memory_id: memoryId,
    state,
  });
}

/** 按城市名查坐标（路线编辑器用） */
export function lookupGeo(name: string) {
  return getJSON<{ name: string; latitude: number; longitude: number }>(
    `/api/geo?q=${encodeURIComponent(name)}`,
  );
}

/** 上传图片到 /api/uploads 并存成一篇攻略的图集（复用记忆上传接口，返回媒体 url） */
export async function uploadImages(files: File[], visibility = "friends"): Promise<string[]> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  form.append("visibility", visibility);
  const res = await fetch("/api/uploads", { method: "POST", body: form });
  if (!res.ok) throw new Error("图片上传失败");
  const data = (await res.json()) as {
    media?: { url: string }[];
    photos?: { url: string }[];
    cover?: string | null;
  };
  const urls = (data.media ?? []).map((m) => m.url);
  if (!urls.length && data.photos?.length) return data.photos.map((p) => p.url);
  return urls;
}
