// 拾光 · 本地查询层（Memory-RAG 的演示替身：规则检索 + 白名单 UI Action）
// 后端接入后，这些函数替换为 /api/* 调用即可，页面不需要改。

import {
  memories,
  persons,
  locations,
  stories,
  type ShiguangMemory,
  type ShiguangPerson,
  type ShiguangLocation,
} from "./memories";

export type AssistantActionType =
  | "NAVIGATE_TIMELINE"
  | "OPEN_MEMORY"
  | "FILTER_BY_PERSON"
  | "FOCUS_MAP_LOCATION"
  | "PREVIEW_STORY"
  | "START_RECALL_MODE";

export interface AssistantAction {
  type: AssistantActionType;
  label: string;
  params: Record<string, string>;
}

export interface AssistantAnswer {
  answer: string;
  evidenceMemoryIds: string[];
  action?: AssistantAction;
  uncertainty?: string;
}

// ── 基础工具 ─────────────────────────────────────────

export const personById = (id: string): ShiguangPerson | undefined =>
  persons.find((p) => p.id === id);

export const locationById = (id: string): ShiguangLocation | undefined =>
  locations.find((l) => l.id === id);

export const memoryById = (id: string): ShiguangMemory | undefined =>
  memories.find((m) => m.id === id);

export function memoryDate(m: ShiguangMemory): Date {
  return new Date(m.happenedAt);
}

export function yearOf(m: ShiguangMemory): number {
  return memoryDate(m).getFullYear();
}

export function allYears(): number[] {
  return Array.from(new Set(memories.map(yearOf))).sort((a, b) => b - a);
}

export function sortedMemories(year?: number): ShiguangMemory[] {
  const list = year ? memories.filter((m) => yearOf(m) === year) : memories;
  return [...list].sort((a, b) => memoryDate(a).getTime() - memoryDate(b).getTime());
}

export function personNames(m: ShiguangMemory): string[] {
  return m.personIds.map((id) => personById(id)?.name ?? "未知");
}

export function locationName(m: ShiguangMemory): string {
  return locationById(m.locationId)?.name ?? "未知地点";
}

// ── 时间线（按年/月聚合）─────────────────────────────

export interface MonthGroup {
  month: number;
  label: string;
  memories: ShiguangMemory[];
}

export interface YearGroup {
  year: number;
  count: number;
  photoCount: number;
  cities: string[];
  people: ShiguangPerson[];
  tags: string[];
  months: MonthGroup[];
  cover: string;
  headline: string;
}

export function buildTimeline(source: ShiguangMemory[] = memories): YearGroup[] {
  const years = Array.from(new Set(source.map(yearOf))).sort((a, b) => b - a);
  return years.map((year) => {
    const list = source
      .filter((m) => yearOf(m) === year)
      .sort((a, b) => memoryDate(a).getTime() - memoryDate(b).getTime());
    const cityIds = Array.from(new Set(list.map((m) => m.locationId)));
    const personIds = Array.from(new Set(list.flatMap((m) => m.personIds)));
    const tagCount = new Map<string, number>();
    list.forEach((m) => m.tags.forEach((t) => tagCount.set(t, (tagCount.get(t) ?? 0) + 1)));
    const months = Array.from(new Set(list.map((m) => memoryDate(m).getMonth())))
      .sort((a, b) => a - b)
      .map((month) => ({
        month,
        label: `${month + 1} 月`,
        memories: list.filter((m) => memoryDate(m).getMonth() === month),
      }));
    const featured = [...list].sort((a, b) => b.importance - a.importance)[0];
    return {
      year,
      count: list.length,
      photoCount: list.reduce((acc, m) => acc + m.mediaCount, 0),
      cities: cityIds.map((id) => locationById(id)?.name ?? "").filter(Boolean),
      people: personIds
        .map((id) => personById(id))
        .filter((p): p is ShiguangPerson => Boolean(p) && p!.id !== "per_me"),
      tags: Array.from(tagCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([t]) => t),
      months,
      cover: featured?.cover ?? "/images/1.webp",
      headline: featured?.title ?? `${year} 年`,
    };
  });
}

