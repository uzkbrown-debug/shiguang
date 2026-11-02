"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock3, Users, User as UserIcon, Globe2, MessageSquare, Volume2 } from "lucide-react";
import PolaroidGallery, { type Collection } from "@/components/shiguang/PolaroidGallery";
import { fetchMemories } from "@/app/api/shiguang";

/** 2026-11-01 → 2026年11月1日 */
function cnDate(raw: string): string {
  if (!raw) return "";
  const d = new Date(raw.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

type Scope = "me" | "friends" | "world";

/** 好友弹幕流里的一条 */
interface FeedItem {
  id: string;
  memory_id: string;
  media_url: string;
  kind: string;
  content?: string | null;
  audio_url?: string | null;
  duration_ms?: number | null;
  nickname?: string | null;
  avatar?: string | null;
  created_at?: string | null;
  is_mine?: boolean;
  memory_title?: string | null;
  memory_visibility?: string | null;
  /** 记忆 / 攻略 / 路线 各自的详情页地址 */
  link?: string | null;
  openable?: boolean;
}

const SCOPES: { key: Scope; label: string; Icon: typeof UserIcon }[] = [
  { key: "me", label: "只看我", Icon: UserIcon },
  { key: "friends", label: "好友", Icon: Users },
  { key: "world", label: "全世界", Icon: Globe2 },
];

const EMPTY_TEXT: Record<Scope, { title: string; hint: string }> = {
  me: {
    title: "相册还是空的",
    hint: "传一批照片、写成一条记忆，它就会变成这里的一张相纸。",
  },
  friends: {
    title: "好友还没留下相册",
    hint: "点开好友的相纸，就能在他们照片下面留弹幕、看他们留过的话。",
  },
  world: {
    title: "还没有人公开自己的相册",
    hint: "公开的记忆会出现在这里，谁都能看。",
  },
};

export default function GalleryPage() {
  const [items, setItems] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<Scope>("me");
  // 好友弹幕：好友最近在照片上留的那些话
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [feedOpen, setFeedOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/comments/recent?scope=friends&limit=20", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        if (alive) setFeed(Array.isArray(list) ? list : []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      setLoading(true);
      (async () => {
        try {
          const { items: mems } = await fetchMemories({ scope });
          if (!alive) return;
          const list: Collection[] = mems
            .filter((m) => m.cover)
            .map((m) => ({
              id: m.id,
              title: m.title || "一段未命名的记忆",
              cover: m.cover,
              date: cnDate(m.happened_at),
              count: m.media_count || 1,
              place: m.location_id ?? "",
              // 别人的相纸下面写清是谁的，自己的不写
              owner: scope !== "me" && m.owner_name ? `@${m.owner_name}` : undefined,
            }))
            .sort((a, b) => (a.date < b.date ? 1 : -1));
          setItems(list);
        } finally {
          if (alive) setLoading(false);
        }
      })();
    }, 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [scope]);

  return (
    // 和全站一致：不铺自己的底色，让站点背景透上来
    <div className="min-h-[calc(100vh-4rem)] text-slate-100">
      <div className="mx-auto w-full max-w-6xl px-6 py-14 md:px-10 md:py-20">
        {/* 页头 */}
        <div className="mb-10 flex flex-wrap items-center gap-x-8 gap-y-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-white/25 text-slate-300">
            <Clock3 className="h-[18px] w-[18px]" />
          </span>
          <div className="flex items-end gap-4">
            <h1
              className="text-[34px] leading-none tracking-[0.18em] text-slate-100"
              style={{ fontFamily: "'Noto Serif SC', serif" }}
            >
              相册
            </h1>
            <span className="mb-1 text-[9.5px] tracking-[0.55em] text-slate-400">GALLERY</span>
          </div>
          <p className="text-[12px] leading-relaxed text-slate-400">
            把想留住的，把时间收进一张张胶片。
          </p>
          <div className="ml-auto hidden text-right text-[10px] leading-relaxed text-slate-400 sm:block">
            <p>You in</p>
            <p>拾光</p>
          </div>
        </div>

        {/* 谁的相册：我 / 好友 / 全世界 */}
        <div className="mb-10 flex items-center gap-2">
          {SCOPES.map(({ key, label, Icon }) => {
            const active = scope === key;
            return (
              <button
                key={key}
                onClick={() => setScope(key)}
                className={
                  "flex items-center gap-1.5 rounded-full border px-4 py-2 text-[11.5px] transition-colors " +
                  (active
                    ? "border-sky-400/60 bg-sky-400/15 text-sky-200"
                    : "border-white/15 text-slate-400 hover:border-white/30 hover:text-slate-200")
                }
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
          <span className="ml-2 text-[10.5px] text-slate-500">
            {scope === "me"
              ? "只有你自己看得见"
              : scope === "friends"
                ? "好友可见的相册，点开就能留弹幕"
                : "所有人公开的相册"}
          </span>
          <button
            onClick={() => setFeedOpen((v) => !v)}
            className={
              "ml-auto flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[11.5px] transition-colors " +
              (feedOpen
                ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-200"
                : "border-white/15 text-slate-400 hover:border-white/30 hover:text-slate-200")
            }
          >
            <MessageSquare className="h-3.5 w-3.5" />
            好友弹幕
            {feed.length > 0 && (
              <span className="rounded-full bg-white/15 px-1.5 py-px text-[10px] tabular-nums">{feed.length}</span>
            )}
          </button>
        </div>

        {/* 好友弹幕流：不用翻到具体照片，也能看到好友最近留了什么话 */}
        {feedOpen && (
          <div className="mb-12 rounded-2xl border border-white/15 bg-white/[0.04] p-2 backdrop-blur-xl">
            {feed.length === 0 ? (
              <p className="px-3 py-6 text-center text-[12px] text-slate-400">
                好友还没留过弹幕。点开他们的相纸，在照片下面留第一句。
              </p>
            ) : (
              feed.map((c) => (
                <div key={c.id} className="flex items-start gap-2.5 rounded-xl px-2.5 py-2.5 hover:bg-white/[0.05]">
                  {c.avatar ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={c.avatar} alt="" className="mt-0.5 h-8 w-8 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/15 text-[11px]">
                      {(c.nickname ?? "某").slice(0, 1)}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-400">
                      <span className="text-slate-200">{c.nickname ?? "某人"}</span>
                      {c.is_mine && (
                        <span className="rounded bg-sky-500/25 px-1 py-px text-[9px] text-sky-200">我</span>
                      )}
                      <span className="truncate">在《{c.memory_title || "一段记忆"}》</span>
                    </div>
                    <p className="mt-1 break-words text-[12.5px] leading-relaxed text-slate-100">
                      {c.kind === "voice" ? (
                        <span className="inline-flex items-center gap-1 text-slate-300">
                          <Volume2 className="h-3.5 w-3.5" />
                          语音 {Math.round((c.duration_ms ?? 0) / 1000)}&quot;
                        </span>
                      ) : (
                        c.content
                      )}
                    </p>
                  </div>
                  {c.openable && (
                    <Link
                      href={c.link || `/memories/${c.memory_id}`}
                      className="mt-1 shrink-0 rounded-lg border border-white/15 px-2.5 py-1 text-[10.5px] text-slate-300 hover:border-emerald-400/50 hover:text-emerald-200"
                    >
                      去看看
                    </Link>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-24">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-emerald-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/20 py-24 text-center">
            <p className="text-[13px] text-slate-300">{EMPTY_TEXT[scope].title}</p>
            <p className="mt-2 text-[11px] text-slate-400">{EMPTY_TEXT[scope].hint}</p>
          </div>
        ) : (
          <PolaroidGallery items={items} tone="dark" />
        )}
      </div>
    </div>
  );
}
