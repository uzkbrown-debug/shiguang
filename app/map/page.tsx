"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin,
  X,
  Search,
  RefreshCw,
  Route as RouteIcon,
  Users,
  Lock,
  Globe,
  Check,
  Star,
  ChevronRight,
  Film,
  BookOpen,
  Navigation,
  SlidersHorizontal,
} from "lucide-react";
import type { MapLine, MapPin as MapPinItem } from "@/components/shiguang/MemoryMap";
import {
  colorFor,
  fetchExplore,
  fetchGuides,
  setVisit,
  VISIBILITY_LABEL,
  type ExploreOwner,
  type ExplorePayload,
  type ExplorePoint,
  type GuideBrief,
} from "@/lib/travel";

const MemoryMap = dynamic(() => import("@/components/shiguang/MemoryMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-950">
      <span className="text-sm tracking-widest bg-gradient-to-r from-cyan-300 via-sky-400 to-violet-400 bg-clip-text text-transparent">
        地图加载中…
      </span>
    </div>
  ),
});

const VIS_ICON = { private: Lock, friends: Users, public: Globe } as const;

interface MemoryDetail {
  id: string;
  content?: string | null;
  summary?: string | null;
  costs?: { label: string; amount?: number | null }[];
  tips?: string | null;
  transport_info?: string | null;
  stay_info?: string | null;
}

