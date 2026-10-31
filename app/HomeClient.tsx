"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight, Clock, CalendarDays } from "lucide-react";
import SearchBar from "@/components/ui/SearchBar";
import ProfileCard from "@/components/home/ProfileCard";
import FadeIn from "@/components/ui/FadeIn";
import MemoryDetail from "@/components/shiguang/MemoryDetail";
import { memories, overview, profile, type ShiguangMemory } from "@/data/shiguang";
import { demoPosts, demoPhotos } from "@/data/demo/apiDemo";

const CloudPlayer = dynamic(() => import("@/components/music/CloudPlayer"), { ssr: false });
const LyricBar = dynamic(() => import("@/components/music/LyricBar"), { ssr: false });
const LatestPostsCarousel = dynamic(() => import("@/components/home/LatestPostsCarousel"), { ssr: false });
const PhotoWallPreview = dynamic(() => import("@/components/home/PhotoWallPreview"), { ssr: false });
const DogDiary = dynamic(() => import("@/components/home/DogDiary"), { ssr: false });
const SiteDashboard = dynamic(() => import("@/components/widgets/SiteDashboard"), { ssr: false });

export default function HomeClient() {
  const [detail, setDetail] = useState<ShiguangMemory | null>(null);
  const todayEcho = memories.find((m) => m.id === "mem_20210402_01") ?? memories[0];

  const stats = [
    { label: "记忆", value: overview.memoryCount },
    { label: "照片", value: overview.photoCount },
    { label: "地点", value: overview.placeCount },
    { label: "人物", value: overview.personCount },
    { label: "故事", value: overview.storyCount },
  ];

  return (
    <div className="w-full max-w-6xl mx-auto py-6 md:py-12 px-4 sm:px-10 relative z-10">
      <MemoryDetail memory={detail} onClose={() => setDetail(null)} />

      {/* 搜索栏 */}
      <FadeIn>
        <div className="hidden md:block">
          <SearchBar />
        </div>
      </FadeIn>

      <main className="flex flex-col gap-4 md:gap-6 w-full">
        {/* 拾光横幅：一句话 + 入口 + 今日回忆 */}
        <FadeIn delay={0.05}>
          <section className="tech-panel tech-corners relative rounded-3xl backdrop-blur-md px-5 py-4 md:px-8 md:py-5 transition-colors duration-700">
            <div className="flex flex-col md:flex-row md:items-center gap-5 md:gap-8">
              <div className="flex-1 min-w-0">
                <span className="inline-flex items-center gap-1.5 text-[11px] text-sky-600 dark:text-sky-400">
                  <Sparkles className="w-3 h-3" />
                  拾光 · AI 数字记忆与人生故事馆
                </span>
                <h2 className="mt-2 text-lg md:text-2xl font-bold text-slate-900 dark:text-white transition-colors duration-700">
                  {profile.slogan}
                </h2>
                <p className="mt-1.5 text-xs md:text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-2xl">
                  散落在相册、日记与文档里的 {overview.photoCount} 张照片、{overview.memoryCount} 段记忆，
                  已经被 AI 重新组织成时间、地点、人物与故事。
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-4 md:gap-6">
                  {stats.map((s) => (
                    <div key={s.label} className="text-center">
                      <div className="tech-num text-base md:text-xl font-black text-sky-600 dark:text-cyan-300 tabular-nums">
                        {s.value}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 tracking-widest">{s.label}</div>
                    </div>
                  ))}
                  <div className="flex gap-2 ml-auto">
                    <Link
                      href="/upload"
                      className="tech-btn px-4 py-2 rounded-xl text-white text-xs font-medium"
                    >
                      上传一段记忆
                    </Link>
                    <Link
                      href="/timeline"
                      className="flex items-center gap-1 px-4 py-2 rounded-xl glass-button text-xs font-medium text-slate-700 dark:text-slate-100"
                    >
                      进入我的人生 <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              </div>

              {/* 今日回忆 */}
              <button
                onClick={() => setDetail(todayEcho)}
                className="md:w-72 shrink-0 flex items-center gap-3 rounded-2xl bg-white/50 dark:bg-white/5 border border-white/50 dark:border-white/10 p-2.5 text-left hover:-translate-y-0.5 hover:shadow-lg transition-all duration-300"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={todayEcho.cover}
                  alt=""
                  className="w-14 h-14 rounded-xl object-cover shrink-0"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                    <CalendarDays className="w-3 h-3" />
                    今日回忆 · {todayEcho.happenedAt.slice(0, 10)}
                  </span>
                  <span className="mt-0.5 block text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                    {todayEcho.title}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-slate-400 truncate">打开这段记忆 →</span>
                </span>
              </button>
            </div>
          </section>
        </FadeIn>

        {/* 第一行：个人信息 + 播放器 */}
        <FadeIn delay={0.1}>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6 w-full items-stretch">
            <div className="md:col-span-8 flex w-full">
              <ProfileCard
                postCount={demoPosts.length}
                photoCount={demoPhotos.length}
              />
            </div>
            <div className="md:col-span-4 flex w-full">
              <CloudPlayer />
            </div>
          </div>
        </FadeIn>

        {/* 歌词栏 */}
        <FadeIn delay={0.15}>
          <div className="w-full">
            <LyricBar />
          </div>
        </FadeIn>

        {/* 第二行：照片墙 + 文章 + 日记 */}
        <FadeIn delay={0.2}>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6 w-full items-stretch">
            <div className="md:col-span-4 h-full">
              <PhotoWallPreview />
            </div>
            <div className="md:col-span-8 flex flex-col gap-4 md:gap-6 h-full">
              <LatestPostsCarousel />
              <div className="flex-1 md:min-h-[220px] flex">
                <DogDiary />
              </div>
            </div>
          </div>
        </FadeIn>

        {/* 时间线入口（矮条，不抢版面） */}
        <FadeIn delay={0.22}>
          <div className="tech-panel rounded-2xl backdrop-blur-md px-5 py-3 flex flex-wrap items-center gap-3">
            <Clock className="w-4 h-4 text-sky-500" />
            <span className="text-xs text-slate-600 dark:text-slate-300">
              时间长河里已归档 {overview.memoryCount} 段记忆，横跨 {overview.yearSpan} 年
            </span>
            <div className="ml-auto flex gap-2">
              <Link
                href="/timeline"
                className="px-3.5 py-1.5 rounded-lg text-[11px] bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-500/20 transition-colors"
              >
                时间长河
              </Link>
              <Link
                href="/recall?year=2023"
                className="px-3.5 py-1.5 rounded-lg text-[11px] glass-button text-slate-700 dark:text-slate-100"
              >
                播放 2023 回忆
              </Link>
              <Link
                href="/stories"
                className="px-3.5 py-1.5 rounded-lg text-[11px] glass-button text-slate-700 dark:text-slate-100"
              >
                故事馆
              </Link>
            </div>
          </div>
        </FadeIn>

        {/* 底部数据面板 */}
        <FadeIn delay={0.25}>
          <div className="w-full">
            <SiteDashboard />
          </div>
        </FadeIn>
      </main>
    </div>
  );
}
