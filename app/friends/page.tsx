"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  UserPlus,
  Search,
  Users,
  Check,
  X,
  Loader2,
  MapPin,
  BookOpen,
  Route as RouteIcon,
  Inbox,
  ArrowRight,
} from "lucide-react";
import FriendButton from "@/components/shiguang/FriendButton";
import { fetchMe, type MeUser } from "@/lib/session";

interface FriendUser {
  id: string;
  username: string;
  nickname: string;
  avatar?: string | null;
  bio?: string | null;
  home_city?: string | null;
  is_friend?: boolean;
  is_me?: boolean;
  pending?: string | null;
  request_from_me?: boolean;
  stats?: {
    memory_count: number;
    route_count: number;
    guide_count: number;
    city_count: number;
    cities: string[];
  };
}

interface RequestItem {
  id: string;
  message?: string | null;
  created_at?: string | null;
  user: FriendUser | null;
}

export default function FriendsPage() {
  const [me, setMe] = useState<MeUser | null>(null);
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [incoming, setIncoming] = useState<RequestItem[]>([]);
  const [outgoing, setOutgoing] = useState<RequestItem[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FriendUser[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    return Promise.all([
      fetchMe().then(setMe),
      fetch("/api/friends", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
      fetch("/api/friends/requests", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { incoming: [], outgoing: [] }))
        .catch(() => ({ incoming: [], outgoing: [] })),
    ])
      .then(([, f, req]) => {
        setFriends(f as FriendUser[]);
        setIncoming((req as { incoming: RequestItem[] }).incoming ?? []);
        setOutgoing((req as { outgoing: RequestItem[] }).outgoing ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const search = async () => {
    const keyword = q.trim();
    if (!keyword) {
      setResults(null);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(keyword)}`, { cache: "no-store" });
      setResults(res.ok ? ((await res.json()) as FriendUser[]) : []);
    } finally {
      setSearching(false);
    }
  };

  const handle = async (id: string, accept: boolean) => {
    await fetch(`/api/friends/requests/${id}/${accept ? "accept" : "reject"}`, { method: "POST" });
    load();
  };

  return (
    <div className="w-full py-6 md:py-10 relative z-10">
      <header className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mb-5">
        <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-1.5">
          <Users className="w-5 h-5 md:w-7 md:h-7 text-emerald-500" />
          <h1
            className="text-xl md:text-3xl font-bold text-slate-800 dark:text-slate-100"
            style={{ fontFamily: "'Noto Serif SC', serif" }}
          >
            好友
          </h1>
          {me?.id && (
            <Link
              href={`/u/${me.id}`}
              className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl glass-button text-xs text-slate-700 dark:text-slate-100"
            >
              我的主页
              <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>
        <p className="text-sm md:text-base text-slate-500 dark:text-slate-400 ml-7 md:ml-10">
          加了好友，就能互相看见对方的足迹、路线和攻略（默认「好友可见」）
        </p>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-5">
        {/* 搜索添加 */}
        <section className="glass-card rounded-2xl border-white/40 dark:border-white/10 p-5">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">
            <UserPlus className="w-4 h-4 text-emerald-500" />
            找朋友
          </h2>
          <div className="flex items-center gap-2">
            <span className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()}
                placeholder="输入对方的用户名或昵称，比如 xiaomei / 小美"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/50 dark:bg-white/5 border border-white/50 dark:border-white/10 text-xs text-slate-700 dark:text-slate-100 outline-none focus:border-emerald-400/60"
              />
            </span>
            <button
              onClick={search}
              disabled={searching}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-xs hover:bg-emerald-600 transition-colors disabled:opacity-60"
            >
              {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              搜索
            </button>
          </div>

          {results && (
            <div className="mt-4 space-y-2">
              {results.length === 0 ? (
                <p className="text-[11px] text-slate-400">没找到这个人。让对方把用户名告诉你，或者 TA 还没注册。</p>
              ) : (
                results.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center gap-3 p-3 rounded-xl border border-white/40 dark:border-white/10"
                  >
                    {u.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
                    ) : (
                      <span className="w-9 h-9 rounded-full bg-emerald-500/20 flex items-center justify-center text-xs text-emerald-600 dark:text-emerald-300">
                        {u.nickname.slice(0, 1)}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-100">
                        {u.nickname}
                        <span className="ml-2 text-[10px] text-slate-400">@{u.username}</span>
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {u.bio || (u.stats ? `${u.stats.memory_count} 段记忆 · ${u.stats.city_count} 个城市` : "")}
                      </p>
                    </div>
                    <FriendButton userId={u.id} size="sm" onChanged={load} />
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        {/* 待处理申请 */}
        {(incoming.length > 0 || outgoing.length > 0) && (
          <section className="glass-card rounded-2xl border-white/40 dark:border-white/10 p-5">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">
              <Inbox className="w-4 h-4 text-amber-500" />
              好友申请
              {incoming.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px]">
                  {incoming.length} 条待处理
                </span>
              )}
            </h2>
            <div className="space-y-2">
              {incoming.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-emerald-400/30 bg-emerald-500/5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-100">
                      {r.user?.nickname ?? "某人"}
                      <span className="ml-2 text-[10px] text-slate-400">想加你为好友</span>
                    </p>
                    {r.message && <p className="text-[10px] text-slate-400 mt-0.5">留言：{r.message}</p>}
                  </div>
                  <button
                    onClick={() => handle(r.id, true)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500 text-white text-[11px]"
                  >
                    <Check className="w-3 h-3" />
                    同意
                  </button>
                  <button
                    onClick={() => handle(r.id, false)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-500/10 text-slate-500 dark:text-slate-300 text-[11px]"
                  >
                    <X className="w-3 h-3" />
                    拒绝
                  </button>
                </div>
              ))}
              {outgoing.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-white/40 dark:border-white/10"
                >
                  <p className="flex-1 text-[11px] text-slate-500 dark:text-slate-400">
                    已向 <span className="text-slate-700 dark:text-slate-200">{r.user?.nickname}</span> 发出申请，等对方同意
                  </p>
                  <span className="text-[10px] text-slate-400">等待中</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 好友列表 */}
        <section>
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">
            我的好友（{friends.length}）
          </h2>
          {loading ? (
            <div className="py-14 flex justify-center">
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : friends.length === 0 ? (
            <p className="py-10 text-center text-xs text-slate-400">
              还没有好友。搜一下对方的用户名，发个申请试试。
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {friends.map((f, i) => (
                <motion.div
                  key={f.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.05, 0.3) }}
                  className="glass-card rounded-2xl border-white/40 dark:border-white/10 p-4"
                >
                  <div className="flex items-center gap-3">
                    {f.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.avatar} alt="" className="w-11 h-11 rounded-full object-cover" />
                    ) : (
                      <span className="w-11 h-11 rounded-full bg-emerald-500/20 flex items-center justify-center text-sm text-emerald-600 dark:text-emerald-300">
                        {f.nickname.slice(0, 1)}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                        {f.nickname}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">
                        @{f.username}
                        {f.home_city ? ` · 常驻 ${f.home_city}` : ""}
                      </p>
                    </div>
                  </div>
                  {f.bio && (
                    <p className="mt-2.5 text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">{f.bio}</p>
                  )}
                  <div className="mt-3 flex items-center gap-3 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {f.stats?.city_count ?? 0} 城市
                    </span>
                    <span className="flex items-center gap-1">
                      <RouteIcon className="w-3 h-3" />
                      {f.stats?.route_count ?? 0} 路线
                    </span>
                    <span className="flex items-center gap-1">
                      <BookOpen className="w-3 h-3" />
                      {f.stats?.guide_count ?? 0} 攻略
                    </span>
                  </div>
                  {f.stats?.cities?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {f.stats.cities.slice(0, 4).map((c) => (
                        <span key={c} className="px-1.5 py-0.5 rounded bg-slate-500/10 text-[10px] text-slate-500 dark:text-slate-400">
                          {c}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-3 flex items-center gap-2">
                    <Link
                      href={`/u/${f.id}`}
                      className="flex-1 text-center px-3 py-2 rounded-xl bg-emerald-500 text-white text-[11px] hover:bg-emerald-600 transition-colors"
                    >
                      看 TA 的足迹
                    </Link>
                    <Link
                      href={`/map?scope=u:${f.id}`}
                      className="px-3 py-2 rounded-xl glass-button text-[11px] text-slate-700 dark:text-slate-100"
                    >
                      地图
                    </Link>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
