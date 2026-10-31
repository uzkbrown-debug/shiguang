"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { BookOpen, Lock, Link2, Globe, Plus, Sparkles } from "lucide-react";
import { stories, memoryById } from "@/data/shiguang";

const visibilityMeta: Record<string, { icon: typeof Lock; label: string; cls: string }> = {
  private: { icon: Lock, label: "仅自己可见", cls: "bg-slate-500/15 text-slate-500" },
  link: { icon: Link2, label: "链接分享", cls: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
  public: { icon: Globe, label: "公开", cls: "bg-emerald-500/15 text-emerald-600" },
};

export default function StoriesPage() {
  const [filter, setFilter] = useState<string>("all");
  const list = filter === "all" ? stories : stories.filter((s) => s.visibility === filter);

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
          把记忆组织成可以阅读的数字专题 · {stories.length} 篇
        </p>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-2 mb-5">
          {[
            { key: "all", label: "全部" },
            { key: "private", label: "私密" },
            { key: "link", label: "链接分享" },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3.5 py-1.5 rounded-full text-[11px] transition-colors ${
                filter === f.key ? "bg-sky-500 text-white" : "bg-slate-500/10 text-slate-500 dark:text-slate-400"
              }`}
            >
              {f.label}
            </button>
          ))}
          <button className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl glass-button text-xs text-slate-600 dark:text-slate-200">
            <Plus className="w-3.5 h-3.5" /> 创建故事
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {list.map((s, i) => {
            const meta = visibilityMeta[s.visibility];
            const Icon = meta.icon;
            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
              >
                <Link href={`/stories/${s.id}`} className="block group">
                  <div className="glass-card rounded-2xl border-white/40 dark:border-white/10 overflow-hidden p-0">
                    <div className="relative h-44 overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={s.cover}
                        alt=""
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                      <span className={`absolute top-2.5 right-2.5 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] backdrop-blur-md ${meta.cls}`}>
                        <Icon className="w-3 h-3" />
                        {meta.label}
                      </span>
                      <div className="absolute bottom-3 left-4 right-4 text-white">
                        <h2 className="text-lg font-bold" style={{ fontFamily: "'Noto Serif SC', serif" }}>
                          {s.title}
                        </h2>
                        <p className="text-[11px] text-white/75 mt-0.5">{s.subtitle}</p>
                      </div>
                    </div>
                    <div className="p-4">
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2 italic">
                        “{s.poem}”
                      </p>
                      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          {s.memoryIds.length} 段记忆
                        </span>
                        <span>{s.createdAt}</span>
                      </div>
                      <div className="mt-2.5 flex gap-1.5">
                        {s.memoryIds.slice(0, 4).map((id) => {
                          const m = memoryById(id);
                          if (!m) return null;
                          return (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={id} src={m.cover} alt="" className="w-8 h-8 rounded-md object-cover" />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
