// 拾光数据访问层：优先请求后端（FastAPI），后端不可用时回退到本地演示数据
// 前端通过 next.config.ts 的 rewrites 代理 /api/* -> http://127.0.0.1:8000

import {
  allImages,
  memories as localMemories,
  locations as localLocations,
  persons as localPersons,
  type ShiguangMemory,
} from "@/data/shiguang";

export interface PhotoItem {
  id: number;
  url: string;
  caption: string;
  kind?: "image" | "video";
}

export interface MemoryMediaPage {
  memory_id: string;
  title: string;
  summary: string;
  happened_at: string;
  content?: string;
  location_name?: string;
  person_names?: string[];
  tags?: string[];
  photos: PhotoItem[];
  source: "backend" | "local";
}

export interface MemoryBrief {
  id: string;
  title: string;
  summary: string;
  happened_at: string;
  time_precision?: string;
  location_id: string;
  person_ids: string[];
  tags: string[];
  cover: string;
  media_count: number;
  emotion?: string | null;
  importance?: number;
  source_type?: string;
  ai_status?: string;
  ai_generated?: boolean;
  confidence?: number;
}

/** 后端字段 → 前端内部使用的结构（时间线/地图/人物页共用） */
export function toShiguangMemory(m: MemoryBrief): ShiguangMemory {
  return {
    id: m.id,
    title: m.title,
    summary: m.summary ?? "",
    content: "",
    happenedAt: m.happened_at ?? "",
    timePrecision: (m.time_precision ?? "day") as ShiguangMemory["timePrecision"],
    locationId: m.location_id ?? "",
    personIds: m.person_ids ?? [],
    tags: m.tags ?? [],
    emotion: m.emotion ?? "",
    importance: (m.importance ?? 3) as ShiguangMemory["importance"],
    sourceType: (m.source_type ?? "photo") as ShiguangMemory["sourceType"],
    cover: m.cover ?? "",
    aiStatus: (m.ai_status ?? "confirmed") as ShiguangMemory["aiStatus"],
    confidence: m.confidence ?? 0.8,
    aiGenerated: Boolean(m.ai_generated),
    mediaCount: m.media_count ?? 0,
  };
}

export interface LocationItem {
  id: string;
  name: string;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  precision?: string | null;
}

/** 地点列表（含坐标，地图用） */
export async function fetchLocations(): Promise<{ items: LocationItem[]; source: "backend" | "local" }> {
  const remote = await getJSON<LocationItem[]>("/api/locations");
  if (remote && remote.length) return { items: remote, source: "backend" };

  return {
    items: localLocations.map((l) => ({
      id: l.id,
      name: l.name,
      city: l.city,
      latitude: l.latitude,
      longitude: l.longitude,
    })),
    source: "local",
  };
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

/** 后端是否可用（用于界面上标注数据来源） */
export async function backendAlive(): Promise<boolean> {
  const data = await getJSON<{ status: string }>("/api/health");
  return data?.status === "ok";
}

/** 本地回退：用演示数据拼出图片展示页需要的内容 */
function localMediaPage(memoryId: string): MemoryMediaPage | null {
  const memory = localMemories.find((m) => m.id === memoryId);
  if (!memory) return null;

  const idx = localMemories.findIndex((m) => m.id === memoryId);
  const urls: string[] = [];
  if (memory.cover) urls.push(memory.cover);
  const start = idx % allImages.length;
  for (let k = 0; k < 5; k++) {
    const candidate = allImages[(start + k) % allImages.length];
    if (!urls.includes(candidate)) urls.push(candidate);
  }

  return {
    memory_id: memory.id,
    title: memory.title,
    summary: memory.summary,
    happened_at: memory.happenedAt,
    content: memory.content,
    location_name: localLocations.find((l) => l.id === memory.locationId)?.name,
    person_names: memory.personIds
      .map((id) => localPersons.find((p) => p.id === id)?.name)
      .filter((n): n is string => Boolean(n)),
    tags: memory.tags,
    photos: urls.map((url, i) => ({
      id: i + 1,
      url,
      caption: `${memory.title} · ${i + 1}`,
    })),
    source: "local",
  };
}

/** 某条记忆的图片展示页数据 */
export async function fetchMemoryMedia(memoryId: string): Promise<MemoryMediaPage | null> {
  const remote = await getJSON<{
    memory_id: string;
    title: string;
    summary: string;
    happened_at: string;
    photos: PhotoItem[];
  }>(`/api/memories/${memoryId}/media`);

  if (remote && remote.photos?.length) {
    const detail = await getJSON<{
      content?: string;
      location?: { name?: string } | null;
      person_ids?: string[];
      tags?: string[];
    }>(`/api/memories/${memoryId}`);

    return {
      ...remote,
      content: detail?.content,
      location_name: detail?.location?.name,
      person_names: (detail?.person_ids ?? [])
        .map((id) => localPersons.find((p) => p.id === id)?.name)
        .filter((n): n is string => Boolean(n)),
      tags: detail?.tags ?? [],
      source: "backend",
    };
  }

  return localMediaPage(memoryId);
}

/** 记忆列表（后端优先） */
export async function fetchMemories(params?: { year?: number; limit?: number }): Promise<{
  items: MemoryBrief[];
  source: "backend" | "local";
}> {
  const query = new URLSearchParams();
  if (params?.year) query.set("year", String(params.year));
  query.set("limit", String(params?.limit ?? 200));

  const remote = await getJSON<MemoryBrief[]>(`/api/memories?${query.toString()}`);
  if (remote && remote.length) {
    return { items: remote, source: "backend" };
  }

  return {
    items: localMemories.map((m) => ({
      id: m.id,
      title: m.title,
      summary: m.summary,
      happened_at: m.happenedAt,
      location_id: m.locationId,
      person_ids: m.personIds,
      tags: m.tags,
      cover: m.cover,
      media_count: m.mediaCount,
    })),
    source: "local",
  };
}