/** 把「先说数 / 我的走法」两行摘出来，其余算正文 */
function splitMemoryContent(content: string | null | undefined) {
  const lines = (content || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const intro = lines.filter((l) => l.startsWith("先说数") || l.startsWith("我的走法"));
  const body = lines.filter((l) => !intro.includes(l)).join("\n");
  return { intro, body };
}

function MapInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState<ExplorePayload | null>(null);
  const [guides, setGuides] = useState<GuideBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState(params.get("scope") ?? "world");
  const [year, setYear] = useState("all");
  const [hiddenOwners, setHiddenOwners] = useState<Set<string>>(new Set());
  const [pickedPersons, setPickedPersons] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null);
  const [cardTab, setCardTab] = useState<"guides" | "routes">("guides");
  const [activeGuide, setActiveGuide] = useState<GuideBrief | null>(null);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
  // 筛选面板默认收起：地图页顶部别堆那么多按钮
  const [filtersOpen, setFiltersOpen] = useState(false);
  // 选中光点时，拉这条记忆的完整内容（地图抽屉按攻略模板显示）
  const [detail, setDetail] = useState<MemoryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    return Promise.all([fetchExplore(scope, year), fetchGuides({ scope })])
      .then(([ex, gs]) => {
        setData(ex);
        setGuides(gs ?? []);
      })
      .finally(() => setLoading(false));
  }, [scope, year]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const owners = data?.owners ?? [];
  const colorOf = useMemo(() => {
    const map = new Map<string, string>();
    owners.forEach((o, i) => map.set(o.id, colorFor(i)));
    return map;
  }, [owners]);

  const pointKey = (p: ExplorePoint) => p.memory_id;

  // 组合筛选：归属者 + 人物 + 关键词 + 当前攻略
  const visiblePoints = useMemo(() => {
    let list = data?.points ?? [];
    if (hiddenOwners.size) list = list.filter((p) => !hiddenOwners.has(p.owner_id));
    if (pickedPersons.size)
      list = list.filter((p) => p.person_ids.some((pid) => pickedPersons.has(pid)));
    if (q.trim()) {
      const kw = q.trim().toLowerCase();
      list = list.filter((p) =>
        `${p.title}${p.summary ?? ""}${p.location_name}${p.city ?? ""}${p.tags.join("")}${(p.person_names ?? []).join("")}`
          .toLowerCase()
          .includes(kw),
      );
    }
    if (activeGuide) {
      const gi = guides.find((g) => g.id === activeGuide.id);
      const keys = [gi?.destination ?? "", gi?.title ?? ""].filter(Boolean);
      list = list.filter((p) => keys.some((k) => k.includes(p.location_name) || p.location_name.includes(p.city ?? "###")));
      if (!list.length) list = (data?.points ?? []).filter((p) => p.owner_id === activeGuide.user_id);
    }
    return list;
  }, [data, hiddenOwners, pickedPersons, q, activeGuide, guides]);

  const visibleKeys = useMemo(() => new Set(visiblePoints.map(pointKey)), [visiblePoints]);

  // 选中的路线：给它的站点加高亮（地图上不再画连线）
  const routeStopNames = useMemo(() => {
    if (!activeRouteId) return null;
    const route = (data?.routes ?? []).find((r) => r.id === activeRouteId);
    if (!route) return null;
    return route.points.map((p) => p.name);
  }, [data, activeRouteId]);

  const pins = useMemo<MapPinItem[]>(
    () =>
      (data?.points ?? []).map((p) => {
        const onRoute = Boolean(
          routeStopNames?.some((n) => n && (p.location_name.includes(n) || n.includes(p.location_name))),
        );
        return {
          key: pointKey(p),
          lat: p.latitude,
          lng: p.longitude,
          color: colorOf.get(p.owner_id) ?? "#38bdf8",
          cover: p.cover,
          title: p.title,
          ownerName: owners.find((o) => o.id === p.owner_id)?.nickname ?? "某人",
          size: onRoute ? 30 : p.visit === "visited" ? 24 : 20,
          active: selected === pointKey(p) || onRoute,
          visited: p.visit === "visited",
          dim: !visibleKeys.has(pointKey(p)),
        };
      }),
    [data, colorOf, owners, selected, visibleKeys, routeStopNames],
  );

  const point = useMemo(
    () => (data?.points ?? []).find((p) => pointKey(p) === selected) ?? null,
    [data, selected],
  );

  // 选中就拉这条记忆的完整内容：地图抽屉要和攻略一个写法
  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let alive = true;
    setDetailLoading(true);
    fetch(`/api/memories/${selected}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive) setDetail(d as MemoryDetail | null);
      })
      .catch(() => {
        if (alive) setDetail(null);
      })
      .finally(() => {
        if (alive) setDetailLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selected]);

  const { intro: introLines, body: detailBody } = useMemo(
    () => splitMemoryContent(detail?.content ?? point?.summary),
    [detail, point],
  );
  const detailCosts = detail?.costs ?? [];
  const detailTotal = detailCosts.reduce(
    (sum, c) => sum + (typeof c.amount === "number" ? c.amount : 0),
    0,
  );

  const sameSpot = useMemo(
    () =>
      point
        ? (data?.points ?? []).filter(
            (p) => p.location_id === point.location_id && pointKey(p) !== pointKey(point),
          )
        : [],
    [data, point],
  );

  const mark = async (state: "visited" | "wish" | "none") => {
    if (!point) return;
    await setVisit(point.memory_id, state);
    setData((prev) =>
      prev
        ? {
            ...prev,
            points: prev.points.map((p) =>
              p.memory_id === point.memory_id ? { ...p, visit: state === "none" ? null : state } : p,
            ),
          }
        : prev,
    );
  };

  const focusOn = (p: ExplorePoint) => {
    setSelected(pointKey(p));
    setFocus({ lat: p.latitude, lng: p.longitude });
  };

  const ownerChip = (o: ExploreOwner, size: "sm" | "md" = "md") => {
    const color = colorOf.get(o.id) ?? "#38bdf8";
    const off = hiddenOwners.has(o.id);
    const box = size === "sm" ? "w-7 h-7 text-[10px]" : "w-11 h-11 text-xs";
    return (
      <button
        key={o.id}
        onClick={() =>
          setHiddenOwners((prev) => {
            const next = new Set(prev);
            if (next.has(o.id)) next.delete(o.id);
            else next.add(o.id);
            return next;
          })
        }
        title={off ? `显示 ${o.nickname}` : `隐藏 ${o.nickname}`}
        className="flex flex-col items-center gap-1 shrink-0"
      >
        <span
          className={`${box} rounded-full overflow-hidden flex items-center justify-center font-medium transition-all`}
          style={{
            border: `${size === "sm" ? 1.5 : 2}px solid ${off ? "#64748b" : color}`,
            boxShadow: off ? "none" : `0 0 ${size === "sm" ? 8 : 12}px ${color}88`,
            opacity: off ? 0.4 : 1,
            background: o.avatar ? undefined : `${color}33`,
            color: off ? "#94a3b8" : color,
          }}
        >
          {o.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={o.avatar} alt="" className="w-full h-full object-cover" />
          ) : (
            o.nickname.slice(0, 1)
          )}
        </span>
        {size === "md" && (
          <span className={`text-[10px] ${off ? "text-slate-400" : "text-slate-600 dark:text-slate-300"}`}>
            {o.is_me ? "我" : o.nickname}
          </span>
        )}
      </button>
    );
  };

  const activeChip = (label: string, onClear: () => void) => (
    <button
      key={label}
      onClick={onClear}
      className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-300 text-[10px]"
    >
      {label}
      <X className="w-2.5 h-2.5" />
    </button>
  );

  const total = data?.points.length ?? 0;
  const visited = data?.visited_count ?? 0;
  const progress = total ? Math.round((visited / total) * 100) : 0;

  return (
    <div className="w-full py-4 md:py-6 relative z-10">
      <div className="max-w-[1400px] mx-auto px-3 sm:px-5">
        {/* 顶部：搜索 + 视角 */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <MapPin className="w-5 h-5 text-sky-500" />
          <h1
            className="text-lg md:text-2xl font-bold text-slate-800 dark:text-slate-100"
            style={{ fontFamily: "'Noto Serif SC', serif" }}
          >
            旅行巡礼地图
          </h1>
          <p className="w-full text-[11px] text-slate-500 dark:text-slate-400">
            先说数：{total} 个足迹点 · {owners.length} 位记录者 · {guides.length} 条攻略 /{" "}
            {data?.routes?.length ?? 0} 条路线
            <span className="ml-2 opacity-70">点光点就能看这条的完整写法</span>
          </p>
          <button
            onClick={load}
            title="重新加载"
            className="p-2 rounded-lg text-slate-400 hover:text-sky-500 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <span className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜城市、地点、标签、人物"
                className="w-52 md:w-64 pl-9 pr-3 py-2 rounded-xl bg-white/50 dark:bg-white/5 border border-white/50 dark:border-white/10 text-xs text-slate-700 dark:text-slate-100 outline-none focus:border-sky-400/60"
              />
            </span>
            {(
              [
                ["me", "只看我"],
                ["all", "好友"],
                ["world", "全世界"],
              ] as [string, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setScope(value)}
                className={`px-3 py-2 rounded-xl text-[11px] transition-colors ${
                  scope === value
                    ? "bg-sky-500 text-white"
                    : "glass-button text-slate-600 dark:text-slate-300"
                }`}
                title={
                  value === "world"
                    ? "包含陌生人公开分享的足迹"
                    : value === "all"
                      ? "我和我的好友"
                      : "只有我自己"
                }
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => {
                setCardTab("routes");
                setActiveGuide(null);
                setActiveRouteId(null);
              }}
              className={`px-3 py-2 rounded-xl text-[11px] transition-colors glass-button text-slate-600 dark:text-slate-300`}
            >
              路线
            </button>
          </div>
        </div>

        {/* 筛选：默认只露一小条（我的 + 前几位好友 + 已生效条件），需要时再展开 */}
        <div className="glass-card rounded-2xl border-white/40 dark:border-white/10 px-3 py-2.5 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              {owners.slice(0, 6).map((o) => ownerChip(o, "sm"))}
              {owners.length > 6 && (
                <button
                  onClick={() => setFiltersOpen(true)}
                  title="还有更多人，展开看全部"
                  className="w-7 h-7 rounded-full bg-slate-500/10 text-slate-500 dark:text-slate-400 text-[10px]"
                >
                  +{owners.length - 6}
                </button>
              )}
            </div>

            {hiddenOwners.size > 0 && activeChip(`隐藏 ${hiddenOwners.size} 人`, () => setHiddenOwners(new Set()))}
            {pickedPersons.size > 0 && activeChip(`和谁 ${pickedPersons.size} 人`, () => setPickedPersons(new Set()))}
            {year !== "all" && activeChip(year, () => setYear("all"))}
            {activeGuide && activeChip(`《${activeGuide.title}》`, () => setActiveGuide(null))}

            <div className="ml-auto flex items-center gap-2">
              <span className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-400">
                <Navigation className="w-3 h-3 text-sky-500" />
                已打卡 {visited}/{total}
              </span>
              <button
                onClick={() => setFiltersOpen((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] transition-colors ${
                  filtersOpen
                    ? "bg-sky-500 text-white"
                    : "glass-button text-slate-600 dark:text-slate-300"
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                筛选
              </button>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {filtersOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden"
              >
                <div className="pt-3 mt-3 border-t border-white/10 space-y-3">
                  <div>
                    <p className="text-[10px] text-slate-400 mb-2">看谁的足迹 · 点一下隐藏/显示</p>
                    <div className="flex flex-wrap gap-2.5">{owners.map((o) => ownerChip(o, "md"))}</div>
                  </div>

                  {(data?.person_bar?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-[10px] text-slate-400 mb-2">和谁一起去的</p>
                      <div className="flex flex-wrap gap-2">
                        {(data?.person_bar ?? []).map((p) => {
                          const on = pickedPersons.has(p.id);
                          return (
                            <button
                              key={p.id}
                              onClick={() =>
                                setPickedPersons((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(p.id)) next.delete(p.id);
                                  else next.add(p.id);
                                  return next;
                                })
                              }
                              title={`${p.count} 段记忆里有 TA`}
                              className={`flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full text-[11px] transition-colors ${
                                on
                                  ? "bg-pink-500 text-white"
                                  : "bg-slate-500/10 text-slate-500 dark:text-slate-400"
                              }`}
                            >
                              <span className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center text-[9px] bg-white/20">
                                {p.avatar ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={p.avatar} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  p.name.slice(0, 1)
                                )}
                              </span>
                              {p.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <Navigation className="w-3 h-3 text-sky-500" />
                      已打卡 <b className="text-slate-700 dark:text-slate-100">{visited}</b> / {total}
                      {(data?.wish_count ?? 0) > 0 && (
                        <span className="text-amber-500">· 想去 {data?.wish_count}</span>
                      )}
                    </span>
                    <span className="w-24 h-1.5 rounded-full bg-slate-500/15 overflow-hidden">
                      <span
                        className="block h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </span>

                    {(data?.years?.length ?? 0) > 0 && (
                      <span className="flex items-center gap-1.5 flex-wrap ml-auto">
                        {["all", ...(data?.years ?? [])].map((y) => (
                          <button
                            key={y}
                            onClick={() => setYear(y)}
                            className={`px-2.5 py-1 rounded-full text-[11px] transition-colors ${
                              year === y
                                ? "bg-violet-500 text-white"
                                : "bg-slate-500/10 text-slate-500 dark:text-slate-400"
                            }`}
                          >
                            {y === "all" ? "全部年份" : y}
                          </button>
                        ))}
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      setHiddenOwners(new Set());
                      setPickedPersons(new Set());
                      setYear("all");
                      setActiveGuide(null);
                      setQ("");
                    }}
                    className="text-[10px] text-slate-400 hover:text-sky-500 transition-colors"
                  >
                    清空全部筛选
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 地图 + 右侧详情 */}
        <div className="relative rounded-3xl overflow-hidden glass-card border-white/40 dark:border-white/10">
          <div className="relative z-0 w-full" style={{ aspectRatio: "16 / 9" }}>
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950 text-slate-500 text-xs">
                正在读取大家的足迹…
              </div>
            ) : (
              <MemoryMap
                pins={pins}
                lines={[]}
                selectedId={selected}
                onSelect={setSelected}
                focus={focus}
              />
            )}

            {/* 图例 */}
            <div className="absolute left-3 bottom-3 z-[500] glass-card rounded-xl px-3 py-2 text-[10px] text-slate-600 dark:text-slate-300 space-y-1">
              <p className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                金圈 = 我去过
              </p>
              <p className="opacity-70">点越小、颜色越淡 = 被筛掉了</p>
            </div>
          </div>

          {/* 点详情 */}
          <AnimatePresence>
            {point && (
              <motion.aside
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 40 }}
                transition={{ duration: 0.25 }}
                className="absolute top-0 right-0 bottom-0 w-full sm:w-[380px] bg-slate-950/85 backdrop-blur-xl border-l border-white/10 overflow-y-auto z-[600]"
              >
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: colorOf.get(point.owner_id) }}
                    />
                    <span className="text-[11px] text-slate-300">
                      {owners.find((o) => o.id === point.owner_id)?.nickname ?? "某人"}
                      {owners.find((o) => o.id === point.owner_id)?.is_me && "（我）"}
                    </span>
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/10 text-[10px] text-slate-200">
                      {(() => {
                        const Icon = VIS_ICON[(point.visibility as keyof typeof VIS_ICON) ?? "friends"] ?? Users;
                        return <Icon className="w-2.5 h-2.5" />;
                      })()}
                      {VISIBILITY_LABEL[point.visibility] ?? "好友可见"}
                    </span>
                    <button
                      onClick={() => setSelected(null)}
                      className="ml-auto p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <h2 className="text-base font-bold text-white" style={{ fontFamily: "'Noto Serif SC', serif" }}>
                    {point.title}
                  </h2>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {point.location_name}
                    {point.city && point.city !== point.location_name ? ` · ${point.city}` : ""} ·{" "}
                    {(point.happened_at ?? "").slice(0, 10)}
                  </p>

                  {/* 正文按攻略模板渲染：先说数 / 我的走法 / 正文，再补消费与提醒 */}
                  {detailLoading && (
                    <p className="mt-2 text-[11px] text-slate-500">正在读取这条的完整写法…</p>
                  )}
                  {detail ? (
                    <>
                      <div className="mt-2 space-y-1">
                        {introLines.map((line, i) => (
                          <p
                            key={i}
                            className={
                              line.startsWith("先说数")
                                ? "text-[11px] text-amber-200/90"
                                : "text-[11px] text-sky-200/90"
                            }
                          >
                            {line}
                          </p>
                        ))}
                      </div>
                      {detailBody && (
                        <p className="mt-2 text-xs leading-relaxed text-slate-300 whitespace-pre-wrap">
                          {detailBody}
                        </p>
                      )}
                      {detailTotal > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="px-2 py-0.5 rounded-full bg-amber-400/15 text-[10px] text-amber-200">
                            合计 ¥{detailTotal}
                          </span>
                          {detailCosts.slice(0, 4).map((c, i) => (
                            <span key={i} className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] text-slate-300">
                              {c.label}
                              {typeof c.amount === "number" ? ` ¥${c.amount}` : ""}
                            </span>
                          ))}
                        </div>
                      )}
                      {detail.tips && (
                        <p className="mt-2 text-[11px] leading-relaxed text-amber-200/80 whitespace-pre-wrap">
                          {detail.tips}
                        </p>
                      )}
                    </>
                  ) : (
                    point.summary && (
                      <p className="mt-2 text-xs leading-relaxed text-slate-300">{point.summary}</p>
                    )
                  )}

                  {/* 照片 */}
                  {(point.photos?.length ?? 0) > 0 && (
                    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                      {point.photos!.map((ph, i) => (
                        <a
                          key={`${ph.url}-${i}`}
                          href={ph.url}
                          target="_blank"
                          rel="noreferrer"
                          className="relative shrink-0 w-32 h-24 rounded-xl overflow-hidden border border-white/10"
                        >
                          {ph.kind === "video" ? (
                            <span className="w-full h-full flex items-center justify-center bg-slate-800 text-slate-300">
                              <Film className="w-5 h-5" />
                            </span>
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={ph.url} alt="" className="w-full h-full object-cover" />
                          )}
                        </a>
                      ))}
                    </div>
                  )}

                  {/* 出处 */}
                  {((point.route_refs?.length ?? 0) > 0 || (point.guide_refs?.length ?? 0) > 0) && (
                    <div className="mt-4 space-y-2">
                      <p className="text-[10px] text-slate-400">出处</p>
                      {point.route_refs!.map((r) => (
                        <button
                          key={`${r.route_id}-${r.stop}`}
                          onClick={() => router.push(`/travel/route/${r.route_id}`)}
                          className="w-full flex items-center gap-2 p-2.5 rounded-xl bg-amber-400/10 border border-amber-400/25 text-left hover:bg-amber-400/20 transition-colors"
                        >
                          <RouteIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="flex-1 min-w-0">
                            <span className="block text-[11px] text-amber-200 truncate">{r.title}</span>
                            <span className="block text-[10px] text-slate-400">
                              第 {r.stop} / {r.total} 站{r.transport ? ` · ${r.transport}` : ""}
                              {r.owner_name ? ` · ${r.owner_name}` : ""}
                            </span>
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                        </button>
                      ))}
                      {point.guide_refs!.map((g) => (
                        <button
                          key={`${g.guide_id}-${g.day}`}
                          onClick={() => router.push(`/travel/${g.guide_id}`)}
                          className="w-full flex items-center gap-2 p-2.5 rounded-xl bg-emerald-400/10 border border-emerald-400/25 text-left hover:bg-emerald-400/20 transition-colors"
                        >
                          <BookOpen className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="flex-1 min-w-0">
                            <span className="block text-[11px] text-emerald-200 truncate">{g.title}</span>
                            <span className="block text-[10px] text-slate-400">
                              第 {g.day} 天{g.day_title ? ` · ${g.day_title}` : ""}
                              {g.owner_name ? ` · ${g.owner_name}` : ""}
                            </span>
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* 同行的人 */}
                  {(point.person_names?.length ?? 0) > 0 && (
                    <p className="mt-3 text-[11px] text-slate-400">
                      同行：<span className="text-slate-300">{point.person_names!.join("、")}</span>
                    </p>
                  )}
                  {point.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {point.tags.map((t) => (
                        <span key={t} className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] text-slate-300">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* 打卡 */}
                  <div className="mt-4 flex items-center gap-2">
                    <button
                      onClick={() => mark(point.visit === "visited" ? "none" : "visited")}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] transition-colors ${
                        point.visit === "visited"
                          ? "bg-amber-400 text-slate-900"
                          : "bg-white/10 text-slate-200 hover:bg-white/20"
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      {point.visit === "visited" ? "已打卡" : "我去过"}
                    </button>
                    <button
                      onClick={() => mark(point.visit === "wish" ? "none" : "wish")}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] transition-colors ${
                        point.visit === "wish"
                          ? "bg-rose-400 text-slate-900"
                          : "bg-white/10 text-slate-200 hover:bg-white/20"
                      }`}
                    >
                      <Star className="w-3.5 h-3.5" />
                      {point.visit === "wish" ? "想去" : "标记想去"}
                    </button>
                    <Link
                      href={`/memories/${point.memory_id}`}
                      className="ml-auto text-[11px] text-sky-400 hover:underline"
                    >
                      打开这段记忆
                    </Link>
                  </div>

                  {/* 同一个地点的其他记忆 */}
                  {sameSpot.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-white/10">
                      <p className="text-[10px] text-slate-400 mb-2">
                        同一个地点还有 {sameSpot.length} 段
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {sameSpot.map((s) => (
                          <button
                            key={s.memory_id}
                            onClick={() => focusOn(s)}
                            className="relative rounded-lg overflow-hidden aspect-square border border-white/10"
                          >
                            {s.cover ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={s.cover} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="w-full h-full block bg-slate-800" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </div>

        {/* 底部横滑卡片：攻略 / 路线（像 anitabi 底部的作品条） */}
        <div className="mt-3">
          <div className="flex items-center gap-2 mb-2">
            {(
              [
                ["guides", "攻略", BookOpen],
                ["routes", "路线", RouteIcon],
              ] as ["guides" | "routes", string, typeof BookOpen][]
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => {
                  setCardTab(key);
                  setActiveGuide(null);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] transition-colors ${
                  cardTab === key
                    ? "bg-slate-800 text-white dark:bg-white dark:text-slate-900"
                    : "glass-button text-slate-600 dark:text-slate-300"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
            {activeGuide && (
              <button
                onClick={() => setActiveGuide(null)}
                className="px-3 py-1.5 rounded-xl text-[11px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
              >
                正在看《{activeGuide.title}》✕
              </button>
            )}
            <span className="ml-auto text-[10px] text-slate-400">
              {visiblePoints.length} 个点在地图上 · 点卡片可按攻略聚焦
            </span>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-2">
            {cardTab === "guides"
              ? guides.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setActiveGuide(activeGuide?.id === g.id ? null : g)}
                    className={`shrink-0 w-56 rounded-2xl overflow-hidden text-left glass-card border transition-colors ${
                      activeGuide?.id === g.id ? "border-emerald-400" : "border-white/40 dark:border-white/10"
                    }`}
                  >
                    <div className="h-24 bg-slate-800 relative">
                      {g.cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={g.cover} alt="" className="w-full h-full object-cover" />
                      ) : null}
                      <span className="absolute left-2 top-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-950/70 text-[10px] text-white">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: colorOf.get(g.user_id) ?? "#34d399" }}
                        />
                        {g.owner_name ?? "某人"}
                      </span>
                    </div>
                    <div className="p-3">
                      <p className="text-xs font-medium text-slate-800 dark:text-slate-100 line-clamp-1">
                        {g.title}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        {g.destination ?? "—"} · {g.day_count} 天
                        {g.budget ? ` · ${g.budget}` : ""}
                      </p>
                    </div>
                  </button>
                ))
              : (data?.routes ?? []).map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      const first = r.points[0];
                      if (first) setFocus({ lat: first.latitude, lng: first.longitude });
                      setActiveRouteId(activeRouteId === r.id ? null : r.id);
                    }}
                    className={`shrink-0 w-56 rounded-2xl glass-card border p-3 text-left transition-colors ${
                      activeRouteId === r.id
                        ? "border-amber-400"
                        : "border-white/40 dark:border-white/10"
                    }`}
                  >
                    <p className="flex items-center gap-1.5 text-xs font-medium text-slate-800 dark:text-slate-100">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: colorOf.get(r.user_id) ?? "#facc15" }}
                      />
                      <span className="truncate">{r.title}</span>
                    </p>
                    <p className="mt-1.5 text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2">
                      {r.points.map((p) => p.name).join(" → ")}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {r.owner_nickname ?? r.owner_name ?? "某人"} · {r.points.length} 站
                      {r.start_date ? ` · ${r.start_date} 起` : ""}
                    </p>
                  </button>
                ))}
            {((cardTab === "guides" && guides.length === 0) ||
              (cardTab === "routes" && (data?.routes?.length ?? 0) === 0)) && (
              <p className="py-6 text-[11px] text-slate-400">
                还没有{cardTab === "guides" ? "攻略" : "路线"}。
                <Link href="/travel" className="text-emerald-500 hover:underline ml-1">
                  去旅行页写一个
                </Link>
              </p>
            )}
          </div>
        </div>

        {!point && !loading && (
          <p className="text-center text-[11px] text-slate-400 mt-2">
            点头上的光点看照片和出处 · 点圆头像可以只看某几个人 · 金圈是你打过卡的点
          </p>
        )}
      </div>
    </div>
  );
}

export default function MapPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full py-24 flex justify-center">
          <div className="w-7 h-7 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <MapInner />
    </Suspense>
  );
}
