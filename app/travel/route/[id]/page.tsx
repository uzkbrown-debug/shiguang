"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  CalendarDays,
  Bus,
  Moon,
  MapPin,
  BookOpen,
} from "lucide-react";
import type { MapLine, MapPin as MapPinItem } from "@/components/shiguang/MemoryMap";
import FriendButton from "@/components/shiguang/FriendButton";
import {
  deleteRoute,
  fetchGuides,
  fetchRoute,
  VISIBILITY_LABEL,
  type GuideBrief,
  type TravelRouteItem,
} from "@/lib/travel";
import { fetchMe } from "@/lib/session";

const MemoryMap = dynamic(() => import("@/components/shiguang/MemoryMap"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-slate-950" />,
});

export default function RouteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [route, setRoute] = useState<TravelRouteItem | null>(null);
  const [guides, setGuides] = useState<GuideBrief[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    fetchMe().then((me) => setMyId(me?.id ?? null));
    fetchRoute(id)
      .then(setRoute)
      .finally(() => setLoading(false));
    fetchGuides({ scope: "all" }).then((list) => setGuides((list ?? []).filter((g) => g.route_id === id)));
  }, [id]);

  if (loading) {
    return (
      <div className="w-full py-24 flex justify-center">
        <div className="w-7 h-7 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!route) {
    return (
      <div className="w-full py-24 text-center">
        <p className="text-sm text-slate-500">这条路线不存在，或者没有对你开放。</p>
        <Link href="/travel" className="inline-block mt-4 text-xs text-emerald-500 hover:underline">
          回到旅行广场
        </Link>
      </div>
    );
  }

  const mine = myId && route.user_id === myId;
  const pins: MapPinItem[] = route.points.map((p, i) => ({
    key: `rt-${i}`,
    lat: p.latitude,
    lng: p.longitude,
    color: "#facc15",
    cover: null,
    title: `${i + 1}. ${p.name}`,
    ownerName: route.owner_nickname ?? route.owner_name ?? "某人",
    size: 26,
  }));
  const lines: MapLine[] =
    pins.length > 1
      ? [{ id: route.id, color: "#facc15", positions: pins.map((p) => [p.lat, p.lng]), label: route.title }]
      : [];

  return (
    <div className="w-full py-6 md:py-10 relative z-10">
      {confirmDelete && (
        <div className="fixed inset-0 z-[300] bg-slate-950/70 flex items-center justify-center px-4">
          <div className="w-full max-w-sm rounded-2xl glass-card border-white/20 p-6">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">删除这条路线？</h3>
            <p className="mt-2 text-[11px] text-slate-500">地图上的这条线也会一起消失。</p>
            <div className="mt-5 flex items-center gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 rounded-xl glass-button text-xs text-slate-600 dark:text-slate-200"
              >
                再想想
              </button>
              <button
                onClick={async () => {
                  await deleteRoute(route.id);
                  router.push("/travel");
                }}
                className="px-4 py-2 rounded-xl bg-rose-500 text-white text-xs"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 mb-4">
          <Link href="/travel" className="p-2 rounded-lg text-slate-400 hover:text-amber-500">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1
            className="text-xl md:text-2xl font-bold text-slate-800 dark:text-slate-100"
            style={{ fontFamily: "'Noto Serif SC', serif" }}
          >
            {route.title}
          </h1>
          <div className="ml-auto flex items-center gap-2">
            {mine ? (
              <>
                <Link
                  href={`/travel/route/new?id=${route.id}`}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl glass-button text-xs text-slate-700 dark:text-slate-100"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  编辑
                </Link>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl glass-button text-xs text-slate-700 dark:text-slate-100"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  删除
                </button>
              </>
            ) : (
              <FriendButton userId={route.user_id} size="sm" />
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-500 dark:text-slate-400 mb-4">
          <Link href={`/u/${route.user_id}`} className="flex items-center gap-1.5 hover:text-amber-500">
            {route.owner_avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={route.owner_avatar} alt="" className="w-5 h-5 rounded-full object-cover" />
            ) : (
              <span className="w-5 h-5 rounded-full bg-slate-500/30" />
            )}
            {route.owner_nickname ?? route.owner_name ?? "某人"}
          </Link>
          {route.start_date && (
            <span className="flex items-center gap-1">
              <CalendarDays className="w-3 h-3" />
              {route.start_date} → {route.end_date ?? "—"}
            </span>
          )}
          <span>{route.points.length} 个停留点</span>
          {route.tags.map((t) => (
            <span key={t} className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-300">
              {t}
            </span>
          ))}
          <span className="px-2 py-0.5 rounded-full bg-slate-500/10">
            {VISIBILITY_LABEL[route.visibility] ?? "好友可见"}
          </span>
        </div>

        {route.summary && (
          <p className="text-xs text-slate-600 dark:text-slate-300 mb-4">{route.summary}</p>
        )}

        <div className="rounded-3xl overflow-hidden glass-card border-white/40 dark:border-white/10">
          <div style={{ aspectRatio: "16 / 9" }} className="relative">
            {pins.length ? (
              <MemoryMap pins={pins} lines={lines} selectedId={null} onSelect={() => {}} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-slate-400 bg-slate-900/50">
                这条路线还没有坐标
              </div>
            )}
          </div>
        </div>

        <section className="mt-6">
          <h2
            className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-3"
            style={{ fontFamily: "'Noto Serif SC', serif" }}
          >
            停留点
          </h2>
          <div className="space-y-3">
            {route.points.map((p, i) => (
              <div
                key={p.id ?? i}
                className="relative glass-card rounded-2xl border-white/40 dark:border-white/10 p-4 pl-12"
              >
                <span className="absolute left-4 top-4 w-5 h-5 rounded-full bg-amber-400 text-slate-900 text-[10px] flex items-center justify-center font-medium">
                  {i + 1}
                </span>
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{p.name}</h3>
                  {p.arrive_date && (
                    <span className="flex items-center gap-1 text-[10px] text-slate-400">
                      <CalendarDays className="w-3 h-3" />
                      {p.arrive_date}
                    </span>
                  )}
                  {p.stay_days > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-slate-400">
                      <Moon className="w-3 h-3" />
                      {p.stay_days} 天
                    </span>
                  )}
                  {p.transport && (
                    <span className="flex items-center gap-1 text-[10px] text-sky-500">
                      <Bus className="w-3 h-3" />
                      {p.transport}
                    </span>
                  )}
                  {i > 0 && (
                    <span className="ml-auto text-[10px] text-slate-400">
                      从上一站：{p.transport || "—"}
                    </span>
                  )}
                </div>
                {p.note && (
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{p.note}</p>
                )}
                {p.memory_id && (
                  <Link
                    href={`/memories/${p.memory_id}`}
                    className="mt-2 inline-flex items-center gap-1 text-[11px] text-sky-500 hover:underline"
                  >
                    <MapPin className="w-3 h-3" />
                    看这一站的记忆
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>

        {guides.length > 0 && (
          <section className="mt-6">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">
              <BookOpen className="w-4 h-4 text-emerald-500" />
              配套攻略
            </h2>
            <div className="flex flex-wrap gap-2">
              {guides.map((g) => (
                <Link
                  key={g.id}
                  href={`/travel/${g.id}`}
                  className="px-3 py-2 rounded-xl glass-button text-[11px] text-slate-700 dark:text-slate-100"
                >
                  {g.title}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