export const overview = {
  yearSpan: allYears().length ? allYears()[0] - allYears()[allYears().length - 1] + 1 : 0,
  memoryCount: memories.length,
  photoCount: memories.reduce((acc, m) => acc + m.mediaCount, 0),
  placeCount: new Set(memories.map((m) => m.locationId)).size,
  personCount: persons.length - 1,
  storyCount: stories.length,
  cityCount: new Set(memories.map((m) => locationById(m.locationId)?.city ?? "")).size,
};

// ── 地图聚合 ─────────────────────────────────────────

export interface MapCluster {
  location: ShiguangLocation;
  count: number;
  photoCount: number;
  years: number[];
  people: ShiguangPerson[];
  topTags: string[];
  cover: string;
  memories: ShiguangMemory[];
}

export function buildMapClusters(yearRange?: [number, number]): MapCluster[] {
  const list = yearRange
    ? memories.filter((m) => yearOf(m) >= yearRange[0] && yearOf(m) <= yearRange[1])
    : memories;
  const byLoc = new Map<string, ShiguangMemory[]>();
  list.forEach((m) => {
    const arr = byLoc.get(m.locationId) ?? [];
    arr.push(m);
    byLoc.set(m.locationId, arr);
  });
  return Array.from(byLoc.entries())
    .map(([locId, ms]) => {
      const loc = locationById(locId)!;
      const tagCount = new Map<string, number>();
      ms.forEach((m) => m.tags.forEach((t) => tagCount.set(t, (tagCount.get(t) ?? 0) + 1)));
      return {
        location: loc,
        count: ms.length,
        photoCount: ms.reduce((acc, m) => acc + m.mediaCount, 0),
        years: Array.from(new Set(ms.map(yearOf))).sort(),
        people: Array.from(new Set(ms.flatMap((m) => m.personIds)))
          .map((id) => personById(id))
          .filter((p): p is ShiguangPerson => Boolean(p) && p!.id !== "per_me"),
        topTags: Array.from(tagCount.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([t]) => t),
        cover: ms[0].cover,
        memories: ms.sort((a, b) => memoryDate(b).getTime() - memoryDate(a).getTime()),
      };
    })
    .sort((a, b) => b.count - a.count);
}

// ── 人物网络 ─────────────────────────────────────────

export interface PersonNode {
  person: ShiguangPerson;
  sharedCount: number;
  firstAt: ShiguangMemory;
  lastAt: ShiguangMemory;
  locations: string[];
  tags: string[];
  stories: number;
}

/** 用后端拉回来的数据算人物网络（前端本地数据也能走这里，方便统一） */
export function buildPeopleFrom(
  personList: ShiguangPerson[],
  memoryList: ShiguangMemory[],
  locationList?: { id: string; name: string }[],
): PersonNode[] {
  const locationName = (id: string) =>
    locationList?.find((l) => l.id === id)?.name ?? locationById(id)?.name ?? "";

  return personList
    .filter((p) => p.id !== "per_me")
    .map((p) => {
      const ms = memoryList
        .filter((m) => m.personIds.includes(p.id))
        .sort((a, b) => memoryDate(a).getTime() - memoryDate(b).getTime());
      const tagCount = new Map<string, number>();
      ms.forEach((m) => m.tags.forEach((t) => tagCount.set(t, (tagCount.get(t) ?? 0) + 1)));
      return {
        person: p,
        sharedCount: ms.length,
        firstAt: ms[0],
        lastAt: ms[ms.length - 1],
        locations: Array.from(new Set(ms.map((m) => locationName(m.locationId)).filter(Boolean))),
        tags: Array.from(tagCount.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([t]) => t),
        stories: 0,
      };
    })
    .filter((n) => n.sharedCount > 0)
    .sort((a, b) => b.sharedCount - a.sharedCount);
}

