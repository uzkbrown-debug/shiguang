"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { BookOpen, Clock, Plus, Sparkles, Loader2, Mic } from "lucide-react";

interface StoryItem {
  id: string;
  title: string;
  subtitle?: string | null;
  cover?: string | null;
  style?: string | null;
  status?: string | null;
  voice?: string | null;
}

export default function StoriesPage() {
  const [items, setItems] = useState<StoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/stories", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("读取失败");
        return (await res.json()) as StoryItem[];
      })
      .then((data) => {
        if (alive) setItems(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "读取失败");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="w-full py-6 md:py-10 relative z-10">
      <header className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mb-5">
        <div className="flex items-center gap-2 md:gap-3 mb-1.5">
          <BookOpen className="w-5 h-5 md:w-7 md:h-7 text-sky-500" />
          <h1
            className="text-xl md:text-3xl font-bold text-slate-800 dark:text-slate-100"
            style={{ fontFamily: "'Noto Serif SC', serif" }}
          >
            故事馆
          </h1>
        </div>
        <p className="text-sm md:text-base text-slate-500 dark:text-slate-400 ml-7 md:ml-10">
          把一段记忆写成可以听的旁白 · {items.length} 篇
        </p>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <span className="text-[11px] text-slate-400">
            这里只展示你自己生成的故事，别人的不会出现
          </span>
          <Link
            href="/timeline"
            className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl glass-button text-xs text-slate-600 dark:text-slate-200"
          >
            <Plus className="w-3.5 h-3.5" /> 去时间线生成故事
          </Link>
        </div>

        {loading ? (
          <div className="py-20 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-sky-500" />
          </div>
        ) : error ? (
          <div className="py-16 text-center text-xs text-rose-400">{error}</div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <Sparkles className="w-8 h-8 mx-auto text-slate-400" />
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              还没有生成过故事
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              打开任意一条记忆，点「生成配音故事」，它就会出现在这里
            </p>
            <Link
              href="/timeline"
              className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-xl tech-btn text-white text-xs"
            >
              去时间线挑一条记忆
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {items.map((s, i) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: Math.min(i * 0.06, 0.3) }}
              >
                <Link href={`/stories/${s.id}`} className="block group">
                  <div className="glass-card rounded-2xl border-white/40 dark:border-white/10 overflow-hidden p-0">
                    <div className="relative h-44 overflow-hidden bg-slate-800">
                      {s.cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={s.cover}
                          alt=""
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                          没有封面
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                      <span className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] backdrop-blur-md bg-sky-500/20 text-sky-100">
                        <Mic className="w-3 h-3" />
                        {s.status === "voiced" ? "已配音" : "草稿"}
                      </span>
                      <div className="absolute bottom-3 left-4 right-4 text-white">
                        <h2 className="text-lg font-bold" style={{ fontFamily: "'Noto Serif SC', serif" }}>
                          {s.title}
                        </h2>
                      </div>
                    </div>
                    <div className="p-4 flex items-center justify-between text-[11px] text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {s.style || "warm"}
                      </span>
                      <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400">
                        打开 →
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
