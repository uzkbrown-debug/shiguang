"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight, Clock, CalendarDays } from "lucide-react";
import ProfileCard from "@/components/home/ProfileCard";
import HomeChat from "@/components/home/HomeChat";
import { type WeatherData } from "@/components/home/WeatherCard";
import FadeIn from "@/components/ui/FadeIn";
import MemoryDetail from "@/components/shiguang/MemoryDetail";
import { profile, type ShiguangMemory } from "@/data/shiguang";
import { fetchMemories, toShiguangMemory } from "@/app/api/shiguang";
import { patchMe, useMe } from "@/lib/session";

const CloudPlayer = dynamic(() => import("@/components/music/CloudPlayer"), { ssr: false });
const LyricBar = dynamic(() => import("@/components/music/LyricBar"), { ssr: false });

export default function HomeClient() {
  const { me, loading } = useMe();
  const [detail, setDetail] = useState<ShiguangMemory | null>(null);
  const [todayEcho, setTodayEcho] = useState<ShiguangMemory | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  // 天气卡上手动选的城市（先管这一次显示，同时写回账号）
  const [weatherCityPick, setWeatherCityPick] = useState<string | null>(null);

  // 今日回忆取「我自己最新的那条」，没有就空着（新账号本来就该是空的）
  useEffect(() => {
    fetchMemories({ limit: 1 })
      .then(({ items }) => {
        if (items[0]) setTodayEcho(toShiguangMemory(items[0]));
      })
      .catch(() => {
        /* 后端没起来就不显示，别拿演示数据冒充 */
      });
  }, []);

  // 天气：后端代理 open-meteo，失败就保持 null（卡片显示占位）
  // 城市优先用「天气卡自己选的那座」，没选过就按常驻城市
  const weatherCity = weatherCityPick ?? me?.weather_city ?? me?.home_city ?? "泉州";
  useEffect(() => {
    fetch(`/api/weather?city=${encodeURIComponent(weatherCity)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setWeather(d as WeatherData))
      .catch(() => {
        /* 没网就不显示 */
      });
  }, [weatherCity]);

  const changeWeatherCity = (city: string) => {
    setWeatherCityPick(city);
    // 存到账号上：换设备 / 下次打开还是这座城
    void patchMe({ weather_city: city }).catch(() => {
      /* 没登录或保存失败也不影响这次显示 */
    });
  };

  const stats = me?.stats;
  const memoryCount = stats?.memory_count ?? 0;
  const photoCount = stats?.photo_count ?? 0;
  const cityCount = stats?.city_count ?? 0;
  const yearSpan = stats?.year_span ?? 0;

  const loggedIn = Boolean(me);
  const empty = loggedIn && memoryCount === 0;

  const bannerStats = [
    { label: "记忆", value: memoryCount },
    { label: "照片", value: photoCount },
    { label: "地点", value: cityCount },
    { label: "攻略", value: stats?.guide_count ?? 0 },
  ];

  return (
    <div className="w-full mx-auto py-5 md:py-8 px-5 sm:px-8 lg:px-10 relative z-10">
      <MemoryDetail memory={detail} onClose={() => setDetail(null)} />

      <main className="flex flex-col gap-4 md:gap-6 w-full">
        {/* 一、横幅通栏：统计 + 入口 + 最近一条 */}
        <FadeIn delay={0.05} className="w-full">
          <section className="tech-panel tech-corners relative rounded-3xl backdrop-blur-md px-5 py-4 md:px-8 md:py-5 transition-colors duration-700">
            <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-7">
              <div className="min-w-0 lg:max-w-[560px] lg:shrink-0">
                <span className="inline-flex items-center gap-1.5 text-[11px] text-sky-600 dark:text-sky-400">
                  <Sparkles className="w-3 h-3" />
                  拾光 · AI 数字记忆与人生故事馆
                </span>
                <h2 className="mt-2 text-lg md:text-2xl font-bold text-slate-900 dark:text-white transition-colors duration-700">
                  {loading ? "正在读取你的账本…" : profile.slogan}
                </h2>
                <p className="mt-1.5 text-xs md:text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-2xl">
                  {!loggedIn
                    ? "登录后，这里显示的是你自己上传的照片、去过的地方和写过的人。"
                    : empty
                      ? "你的账本还是空的。传一张照片，AI 会自己写出那天的时间、地点和故事。"
                      : `散落在相册里的 ${photoCount} 张照片、${memoryCount} 段记忆，已经被重新组织成时间、地点、人物与故事。`}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <Link
                    href={loggedIn ? "/upload" : "/login"}
                    className="tech-btn px-4 py-2 rounded-xl text-white text-xs font-medium"
                  >
                    {loggedIn ? "上传一段记忆" : "登录 / 注册"}
                  </Link>
                  <Link
                    href="/timeline"
                    className="flex items-center gap-1 px-4 py-2 rounded-xl glass-button text-xs font-medium text-slate-700 dark:text-slate-100"
                  >
                    进入我的人生 <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>

              {/* 四个统计：跟在标题右侧，一行排开 */}
              <div className="flex items-center justify-around gap-4 lg:flex-1 lg:px-6">
                {bannerStats.map((s) => (
                  <div key={s.label} className="text-center">
                    <div className="tech-num text-lg md:text-2xl font-black text-sky-600 dark:text-cyan-300 tabular-nums">
                      {s.value}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 tracking-widest mt-0.5">
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* 最近一条：有记忆才出现，没有就整块不渲染 */}
              {todayEcho && (
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
                      最近一条 · {todayEcho.happenedAt.slice(0, 10)}
                    </span>
                    <span className="mt-0.5 block text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                      {todayEcho.title}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-slate-400 truncate">
                      打开这段记忆 →
                    </span>
                  </span>
                </button>
              )}
            </div>
          </section>
        </FadeIn>

        {/* 二、两栏：左对话 / 右卡片 */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-5 w-full items-stretch">
        <div className="min-w-0 flex">
          <FadeIn delay={0.02} className="w-full flex">
            <HomeChat
              name={me?.nickname}
              memoryCount={memoryCount}
              cityCount={cityCount}
              weather={weather}
              weatherCity={weatherCity}
              onWeatherCity={changeWeatherCity}
            />
          </FadeIn>
        </div>

        <div className="min-w-0 flex flex-col gap-5 lg:h-full lg:justify-between">
        {/* 个人卡片（真实用户）+ 播放器 */}
        <FadeIn delay={0.1} className="w-full">
          <div className="grid grid-cols-1 gap-4 w-full items-stretch">
            <div className="flex w-full">
              <ProfileCard
                name={me?.nickname}
                username={me?.username}
                avatar={me?.avatar}
                bio={me?.bio}
                memoryCount={memoryCount}
                photoCount={photoCount}
                href={me ? `/u/${me.id}` : null}
              />
            </div>
            <div className="flex w-full">
              <CloudPlayer />
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={0.15} className="w-full">
          <div className="w-full">
            <LyricBar />
          </div>
        </FadeIn>

        {/* 空账号：给引导，不拿演示文章/照片墙冒充 */}
        {empty && (
          <FadeIn delay={0.2} className="w-full">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="tech-panel rounded-3xl px-6 py-8 text-center"
            >
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                这里还没有内容
              </h3>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                传第一张照片，或者手动写一条记忆；之后时间线、地图、攻略才会长出你自己的东西。
              </p>
              <div className="mt-4 flex items-center justify-center gap-3">
                <Link href="/upload" className="tech-btn px-4 py-2 rounded-xl text-white text-xs">
                  上传第一段记忆
                </Link>
                <Link
                  href="/travel/new"
                  className="px-4 py-2 rounded-xl glass-button text-xs text-slate-700 dark:text-slate-100"
                >
                  手写一篇攻略
                </Link>
              </div>
            </motion.div>
          </FadeIn>
        )}

        {/* 时间线入口 */}
        <FadeIn delay={0.22} className="w-full">
          <div className="tech-panel rounded-2xl backdrop-blur-md px-5 py-3 flex flex-wrap items-center gap-3">
            <Clock className="w-4 h-4 text-sky-500" />
            <span className="text-xs text-slate-600 dark:text-slate-300">
              {memoryCount > 0
                ? `时间长河里已归档 ${memoryCount} 段记忆${yearSpan ? `，横跨 ${yearSpan} 年` : ""}`
                : "时间线还是空的，传一段记忆它就有内容了"}
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
        </div>
      </div>
      </main>
    </div>
  );
}
