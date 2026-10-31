"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Route as RouteIcon,
  BookOpen,
  Plus,
  Search,
  MapPin,
  Wallet,
  CalendarDays,
  Users,
  Lock,
  Globe,
  ArrowRight,
  Compass,
  Clock,
} from "lucide-react";
import {
  colorFor,
  fetchGuides,
  fetchRoutes,
  VISIBILITY_LABEL,
  type GuideBrief,
  type TravelRouteItem,
} from "@/lib/travel";
import { fetchExplore, type ExploreOwner } from "@/lib/travel";
import TimelineClient from "@/app/timeline/TimelineClient";

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
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState<"guides" | "routes" | "timeline">("guides");
  const [scope, setScope] = useState("all");
  const [q, setQ] = useState("");
  const [destination, setDestination] = useState(params.get("destination") ?? "");
  const [guides, setGuides] = useState<GuideBrief[]>([]);
  const [routes, setRoutes] = useState<TravelRouteItem[]>([]);
  const [owners, setOwners] = useState<ExploreOwner[]>([]);
  const [loading, setLoading] = useState(true);

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
    load();
  }, [load]);

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

  const destinations = useMemo(() => {
    const set = new Set<string>();
    guides.forEach((g) => g.destination && set.add(g.destination));
    routes.forEach((r) => r.points.forEach((p) => set.add(p.name)));
    return Array.from(set).slice(0, 12);
  }, [guides, routes]);

  const ownerChip = (o: ExploreOwner) => (
    <button
      key={o.id}
      onClick={() => setScope(`u:${o.id}`)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] transition-colors ${
        scope === `u:${o.id}`
          ? "text-slate-900"
          : "bg-slate-500/10 text-slate-500 dark:text-slate-400 hover:bg-slate-500/20"
      }`}
      style={scope === `u:${o.id}` ? { background: colorOf.get(o.id) } : undefined}
    >
      <span className="w-2 h-2 rounded-full" style={{ background: colorOf.get(o.id) }} />
      {o.nickname}
    </button>
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
        {/* 谁的攻略 */}
        <div className="glass-card rounded-2xl border-white/40 dark:border-white/10 px-4 py-3 mb-4 space-y-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-slate-400 mr-1">看谁的：</span>
            <button
              onClick={() => setScope("all")}
              className={`px-3 py-1.5 rounded-full text-[11px] transition-colors ${
                scope === "all" ? "bg-emerald-500 text-white" : "bg-slate-500/10 text-slate-500 dark:text-slate-400"
              }`}
            >
              大家
            </button>
            <button
              onClick={() => setScope("me")}
              className={`px-3 py-1.5 rounded-full text-[11px] transition-colors ${
                scope === "me" ? "bg-emerald-500 text-white" : "bg-slate-500/10 text-slate-500 dark:text-slate-400"
              }`}
            >
              只看我
            </button>
            <button
              onClick={() => setScope("world")}
              className={`px-3 py-1.5 rounded-full text-[11px] transition-colors ${
                scope === "world"
                  ? "bg-violet-500 text-white"
                  : "bg-slate-500/10 text-slate-500 dark:text-slate-400"
              }`}
              title="包含陌生人公开分享的攻略与路线"
            >
              全世界
            </button>
            {owners.filter((o) => !o.is_me).map(ownerChip)}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="relative flex-1 min-w-[200px]">
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

          {destinations.length > 0 && !destination && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-slate-400 mr-1">去哪：</span>
              {destinations.map((d) => (
                <button
                  key={d}
                  onClick={() => setDestination(d)}
                  className="px-2.5 py-1 rounded-full text-[11px] bg-slate-500/10 text-slate-500 dark:text-slate-400 hover:bg-slate-500/20"
                >
                  {d}
                </button>
              ))}
            </div>
          )}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredGuides.map((g, i) => (
                <motion.div
                  key={g.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.3) }}
                >
                  <Link
                    href={`/travel/${g.id}`}
                    className="block rounded-2xl overflow-hidden glass-card border-white/40 dark:border-white/10 hover:border-emerald-400/50 transition-colors h-full"
                  >
                    <div className="relative aspect-[16/10] bg-slate-800">
                      {g.cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={g.cover} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                          没有封面
                        </div>
                      )}
                      <span className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-950/70 text-[10px] text-slate-100">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: colorOf.get(g.user_id) ?? "#34d399" }}
                        />
                        {g.owner_name ?? "某人"}
                      </span>
                      <span className="absolute top-2 right-2">
                        <VisBadge visibility={g.visibility} />
                      </span>
                    </div>
                    <div className="p-4">
                      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 line-clamp-1">
                        {g.title}
                      </h3>
                      {g.subtitle && (
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                          {g.subtitle}
                        </p>
                      )}
                      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
                        {g.destination && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {g.destination}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <CalendarDays className="w-3 h-3" />
                          {g.day_count} 天
                        </span>
                        {g.budget && (
                          <span className="flex items-center gap-1">
                            <Wallet className="w-3 h-3" />
                            {g.budget}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          )
        ) : tab === "timeline" ? (
          <TimelineClient />
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