export function buildPeople(): PersonNode[] {
  return buildPeopleFrom(persons, memories);
}

export function sharedMemoriesFrom(memoryList: ShiguangMemory[], personId: string): ShiguangMemory[] {
  return memoryList
    .filter((m) => m.personIds.includes(personId))
    .sort((a, b) => memoryDate(a).getTime() - memoryDate(b).getTime());
}

export function sharedMemories(personId: string): ShiguangMemory[] {
  return sharedMemoriesFrom(memories, personId);
}

// ── AI 回忆模式（预制场景数据）───────────────────────

/** 用后端拉回来的记忆现搭一套回放场景（本地示例数据只作兜底） */
export function buildRecallFrom(
  year: number,
  list: ShiguangMemory[],
  people: ShiguangPerson[] = [],
  locations: { id: string; name: string }[] = [],
): RecallScene[] {
  const yearList = list
    .filter((m) => (m.happenedAt || "").startsWith(String(year)))
    .sort((a, b) => memoryDate(a).getTime() - memoryDate(b).getTime());
  if (!yearList.length) return [];

  const photoCount = yearList.reduce((sum, m) => sum + (m.mediaCount || 0), 0);
  const cityNames = Array.from(
    new Set(yearList.map((m) => locations.find((l) => l.id === m.locationId)?.name).filter(Boolean)),
  ) as string[];
  const personCount = new Map<string, number>();
  yearList.forEach((m) =>
    m.personIds.filter((id) => id !== "per_me").forEach((id) => personCount.set(id, (personCount.get(id) ?? 0) + 1)),
  );
  const topPeople = Array.from(personCount.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({ person: people.find((p) => p.id === id)!, count }))
    .filter((x) => x.person)
    .slice(0, 4);
  const tags = Array.from(new Set(yearList.flatMap((m) => m.tags))).slice(0, 6);

  const scenes: RecallScene[] = [
    {
      kind: "opening",
      title: `${year}`,
      subtitle: "的那段时光",
      text: `这一年，你留下了 ${yearList.length} 段记忆。我们把它们重新排了一遍。`,
    },
    {
      kind: "stats",
      title: "这一年的数字",
      stats: [
        { label: "记忆", value: `${yearList.length} 段` },
        { label: "照片", value: `${photoCount} 张` },
        { label: "城市", value: `${cityNames.length} 座` },
        { label: "同行者", value: `${topPeople.length} 位` },
      ],
      text: tags.length ? `反复出现的关键词：${tags.join(" · ")}` : undefined,
    },
  ];

  if (cityNames.length) {
    scenes.push({
      kind: "map",
      title: "点亮过的城市",
      cities: cityNames.slice(0, 6).map((name) => ({
        name,
        count: yearList.filter((m) => locations.find((l) => l.id === m.locationId)?.name === name).length,
        cover: yearList.find((m) => locations.find((l) => l.id === m.locationId)?.name === name)?.cover || "",
      })),
      text: `这一年你去过 ${cityNames.length} 个地方。`,
    });
  }

  // 这一年的记忆**全部**放进去，按时间顺序一幕幕走；视频也用它的关键帧画面出场
  const stills = yearList.filter((m) => m.cover);
  stills.forEach((m, i) => {
    scenes.push({
      kind: "photos",
      memoryId: m.id,
      title: i === 0 ? "第一组画面" : m.title,
      cover: m.cover,
      text: m.summary,
      subtitle: m.sourceType === "video" ? `${m.title}（视频）` : m.title,
    });
  });

  if (topPeople.length) {
    scenes.push({
      kind: "people",
      title: "一起出现的人",
      people: topPeople,
      text: `出现最多的是${topPeople[0].person.name}。`,
    });
  }

  scenes.push({
    kind: "ending",
    title: `${year}，先到这里`,
    text: `这一年有 ${yearList.length} 段记忆被留了下来。`,
  });
  return scenes;
}

