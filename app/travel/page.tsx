"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Route as RouteIcon,
  BookOpen,
  Plus,
  Search,
  Users,
  Lock,
  Globe,
  ArrowRight,
  Compass,
  Clock,
} from "lucide-react";
import {
  colorFor,
  deleteGuide,
  fetchGuides,
  fetchRoutes,
  VISIBILITY_LABEL,
  type GuideBrief,
  type TravelRouteItem,
} from "@/lib/travel";
import { fetchExplore, type ExploreOwner } from "@/lib/travel";
import { fetchMe } from "@/lib/session";
import { emitDataChanged, useDataChanged } from "@/lib/dataBus";
import TimelineClient from "@/app/timeline/TimelineClient";
import FlameTrashZone from "@/components/shiguang/FlameTrashZone";
import PolaroidCard from "@/components/shiguang/PolaroidCard";

/** 2026-11-01T20:14:02 → 2026年11月1日 */
function cnDate(raw?: string | null): string {
  if (!raw) return "";
  const d = new Date(String(raw).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

const VIS_ICON = { private: Lock, friends: Users, public: Globe } as const;

function VisBadge({ visibility }: { visibility: string }) {
  const Icon = VIS_ICON[(visibility as keyof typeof VIS_ICON) ?? "friends"] ?? Users;
  return (
    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-950/60 text-[10px] text-slate-200">
      <Icon className="w-2.5 h-2.5" />
      {VISIBILITY_LABEL[visibility] ?? "好友可见"}
    </span>
  );
}

function TravelInner() {
  const params = useSearchParams();
  const [tab, setTab] = useState<"guides" | "routes" | "timeline">("guides");
  // 默认看自己的：「好友」档只装好友的东西，不含自己
  const [scope, setScope] = useState("me");
  const [q, setQ] = useState("");
  const [destination, setDestination] = useState(params.get("destination") ?? "");
  const [guides, setGuides] = useState<GuideBrief[]>([]);
  const [routes, setRoutes] = useState<TravelRouteItem[]>([]);
  const [owners, setOwners] = useState<ExploreOwner[]>([]);
  const [loading, setLoading] = useState(true);
  // 拖拽删除：只允许删自己的攻略
  const [myId, setMyId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overFlame, setOverFlame] = useState(false);
  const [burningId, setBurningId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // 三个视图（攻略 / 路线 / 时间轴）共用一批内容，任一处删了都要一起刷新
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    fetchMe().then((me) => setMyId(me?.id ?? null));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const load = useCallback(() => {
    setLoading(true);
    return Promise.all([
      fetchGuides({ scope, q: q || undefined }),
      fetchRoutes({ scope, q: q || undefined }),
      fetchExplore("world"),
    ])
      .then(([g, r, ex]) => {
        setGuides(g ?? []);
        setRoutes(r ?? []);
        setOwners(ex?.owners ?? []);
      })
      .finally(() => setLoading(false));
  }, [scope, q]);

  useEffect(() => {
    // 放到下一个 tick 再拉：避免在 effect 体里同步 setState（React 19 的规则）
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load]);

  // 任何地方（时间轴删记忆、上传新记忆）改了数据，这里三个 tab 一起刷新
  useDataChanged(
    useCallback(
      (change) => {
        if (change.kind === "memory" || change.kind === "route") {
          setDataVersion((v) => v + 1);
          void load();
        }
      },
      [load],
    ),
  );

  const isMine = (guide: GuideBrief) => Boolean(myId && guide.user_id === myId);

  // 正在拖的那篇（可能不是自己的）
  const draggingGuide = useMemo(
    () => (draggingId ? guides.find((g) => g.id === draggingId) ?? null : null),
    [guides, draggingId],
  );
  const canBurn = draggingGuide ? isMine(draggingGuide) : true;

  /** 松手：把被拖的攻略从列表里烧掉 */
  const burnGuide = async (id: string) => {
    setOverFlame(false);
    setDraggingId(null);

    const guide = guides.find((g) => g.id === id);
    if (!guide) return;

    // myId 可能还没拉到（fetchMe 慢/失败），这里补一次，避免误判「不是你的」
    let uid = myId;
    if (!uid) {
      const me = await fetchMe();
      uid = me?.id ?? null;
      setMyId(uid);
    }
    if (!uid || guide.user_id !== uid) {
      setToast("只能删除自己的攻略");
      return;
    }

    setBurningId(id);
    try {
      await deleteGuide(id);
      // 让火焰动画播完再从列表里淡出
      window.setTimeout(() => {
        setGuides((prev) => prev.filter((g) => g.id !== id));
        // 路线 / 时间轴也重新拉一遍，三处保持同一份真相
        setDataVersion((v) => v + 1);
        void load();
        emitDataChanged({ kind: "guide", action: "deleted", id });
        const linked = guide.route_id ? "；关联的路线还在路线 tab 里" : "";
        setToast(`已删除《${guide.title}》${linked}`);
      }, 260);
    } catch {
      setToast("删除失败，可能没有权限或网络断了");
      setBurningId(null);
    }
  };

  const colorOf = useMemo(() => {
    const map = new Map<string, string>();
    owners.forEach((o, i) => map.set(o.id, colorFor(i)));
    return map;
  }, [owners]);

  const filteredGuides = useMemo(
    () =>
      destination
        ? guides.filter(
            (g) =>
              (g.destination ?? "").includes(destination) ||
              g.title.includes(destination) ||
              (g.summary ?? "").includes(destination),
          )
        : guides,
    [guides, destination],
  );

  const filteredRoutes = useMemo(
    () =>
      destination
        ? routes.filter(
            (r) =>
              r.title.includes(destination) ||
              (r.summary ?? "").includes(destination) ||
              r.points.some((p) => p.name.includes(destination)),
          )
        : routes,
    [routes, destination],
  );

  return (
    <div className="w-full py-6 md:py-10 relative z-10">
      <header className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mb-5">
        <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-1.5">
          <Compass className="w-5 h-5 md:w-7 md:h-7 text-emerald-500" />
          <h1
            className="text-xl md:text-3xl font-bold text-slate-800 dark:text-slate-100"
            style={{ fontFamily: "'Noto Serif SC', serif" }}
          >
            旅行
          </h1>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/travel/route/new"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl glass-button text-xs text-slate-700 dark:text-slate-100"
            >
              <RouteIcon className="w-3.5 h-3.5" />
              画路线
            </Link>
            <Link
              href="/upload"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 text-white text-xs hover:bg-emerald-600 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              添加记忆
            </Link>
          </div>
        </div>
        <p className="text-sm md:text-base text-slate-500 dark:text-slate-400 ml-7 md:ml-10">
          传照片就自动写成攻略；一篇攻略、一条时间线、一堆光点，是同一批内容的三种看法
        </p>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* 筛选：只有搜索 + 只看我 / 好友 / 全世界 */}
        <div className="glass-card rounded-2xl border-white/40 dark:border-white/10 px-4 py-3 mb-4 space-y-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜攻略标题、目的地、关键词"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/40 dark:bg-white/5 border border-white/40 dark:border-white/10 text-xs text-slate-700 dark:text-slate-100 outline-none focus:border-emerald-400/60"
              />
            </span>
            {destination && (
              <button
                onClick={() => setDestination("")}
                className="px-3 py-1.5 rounded-full text-[11px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
              >
                目的地：{destination} ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
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
                className={`px-3 py-1.5 rounded-full text-[11px] transition-colors ${
                  scope === value
                    ? value === "world"
                      ? "bg-violet-500 text-white"
                      : "bg-emerald-500 text-white"
                    : "bg-slate-500/10 text-slate-500 dark:text-slate-400"
                }`}
                title={
                  value === "world"
                    ? "包含陌生人公开分享的攻略与路线"
                    : value === "all"
                      ? "我和我的好友"
                      : "只有我自己"
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 攻略 / 路线 */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {(
            [
              ["guides", `攻略 ${filteredGuides.length}`, BookOpen],
              ["routes", `路线 ${filteredRoutes.length}`, RouteIcon],
              ["timeline", "时间轴", Clock],
            ] as ["guides" | "routes" | "timeline", string, typeof BookOpen][]
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs transition-colors ${
                tab === key
                  ? "bg-slate-800 text-white dark:bg-white dark:text-slate-900"
                  : "glass-button text-slate-600 dark:text-slate-300"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
          <Link href="/travel/new" className="ml-auto text-[11px] text-slate-400 hover:text-emerald-500">
            手动写一篇
          </Link>
        </div>

        {loading ? (
          <div className="py-20 flex justify-center">
            <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tab === "guides" ? (
          filteredGuides.length === 0 ? (
            <EmptyState
              text="还没有攻略。写下第一篇，好友就能看见了。"
              action={{ href: "/travel/new", label: "写第一篇攻略" }}
            />
          ) : (
            // 攻略卡换成相纸：直接贴在深色页面上，不额外铺底板，免得突兀
            <div className="grid grid-cols-1 gap-x-10 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
                {filteredGuides.map((g, i) => (
                  <motion.div
                    key={g.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{
                      opacity: burningId === g.id ? 0 : draggingId === g.id ? 0.35 : 1,
                      y: 0,
                      scale: burningId === g.id ? 0.86 : 1,
                    }}
                    transition={{ delay: Math.min(i * 0.04, 0.3) }}
                  >
                    {/* 原生拖拽放在普通 div 上：motion.div 的 onDragStart 是它自己的手势。
                        所有卡片都能拖（含别人的），拖到火焰里再判断能不能删——
                        否则用户会以为「有的拖不动」是坏了。 */}
                    <div
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", g.id);
                        event.dataTransfer.effectAllowed = "move";
                        setDraggingId(g.id);
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setOverFlame(false);
                      }}
                      className="cursor-grab active:cursor-grabbing select-none"
                      title={isMine(g) ? "拖到页面下方的蓝色火焰里可删除" : "别人的攻略拖不进去（只能删自己的）"}
                    >
                      <Link href={`/travel/${g.id}`}>
                        <PolaroidCard
                          cover={g.cover}
                          title={g.title}
                          date={cnDate(g.created_at)}
                          badge={g.photo_count ? `${g.photo_count} 张` : `${g.day_count} 天`}
                          index={i}
                          layers={g.photo_count && g.photo_count > 2 ? 3 : 1}
                          footnote={[g.destination, g.owner_name].filter(Boolean).join(" · ")}
                          tone="dark"
                        />
                      </Link>
                    </div>
                  </motion.div>
                ))}
            </div>
          )
        ) : tab === "timeline" ? (
          <TimelineClient
            refreshKey={dataVersion}
            onChanged={() => {
              // 时间轴里删了一条记忆：攻略/路线的引用可能失效，这边跟着刷新
              setDataVersion((v) => v + 1);
              void load();
              setToast("已删除一条记忆，攻略与路线已同步刷新");
            }}
          />
        ) : filteredRoutes.length === 0 ? (
          <EmptyState
            text="还没有路线。把去过的地方按顺序连起来，地图上就有一条线。"
            action={{ href: "/travel/route/new", label: "画第一条路线" }}
          />
        ) : (
          <div className="space-y-4">
            {filteredRoutes.map((r) => (
              <Link
                key={r.id}
                href={`/travel/route/${r.id}`}
                className="block rounded-2xl glass-card border-white/40 dark:border-white/10 p-4 hover:border-amber-400/50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="mt-1 w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: colorOf.get(r.user_id) ?? "#facc15" }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                        {r.title}
                      </h3>
                      <span className="text-[10px] text-slate-400">
                        {r.owner_nickname ?? r.owner_name ?? "某人"}
                      </span>
                      <VisBadge visibility={r.visibility} />
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap text-[11px] text-slate-500 dark:text-slate-400">
                      {r.points.map((p, i) => (
                        <span key={`${r.id}-${i}`} className="flex items-center gap-1.5">
                          {i > 0 && <ArrowRight className="w-3 h-3 text-slate-400" />}
                          <span className="px-2 py-0.5 rounded-md bg-slate-500/10">{p.name}</span>
                        </span>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-400">
                      {r.start_date && (
                        <span>
                          {r.start_date} → {r.end_date ?? "—"}
                        </span>
                      )}
                      <span>{r.points.length} 个停留点</span>
                      {r.tags.length > 0 && <span>{r.tags.join(" · ")}</span>}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* 拖拽删除：拖到正下方蓝色火焰松手就烧掉 */}
      <FlameTrashZone
        visible={Boolean(draggingId)}
        active={overFlame}
        denied={!canBurn}
        onDragOver={() => setOverFlame(true)}
        onDragLeave={() => setOverFlame(false)}
        onDrop={(event) => {
          event.preventDefault();
          const id = event.dataTransfer.getData("text/plain") || draggingId;
          if (id) void burnGuide(id);
        }}
      />

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-28 z-[96] px-4 py-2 rounded-xl bg-slate-950/90 border border-cyan-400/30 text-[11px] text-cyan-50 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function EmptyState({ text, action }: { text: string; action: { href: string; label: string } }) {
  return (
    <div className="py-16 text-center">
      <p className="text-xs text-slate-400">{text}</p>
      <Link
        href={action.href}
        className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-xl bg-emerald-500 text-white text-xs hover:bg-emerald-600 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        {action.label}
      </Link>
    </div>
  );
}

export default function TravelPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full py-24 flex justify-center">
          <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <TravelInner />
    </Suspense>
  );
}
