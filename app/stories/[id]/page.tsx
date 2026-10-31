"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, BookOpen, Lock, Link2, MapPin, Users, Sparkles } from "lucide-react";
import { stories, memoryById, personById, locationById } from "@/data/shiguang";

export default function StoryReaderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const story = stories.find((s) => s.id === params.id);

  if (!story) {
    return (
      <div className="max-w-3xl mx-auto py-24 text-center text-slate-400 text-sm">
        没有找到这篇故事。
        <div className="mt-4">
          <Link href="/stories" className="text-sky-500">
            返回故事馆
          </Link>
        </div>
      </div>
    );
  }

  const items = story.memoryIds
    .map((id) => memoryById(id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m))
    .sort((a, b) => a.happenedAt.localeCompare(b.happenedAt));

  const allPeople = Array.from(new Set(items.flatMap((m) => m.personIds)))
    .map((id) => personById(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p) && p!.id !== "per_me");

  return (
    <article className="w-full relative z-10">
      {/* 封面 */}
      <motion.header
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7 }}
        className="relative h-[52vh] min-h-[320px] overflow-hidden"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={story.cover} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/55 to-slate-950/95" />
        <button
          onClick={() => router.back()}
          className="absolute top-5 left-5 flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-black/35 backdrop-blur-md text-white/90 text-xs hover:bg-black/55 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> 返回
        </button>
        <div className="relative h-full flex flex-col items-center justify-center text-center px-6">
          <span className="flex items-center gap-1.5 text-[11px] text-white/60 mb-3">
            <BookOpen className="w-3 h-3" /> 拾光故事 · {story.createdAt}
          </span>
          <h1
            className="text-3xl md:text-5xl font-bold text-white"
            style={{ fontFamily: "'Noto Serif SC', serif" }}
          >
            {story.title}
          </h1>
          <p className="mt-3 text-sm md:text-base text-white/70">{story.subtitle}</p>
          <div className="mt-4 flex items-center gap-3 text-[11px] text-white/50">
            {story.visibility === "private" ? (
              <span className="flex items-center gap-1">
                <Lock className="w-3 h-3" /> 仅自己可见
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Link2 className="w-3 h-3" /> 链接分享 · 可随时撤销
              </span>
            )}
            <span>{items.length} 段记忆</span>
          </div>
        </div>
      </motion.header>

      {/* 序言 */}
      <section className="max-w-2xl mx-auto px-6 -mt-10 relative">
        <div className="glass-card rounded-2xl border-white/40 dark:border-white/10 px-6 py-6 text-center">
          <p className="text-sm md:text-base text-slate-600 dark:text-slate-300 leading-loose italic">
            “{story.poem}”
          </p>
          <p className="mt-3 text-[11px] text-slate-400">序言由 AI 依据 {items.length} 段记忆生成</p>
        </div>
      </section>

      {/* 章节 */}
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-14">
        {items.map((m, i) => (
          <motion.section
            key={m.id}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center gap-3 mb-4">
              <span className="text-[11px] text-slate-400 tabular-nums">第 {i + 1} 章</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">{m.happenedAt.slice(0, 10)}</span>
              <span className="flex-1 h-px bg-gradient-to-r from-sky-500/40 to-transparent" />
            </div>

            <div className="rounded-2xl overflow-hidden border border-white/40 dark:border-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.cover} alt="" className="w-full h-64 md:h-80 object-cover" />
            </div>

            <h2
              className="mt-5 text-xl md:text-2xl font-bold text-slate-800 dark:text-slate-100"
              style={{ fontFamily: "'Noto Serif SC', serif" }}
            >
              {m.title}
            </h2>

            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {locationById(m.locationId)?.name}
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {m.personIds.map((id) => personById(id)?.name).filter(Boolean).join("、")}
              </span>
              {m.tags.map((t) => (
                <span key={t} className="text-violet-500 dark:text-violet-400">
                  #{t}
                </span>
              ))}
            </div>

            <p className="mt-4 text-sm md:text-[15px] text-slate-700 dark:text-slate-200 leading-loose">
              {m.summary}
            </p>
            <p className="mt-3 text-sm md:text-[15px] text-slate-600 dark:text-slate-300 leading-loose whitespace-pre-line">
              {m.content}
            </p>
          </motion.section>
        ))}
      </div>

      {/* 人物与结语 */}
      <section className="max-w-3xl mx-auto px-6 pb-16">
        {allPeople.length > 0 && (
          <div className="glass-card rounded-2xl border-white/40 dark:border-white/10 p-5 mb-6">
            <div className="text-[11px] text-slate-400 mb-3">故事中出现的人</div>
            <div className="flex flex-wrap gap-4">
              {allPeople.map((p) => (
                <div key={p.id} className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-full overflow-hidden ring-1 ring-white/25">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.avatar} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-700 dark:text-slate-200">{p.name}</div>
                    <div className="text-[10px] text-slate-400">{p.relationLabel}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-loose">
            故事到这里结束。真实的生活还在继续，
            <br />
            下一次被重新看见的时候，它会更完整一些。
          </p>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
            <Sparkles className="w-3 h-3" />
            本页文字与章节顺序由 AI 生成，可编辑、可撤销分享
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/timeline" className="px-5 py-2.5 rounded-xl glass-button text-xs text-slate-700 dark:text-slate-100">
              回到时间长河
            </Link>
            <Link href="/stories" className="px-5 py-2.5 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 text-xs">
              更多故事
            </Link>
          </div>
        </div>
      </section>
    </article>
  );
}