export interface RecallScene {
  kind: "opening" | "stats" | "photos" | "map" | "people" | "months" | "summary" | "ending";
  title: string;
  subtitle?: string;
  text?: string;
  cover?: string;
  stats?: { label: string; value: string }[];
  cities?: { name: string; count: number; cover: string }[];
  people?: { person: ShiguangPerson; count: number }[];
  /** 这一幕属于哪条记忆（照片幕用来取这条记忆的全部照片） */
  memoryId?: string;
  months?: { label: string; cover: string; title: string; date: string }[];
}

export function buildRecall(year: number): RecallScene[] {
  const list = sortedMemories(year);
  if (!list.length) return [];
  const group = buildTimeline().find((g) => g.year === year)!;
  const clusters = buildMapClusters().filter((c) => c.years.includes(year));
  const personCount = new Map<string, number>();
  list.forEach((m) =>
    m.personIds
      .filter((id) => id !== "per_me")
      .forEach((id) => personCount.set(id, (personCount.get(id) ?? 0) + 1)),
  );
  const topPeople = Array.from(personCount.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({ person: personById(id)!, count }))
    .filter((x) => x.person)
    .slice(0, 4);

  const scenes: RecallScene[] = [
    {
      kind: "opening",
      title: `${year}`,
      subtitle: "的那段时光",
      text: `这一年，你留下了 ${group.count} 段记忆。我们把它们重新排了一遍。`,
    },
    {
      kind: "stats",
      title: "这一年的数字",
      stats: [
        { label: "记忆", value: `${group.count} 段` },
        { label: "照片", value: `${group.photoCount} 张` },
        { label: "城市", value: `${group.cities.length} 座` },
        { label: "同行者", value: `${topPeople.length} 位` },
      ],
      text: group.tags.length ? `反复出现的关键词：${group.tags.join(" · ")}` : undefined,
    },
  ];

  if (clusters.length) {
    scenes.push({
      kind: "map",
      title: "点亮过的城市",
      cities: clusters.slice(0, 6).map((c) => ({ name: c.location.name, count: c.count, cover: c.cover })),
      text: `最常出现的是${clusters[0].location.name}，那里有 ${clusters[0].count} 段记忆。`,
    });
  }

  scenes.push({
    kind: "photos",
    title: "第一组画面",
    cover: list[0].cover,
    text: list[0].summary,
    subtitle: list[0].title,
  });

  if (topPeople.length) {
    scenes.push({
      kind: "people",
      title: "这一年，陪在身边的人",
      people: topPeople,
    });
  }

  scenes.push({
    kind: "months",
    title: "按月份重走一遍",
    months: group.months.map((mg) => {
      const featured = [...mg.memories].sort((a, b) => b.importance - a.importance)[0];
      return {
        label: mg.label,
        cover: featured.cover,
        title: featured.title,
        date: featured.happenedAt.slice(0, 10),
      };
    }),
  });

  scenes.push({
    kind: "summary",
    title: "拾光为你写了这段",
    text: buildYearNarrative(year),
  });

  scenes.push({
    kind: "ending",
    title: "回忆到这里",
    text: "真实的记忆不会结束，它只是等下一次被重新看见。",
  });

  return scenes;
}

export function buildYearNarrative(year: number, source: ShiguangMemory[] = memories): string {
  const list = source
    .filter((m) => yearOf(m) === year)
    .sort((a, b) => memoryDate(a).getTime() - memoryDate(b).getTime());
  if (!list.length) return "这一年还没有留下记忆。";
  const cities = Array.from(new Set(list.map((m) => locationById(m.locationId)?.name ?? "")));
  const people = Array.from(
    new Set(list.flatMap((m) => m.personIds.filter((id) => id !== "per_me"))),
  )
    .map((id) => personById(id)?.name ?? "")
    .filter(Boolean);
  const highlights = [...list].sort((a, b) => b.importance - a.importance).slice(0, 2);
  const emotions = Array.from(new Set(list.map((m) => m.emotion)));
  return (
    `${year} 年从${list[0].title}开始，到${list[list.length - 1].title}结束，` +
    `中间经过 ${cities.join("、")} ${cities.length} 座城市。` +
    (people.length ? `与你一起留下记录的是${people.join("、")}。` : "") +
    `最重要的一段是「${highlights.map((h) => h.title).join("」和「")}」。` +
    `这一年的情绪关键词：${emotions.slice(0, 5).join("、")}。`
  );
}

