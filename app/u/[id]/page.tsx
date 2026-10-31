"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  MapPin,
  BookOpen,
  Route as RouteIcon,
  Camera,
  Globe2,
  Lock,
  Loader2,
  Save,
} from "lucide-react";
import type { MapLine, MapPin as MapPinItem } from "@/components/shiguang/MemoryMap";
import FriendButton from "@/components/shiguang/FriendButton";
import { patchMe, fetchMe, type MeUser } from "@/lib/session";
import {
  fetchExplore,
  fetchGuides,
  fetchRoutes,
  colorFor,
  type GuideBrief,
  type TravelRouteItem,
} from "@/lib/travel";

const MemoryMap = dynamic(() => import("@/components/shiguang/MemoryMap"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-slate-950" />,
});

interface CircleMemory {
  id: string;
  title: string;
  summary?: string | null;
  happened_at: string;
  cover?: string | null;
  media_count: number;
  visibility: string;
}

interface CircleData {
  user: MeUser & { username: string; home_city?: string | null };
  is_friend: boolean;
  counts: { memories: number; hidden: number; cities: number };
  cities: string[];
  memories: CircleMemory[];
}

export default function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<CircleData | null>(null);
  const [guides, setGuides] = useState<GuideBrief[]>([]);
  const [routes, setRoutes] = useState<TravelRouteItem[]>([]);
  const [pins, setPins] = useState<MapPinItem[]>([]);
  const [lines, setLines] = useState<MapLine[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 自己的资料可以改
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState("");
  const [bio, setBio] = useState("");
  const [homeCity, setHomeCity] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetchMe().then((me) => {
        setMyId(me?.id ?? null);
        return me;
      }),
      fetch(`/api/users/${id}/circle`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetchGuides({ owner: id }),
      fetchRoutes({ owner: id }),
      fetchExplore(`u:${id}`),
    ])
      .then(([, circle, g, r, ex]) => {
        setData(circle as CircleData | null);
        setGuides(g ?? []);
        setRoutes(r ?? []);
        if (circle) {
          setNickname((circle as CircleData).user.nickname);
          setBio((circle as CircleData).user.bio ?? "");
          setHomeCity((circle as CircleData).user.home_city ?? "");
        }
        if (ex) {
          const color = colorFor(0);
          setPins(
            ex.points.map((p, i) => ({
              key: `${p.memory_id}-${i}`,
              lat: p.latitude,
              lng: p.longitude,
              color,
              cover: p.cover,
              title: p.title,
              ownerName: ex.owners[0]?.nickname ?? "TA",
              size: 30,
            })),
          );
          // 不再画连线，只把点摊在图上
          setLines([]);
        }
      })
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [id]);

  const isMe = Boolean(myId && myId === id);
  const user = data?.user;

  const coverMemories = useMemo(() => data?.memories ?? [], [data]);

  if (loading) {
    return (
      <div className="w-full py-24 flex justify-center">
        <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="w-full py-24 text-center">
        <p className="text-sm text-slate-500">没有这个人。</p>
        <Link href="/friends" className="inline-block mt-4 text-xs text-emerald-500 hover:underline">
          回到好友页
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full py-6 md:py-10 relative z-10">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 mb-4">
          <Link href="/friends" className="p-2 rounded-lg text-slate-400 hover:text-emerald-500">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <span className="text-xs text-slate-400">个人主页</span>
        </div>

        {/* 资料卡 */}
        <section className="glass-card rounded-3xl border-white/40 dark:border-white/10 p-6">
          <div className="flex items-start gap-4">
            {user.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatar} alt="" className="w-16 h-16 rounded-2xl object-cover" />
            ) : (
              <span className="w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-xl text-emerald-600 dark:text-emerald-300">
                {user.nickname.slice(0, 1)}
              </span>
            )}
            <div className="flex-1 min-w-0">
              <h1
                className="text-xl md:text-2xl font-bold text-slate-800 dark:text-slate-100"
                style={{ fontFamily: "'Noto Serif SC', serif" }}
              >
                {user.nickname}
                {isMe && <span className="ml-2 text-xs text-sky-500">（我）</span>}
              </h1>
              <p className="mt-1 text-[11px] text-slate-400">
                @{user.username}
                {user.home_city ? ` · 常驻 ${user.home_city}` : ""}
              </p>
              {user.bio && !editing && (
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{user.bio}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1">
                  <Camera className="w-3 h-3" />
                  {data?.counts.memories ?? 0} 段记忆
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {data?.counts.cities ?? 0} 个城市
                </span>
                <span className="flex items-center gap-1">
                  <RouteIcon className="w-3 h-3" />
                  {routes.length} 条路线
                </span>
                <span className="flex items-center gap-1">
                  <BookOpen className="w-3 h-3" />
                  {guides.length} 篇攻略
                </span>
                {!isMe && (
                  <span className="flex items-center gap-1">
                    {data?.is_friend ? <Globe2 className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                    {data?.is_friend ? "好友 · 可见全部好友内容" : "还不是好友 · 只看得到公开内容"}
                  </span>
                )}
              </div>
              {(data?.counts.hidden ?? 0) > 0 && (
                <p className="mt-2 text-[10px] text-slate-400">
                  还有 {data?.counts.hidden} 段记忆设了「仅自己」，你看不到
                </p>
              )}
            </div>
            <div className="shrink-0">
              {isMe ? (
                <button
                  onClick={() => setEditing((v) => !v)}
                  className="px-4 py-2 rounded-xl glass-button text-xs text-slate-700 dark:text-slate-100"
                >
                  {editing ? "取消" : "编辑资料"}
                </button>
              ) : (
                <FriendButton userId={user.id} onChanged={load} />
              )}
            </div>
          </div>

          {editing && (
            <div className="mt-4 pt-4 border-t border-white/20 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="昵称"
                  className="px-3 py-2 rounded-xl bg-white/50 dark:bg-white/5 border border-white/50 dark:border-white/10 text-xs text-slate-700 dark:text-slate-100 outline-none focus:border-emerald-400/60"
                />
                <input
                  value={homeCity}
                  onChange={(e) => setHomeCity(e.target.value)}
                  placeholder="常驻城市"
                  className="px-3 py-2 rounded-xl bg-white/50 dark:bg-white/5 border border-white/50 dark:border-white/10 text-xs text-slate-700 dark:text-slate-100 outline-none focus:border-emerald-400/60"
                />
              </div>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={2}
                placeholder="一句话介绍自己"
                className="w-full px-3 py-2 rounded-xl bg-white/50 dark:bg-white/5 border border-white/50 dark:border-white/10 text-xs text-slate-700 dark:text-slate-100 outline-none focus:border-emerald-400/60 resize-none"
              />
              <button
                onClick={async () => {
                  setSaving(true);
                  try {
                    await patchMe({ nickname, bio, home_city: homeCity });
                    setEditing(false);
                    load();
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 text-white text-xs disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                保存
              </button>
            </div>
          )}

          {data?.cities?.length ? (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {data.cities.map((c) => (
                <Link
                  key={c}
                  href={`/travel?destination=${encodeURIComponent(c)}`}
                  className="px-2 py-0.5 rounded-full bg-slate-500/10 text-[10px] text-slate-500 dark:text-slate-400 hover:bg-emerald-500/15"
                >
                  {c}
                </Link>
              ))}
            </div>
          ) : null}
        </section>

        {/* 足迹地图 */}
        <section className="mt-6">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">TA 的足迹</h2>
          <div className="rounded-3xl overflow-hidden glass-card border-white/40 dark:border-white/10">
            <div style={{ aspectRatio: "16 / 9" }} className="relative">
              {pins.length ? (
                <MemoryMap pins={pins} lines={lines} selectedId={null} onSelect={() => {}} />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-slate-400 bg-slate-900/50">
                  还没有能上地图的记录（或者都没对你开放）
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 攻略 */}
        <section className="mt-6">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">
            <BookOpen className="w-4 h-4 text-emerald-500" />
            攻略（{guides.length}）
          </h2>
          {guides.length === 0 ? (
            <p className="text-[11px] text-slate-400">还没有能看的攻略。</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {guides.map((g) => (
                <Link
                  key={g.id}
                  href={`/travel/${g.id}`}
                  className="rounded-2xl overflow-hidden glass-card border-white/40 dark:border-white/10 hover:border-emerald-400/50 transition-colors"
                >
                  <div className="aspect-[16/10] bg-slate-800">
                    {g.cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={g.cover} alt="" className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                  <div className="p-3">
                    <p className="text-xs font-medium text-slate-800 dark:text-slate-100 line-clamp-1">{g.title}</p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {g.destination ?? "—"} · {g.day_count} 天
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* 路线 */}
        <section className="mt-6">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">
            <RouteIcon className="w-4 h-4 text-amber-500" />
            路线（{routes.length}）
          </h2>
          {routes.length === 0 ? (
            <p className="text-[11px] text-slate-400">还没有能看的路线。</p>
          ) : (
            <div className="space-y-2">
              {routes.map((r) => (
                <Link
                  key={r.id}
                  href={`/travel/route/${r.id}`}
                  className="flex items-center gap-3 p-3 rounded-xl glass-card border-white/40 dark:border-white/10 hover:border-amber-400/50 transition-colors"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <span className="text-xs text-slate-800 dark:text-slate-100">{r.title}</span>
                  <span className="ml-auto text-[10px] text-slate-400">
                    {r.points.map((p) => p.name).join(" → ")}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* 记忆 */}
        <section className="mt-6 pb-6">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">
            <Camera className="w-4 h-4 text-sky-500" />
            最近的记忆
          </h2>
          {coverMemories.length === 0 ? (
            <p className="text-[11px] text-slate-400">没有能看的记忆。</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {coverMemories.slice(0, 12).map((m) => (
                <Link
                  key={m.id}
                  href={`/memories/${m.id}`}
                  className="rounded-xl overflow-hidden glass-card border-white/40 dark:border-white/10 hover:border-sky-400/50 transition-colors"
                >
                  <div className="aspect-square bg-slate-800">
                    {m.cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.cover} alt="" className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                  <div className="p-2">
                    <p className="text-[11px] text-slate-700 dark:text-slate-100 line-clamp-1">{m.title}</p>
                    <p className="text-[10px] text-slate-400">{(m.happened_at ?? "").slice(0, 10)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
