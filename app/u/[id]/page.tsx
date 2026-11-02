"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import FriendButton from "@/components/shiguang/FriendButton";
import { patchMe, fetchMe, type MeUser } from "@/lib/session";
import { fetchGuides, fetchRoutes, type GuideBrief, type TravelRouteItem } from "@/lib/travel";

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
    ])
      .then(([, circle, g, r]) => {
        setData(circle as CircleData | null);
        setGuides(g ?? []);
        setRoutes(r ?? []);
        if (circle) {
          setNickname((circle as CircleData).user.nickname);
          setBio((circle as CircleData).user.bio ?? "");
          setHomeCity((circle as CircleData).user.home_city ?? "");
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // 放到下一个 tick：避免在 effect 体里同步 setState（React 19 的规则）
    const timer = setTimeout(() => load(), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const isMe = Boolean(myId && myId === id);
  const user = data?.user;

  const coverMemories = useMemo(() => data?.memories ?? [], [data]);
  // 横幅用 TA 最近一条记忆的封面；没有就退成渐变
  const bannerCover = coverMemories.find((m) => m.cover)?.cover ?? null;

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
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 mb-4">
          <Link href="/friends" className="p-2 rounded-lg text-slate-400 hover:text-emerald-500">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <span className="text-xs text-slate-400">个人主页</span>
        </div>

        {/* 关于：一张卡讲清这个人 + 这个项目（版式照参考站的 about） */}
        <section className="glass-card rounded-3xl border-white/40 dark:border-white/10 overflow-hidden">
          {/* 顶部横幅：用 TA 最近一条记忆的封面，没有就用渐变 */}
          <div className="relative h-40 md:h-56 bg-slate-700">
            {bannerCover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={bannerCover} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-sky-500/35 via-emerald-500/25 to-transparent" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/25 to-transparent" />
          </div>

          <div className="px-5 md:px-10 pb-8 md:pb-10">
            {/* 头像压在横幅下沿 + 大标题 */}
            <div className="relative z-10 -mt-12 md:-mt-14 flex items-end gap-4">
              {user.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatar}
                  alt=""
                  className="w-24 h-24 md:w-28 md:h-28 shrink-0 rounded-full object-cover border-4 border-white dark:border-slate-900 bg-white"
                />
              ) : (
                <span className="w-24 h-24 md:w-28 md:h-28 shrink-0 rounded-full grid place-items-center text-3xl border-4 border-white dark:border-slate-900 bg-emerald-500/20 text-emerald-600 dark:text-emerald-300">
                  {user.nickname.slice(0, 1)}
                </span>
              )}
              <div className="pb-1 min-w-0">
                <h1
                  className="text-2xl md:text-4xl font-black tracking-tight text-slate-900 dark:text-white"
                  style={{ fontFamily: "'Noto Serif SC', serif" }}
                >
                  {user.nickname}
                  {isMe && (
                    <span className="ml-2 align-middle text-[11px] font-normal text-sky-500">（我）</span>
                  )}
                </h1>
                <p className="mt-1.5 text-[10.5px] md:text-xs font-bold uppercase tracking-[0.22em] text-indigo-500 dark:text-indigo-400">
                  About @{user.username}
                </p>
              </div>
              <div className="ml-auto pb-1 flex items-center gap-2 shrink-0">
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

            {/* 正文：照参考站的 prose 排版 */}
            <div className="mt-5 md:mt-7 pt-5 md:pt-7 border-t border-white/30 dark:border-white/10">
              <p className="text-[11px] text-slate-400">
                @{user.username}
                {user.home_city ? ` · 常驻 ${user.home_city}` : ""}
                {!isMe && (data?.is_friend ? " · 好友" : " · 只看得到公开内容")}
              </p>
              <p className="mt-3 text-[13px] leading-7 text-slate-600 dark:text-slate-300">
                {user.bio || "把照片丢进来，剩下交给 AI：认地点、认时间、写成一整段故事。"}
              </p>

              <h2 className="mt-7 text-lg md:text-xl font-extrabold text-slate-900 dark:text-white">
                你好，这里是拾光
              </h2>
              <p className="mt-3 text-[13px] leading-7 text-slate-600 dark:text-slate-300">
                一个把照片写成游记的地方。你把一批照片丢进来，它认出这是哪座城市、哪一天、和谁在一起，
                然后写成一段你自己回看时能读下去的文字。
              </p>

              <h2 className="mt-7 text-lg md:text-xl font-extrabold text-slate-900 dark:text-white">
                关于这个项目
              </h2>
              <p className="mt-3 text-[13px] leading-7 text-slate-600 dark:text-slate-300">
                拾光使用 Next.js 16 + React 19 + Tailwind CSS 4 构建，后端是 FastAPI + MySQL，
                看图说话交给 DeepSeek 多模态模型。界面采用玻璃拟态设计。同一批照片，
                会同时长成攻略、路线和地图三种样子。
              </p>

              <h2 className="mt-7 text-lg md:text-xl font-extrabold text-slate-900 dark:text-white">
                技术栈
              </h2>
              <ul className="mt-3 pl-5 list-disc space-y-1 text-[13px] leading-7 text-slate-600 dark:text-slate-300">
                <li>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">主力：</span>
                  Next.js, React, TypeScript, Tailwind CSS
                </li>
                <li>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">后端：</span>
                  FastAPI, SQLAlchemy, MySQL
                </li>
                <li>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">AI：</span>
                  DeepSeek 多模态、edge-tts 语音
                </li>
              </ul>

              <h2 className="mt-7 text-lg md:text-xl font-extrabold text-slate-900 dark:text-white">
                这里有什么
              </h2>
              <ul className="mt-3 pl-5 list-disc space-y-1 text-[13px] leading-7 text-slate-600 dark:text-slate-300">
                <li>上传一批照片，AI 认地点、认时间、认同行的人</li>
                <li>每段记忆默认「仅自己可见」，给谁看由你决定</li>
                <li>同一次出行可以从攻略、路线、地图三个角度回看</li>
                <li>说一句话就能问它：「我去过哪些地方」</li>
              </ul>

              <h2 className="mt-7 text-lg md:text-xl font-extrabold text-slate-900 dark:text-white">
                TA 在这里
              </h2>
              <ul className="mt-3 pl-5 list-disc space-y-1 text-[13px] leading-7 text-slate-600 dark:text-slate-300">
                <li>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">记忆：</span>
                  {data?.counts.memories ?? 0} 段 · {data?.counts.cities ?? 0} 个城市
                </li>
                <li>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">攻略：</span>
                  {guides.length} 篇 ·{" "}
                  <span className="font-semibold text-slate-800 dark:text-slate-100">路线：</span>
                  {routes.length} 条
                </li>
                {(data?.counts.hidden ?? 0) > 0 && (
                  <li>还有 {data?.counts.hidden} 段记忆设了「仅自己」，你看不到</li>
                )}
              </ul>

              <blockquote className="mt-6 border-l-2 border-indigo-400/70 pl-4">
                <p className="text-[13px] italic leading-7 text-slate-600 dark:text-slate-300">
                  记忆不会自己排队，得有人给它排个序。
                  <span className="not-italic text-[11px] text-slate-400"> —— 写在这个项目的第一行注释里</span>
                </p>
              </blockquote>

              {data?.cities?.length ? (
                <div className="mt-5 flex flex-wrap gap-1.5">
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
            </div>

            {editing && (
              <div className="mt-5 pt-5 border-t border-white/20 space-y-3">
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
          </div>
        </section>

      </div>
    </div>
  );
}