// ── 小拾 AI（Memory-RAG 演示检索）────────────────────

const QUESTION_SAMPLES = [
  "我第一次去厦门是什么时候？",
  "帮我找大学期间和小林有关的事情",
  "2024 年我去过哪些城市？",
  "把我和父亲的共同回忆整理成一个故事",
  "帮我回忆 2023",
  "哪些地方承载了最多的记忆？",
];

export const assistantSamples = QUESTION_SAMPLES;

function evidence(list: ShiguangMemory[], n = 3): string[] {
  return [...list]
    .sort((a, b) => memoryDate(b).getTime() - memoryDate(a).getTime())
    .slice(0, n)
    .map((m) => m.id);
}

export function askAssistant(raw: string): AssistantAnswer {
  const q = raw.trim();
  if (!q) {
    return { answer: "你可以问我任何关于自己记忆的问题。", evidenceMemoryIds: [] };
  }

  // 回忆模式：帮我回忆 2023 / 回忆 2023
  if (/(回忆|重温|回顾)/.test(q)) {
    const year = Number((q.match(/(19|20)\d{2}/) ?? [])[0]);
    if (year && sortedMemories(year).length) {
      return {
        answer: `好，开始播放 ${year} 年的回忆。这一年有 ${sortedMemories(year).length} 段记忆，我会按照片、城市、人物和月份讲给你听。`,
        evidenceMemoryIds: evidence(sortedMemories(year)),
        action: { type: "START_RECALL_MODE", label: `播放 ${year} 回忆`, params: { year: String(year) } },
      };
    }
    return {
      answer: "告诉我一个年份，比如“帮我回忆 2023”，我就把那一年的记忆排成一段叙事。",
      evidenceMemoryIds: [],
    };
  }

  // 时间范围 + 人物
  if (/大学/.test(q) && /小林/.test(q)) {
    const ms = memories.filter(
      (m) => m.personIds.includes("per_lin") && yearOf(m) <= 2019,
    );
    return {
      answer: `大学期间你和林一共有 ${ms.length} 段记录，最早是 ${ms[0].happenedAt.slice(0, 10)} 的「${ms[0].title}」，地点在${locationName(ms[0])}。`,
      evidenceMemoryIds: evidence(ms),
      action: { type: "FILTER_BY_PERSON", label: "在时间线按小林筛选", params: { personId: "per_lin" } },
    };
  }

  // 无答案问题（先于其它规则，避免误命中）
  if (/(工资|密码|身份证|银行卡|病史)/.test(q)) {
    return {
      answer: "你的记忆库里没有和这个问题相关的内容，我不会替你推测。",
      evidenceMemoryIds: [],
      uncertainty: "未在记忆中检索到依据，因此不作回答。",
    };
  }

  // 地点：厦门
  const loc = locations.find((l) => q.includes(l.name) || q.includes(l.city));
  if (loc) {
    const ms = memories.filter((m) => m.locationId === loc.id);
    if (ms.length) {
      const first = [...ms].sort((a, b) => memoryDate(a).getTime() - memoryDate(b).getTime())[0];
      const years = Array.from(new Set(ms.map(yearOf))).sort();
      return {
        answer: `和${loc.name}有关的最早一段记忆出现在 ${first.happenedAt.slice(0, 10)}，标题是「${first.title}」。你一共在${loc.name}留下 ${ms.length} 段记忆，覆盖 ${years.join("、")} 年。`,
        evidenceMemoryIds: evidence(ms),
        action: { type: "FOCUS_MAP_LOCATION", label: `在地图定位${loc.name}`, params: { locationId: loc.id } },
      };
    }
  }

  // 年份 + 城市
  const yearMatch = Number((q.match(/(19|20)\d{2}/) ?? [])[0]);
  if (yearMatch && /(城市|去过|哪里|哪些地方)/.test(q)) {
    const ms = sortedMemories(yearMatch);
    if (!ms.length) {
      return {
        answer: `${yearMatch} 年的记忆库里没有记录，我不会替你编一个答案。`,
        evidenceMemoryIds: [],
        uncertainty: "该年份没有可用证据。",
      };
    }
    const cities = Array.from(new Set(ms.map((m) => locationById(m.locationId)?.name ?? "")));
    return {
      answer: `${yearMatch} 年你去过 ${cities.length} 个地方：${cities.join("、")}。相关记忆 ${ms.length} 段。`,
      evidenceMemoryIds: evidence(ms),
      action: { type: "NAVIGATE_TIMELINE", label: `在时间线查看 ${yearMatch}`, params: { year: String(yearMatch) } },
    };
  }

  // 地点密度
  if (/(哪|哪些).*(地方|城市).*(最多|承载)/.test(q) || /最多的记忆/.test(q)) {
    const clusters = buildMapClusters();
    return {
      answer: `承载记忆最多的是${clusters[0].location.name}，共 ${clusters[0].count} 段；其次是${clusters[1]?.location.name ?? "—"} ${clusters[1]?.count ?? 0} 段。`,
      evidenceMemoryIds: evidence(clusters[0].memories),
      action: { type: "FOCUS_MAP_LOCATION", label: `在地图定位${clusters[0].location.name}`, params: { locationId: clusters[0].location.id } },
    };
  }

  // 人物
  const person =
    persons.find((p) => p.id !== "per_me" && (q.includes(p.name) || p.aliases.some((a) => q.includes(a)))) ??
    (/父亲|爸爸|老爸/.test(q) ? personById("per_father") : undefined);
  if (person) {
    const ms = sharedMemories(person.id);
    if (ms.length) {
      const story = stories.find(
        (s) => s.memoryIds.some((id) => ms.some((m) => m.id === id)),
      );
      const sp = stories.find((s) => s.title.includes(person.name));
      return {
        answer: `你和${person.name}（${person.relationLabel}）共有 ${ms.length} 段共同记忆，从 ${ms[0].happenedAt.slice(0, 10)} 的「${ms[0].title}」到 ${ms[ms.length - 1].happenedAt.slice(0, 10)} 的「${ms[ms.length - 1].title}」。`,
        evidenceMemoryIds: evidence(ms),
        action: story
          ? { type: "PREVIEW_STORY", label: `预览《${(sp ?? story).title}》`, params: { storyId: (sp ?? story).id } }
          : { type: "FILTER_BY_PERSON", label: `在时间线筛选${person.name}`, params: { personId: person.id } },
      };
    }
  }

  // 主题 / 标签
  const tagHit = memories.find((m) => q.length >= 2 && m.tags.some((t) => q.includes(t)));
  if (tagHit) {
    const ms = memories.filter((m) => m.tags.some((t) => q.includes(t)));
    return {
      answer: `和「${tagHit.tags.find((t) => q.includes(t))}」相关的记忆有 ${ms.length} 段，最早出现在 ${ms[0].happenedAt.slice(0, 10)}。`,
      evidenceMemoryIds: evidence(ms),
      action: { type: "NAVIGATE_TIMELINE", label: "在时间线查看", params: { year: String(yearOf(ms[0])) } },
    };
  }

  return {
    answer: `我在你的记忆库里没有找到能回答这个问题的依据。可以换个说法，或试试：${QUESTION_SAMPLES.slice(0, 3).join("；")}。`,
    evidenceMemoryIds: [],
    uncertainty: "无检索依据，已放弃生成答案。",
  };
}
