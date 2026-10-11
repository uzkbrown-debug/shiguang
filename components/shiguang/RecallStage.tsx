"use client";
import { createPortal } from "react-dom";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  X,
  SkipForward,
  MapPin,
  VolumeX,
  BookOpen,
} from "lucide-react";
import { buildRecall, buildRecallFrom, type RecallScene, type ShiguangPerson } from "@/data/shiguang";
import { fetchMemories, fetchLocations, toShiguangMemory } from "@/app/api/shiguang";

const SCENE_DURATION = 6000;

export default function RecallStage({
  year,
  onExit,
  onOpenStory,
}: {
  year: number;
  onExit: () => void;
  onOpenStory?: () => void;
}) {
  // 先按年份从后端拿真实记忆来搭场景；后端没有才退回本地示例数据
  const [remoteScenes, setRemoteScenes] = useState<RecallScene[] | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchMemories({ year, limit: 500 }),
      fetch("/api/persons").then((r) => (r.ok ? r.json() : [])),
      fetchLocations(),
    ])
      .then(([data, people, locs]) => {
        if (!alive) return;
        const list = data.items.map(toShiguangMemory);
        const persons: ShiguangPerson[] = (people as { id: string; name: string; relation_label?: string | null; avatar?: string | null }[]).map(
          (p) => ({
            id: p.id,
            name: p.name,
            relationLabel: p.relation_label ?? "",
            avatar: p.avatar ?? "",
            aliases: [],
          }),
        );
        const scenes = buildRecallFrom(year, list, persons, locs.items.map((l) => ({ id: l.id, name: l.name })));
        setRemoteScenes(scenes.length ? scenes : []);
      })
      .catch(() => alive && setRemoteScenes([]));
    return () => {
      alive = false;
    };
  }, [year]);

  const scenes = useMemo<RecallScene[]>(
    () => (remoteScenes && remoteScenes.length ? remoteScenes : buildRecall(year)),
    [remoteScenes, year],
  );
  const [index, setIndex] = useState(0);
  // 照片幕：把这条记忆的所有照片取回来，叠着放；点开摊平，再点放大
  const [stackPhotos, setStackPhotos] = useState<{ url: string; kind?: string }[]>([]);
  const [deckOpen, setDeckOpen] = useState(false);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);
  const scene = scenes[index];

  const goto = useCallback(
    (i: number) => {
      if (i < 0 || i >= scenes.length) return;
      setIndex(i);
    },
    [scenes.length],
  );

  useEffect(() => {
    const current = scenes[index];
    if (!current || current.kind !== "photos" || !current.memoryId) {
      setStackPhotos([]);
      return;
    }
    let alive = true;
    fetch(`/api/memories/${current.memoryId}/media`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { photos?: { url: string; kind?: string }[] } | null) => {
        if (!alive) return;
        const list = (data?.photos ?? []).filter((x) => (x.kind ?? "image") !== "video");
        setStackPhotos(list.length ? list : []);
      })
      .catch(() => alive && setStackPhotos([]));
    return () => {
      alive = false;
    };
  }, [index, scenes]);

  useEffect(() => {
    if (!playing || !scenes.length) return;
    const t = setTimeout(() => {
      if (index >= scenes.length - 1) {
        setPlaying(false);
      } else {
        setIndex((i) => i + 1);
      }
    }, SCENE_DURATION);
    return () => clearTimeout(t);
  }, [playing, index, scenes.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
      if (e.key === "ArrowRight") goto(index + 1);
      if (e.key === "ArrowLeft") goto(index - 1);
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, goto, onExit]);

  const deckOverlay =
    typeof document !== "undefined" &&
    createPortal(
      <>
        <AnimatePresence>
          {deckOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeckOpen(false)}
              className="fixed inset-0 z-[130] bg-slate-950/85 backdrop-blur-md p-4 md:p-10 overflow-y-auto"
            >
              <div className="max-w-4xl mx-auto" onClick={(e) => e.stopPropagation()}>
                <div className="mb-3 flex items-center justify-between text-white/85 text-sm">
                  <span>这段记忆的 {stackPhotos.length} 张照片</span>
                  <button
                    type="button"
                    onClick={() => setDeckOpen(false)}
                    className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs transition-colors"
                  >
                    收起
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {stackPhotos.map((photo) => (
                    <button
                      key={photo.url}
                      type="button"
                      onClick={() => {
                        setZoomUrl(photo.url);
                        setDeckOpen(false);
                      }}
                      className="aspect-square rounded-xl overflow-hidden border border-white/15 hover:border-white/50 transition-all hover:-translate-y-1"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {zoomUrl && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setZoomUrl(null)}
              className="fixed inset-0 z-[140] bg-black/92 flex items-center justify-center p-4 cursor-zoom-out"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={zoomUrl} alt="" className="max-h-full max-w-full object-contain" />
            </motion.div>
          )}
        </AnimatePresence>
      </>,
      document.body,
    );

  if (!scenes.length) {

  return (
      <div className="fixed inset-0 z-[80] bg-slate-950 text-white flex flex-col items-center justify-center gap-4">
        <p>{year} 年还没有留下记忆。</p>
        <button onClick={onExit} className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm">
          返回
        </button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] overflow-hidden bg-slate-950"
    >
      {deckOverlay}
      {/* 背景层：当前场景素材模糊铺底 */}
      <AnimatePresence mode="popLayout">
        <motion.div
          key={`bg-${index}`}
          initial={{ opacity: 0, scale: 1.08 }}
          animate={{ opacity: 0.4, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          className="absolute inset-0"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={scene.cover ?? scene.cities?.[0]?.cover ?? scene.months?.[0]?.cover ?? "/images/1.webp"}
            alt=""
            className="w-full h-full object-cover"
          />
        </motion.div>
      </AnimatePresence>
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/85 via-slate-950/70 to-slate-950/95" />

      {/* 顶部进度与控制 */}
      <div className="relative z-10 flex items-center gap-3 px-5 md:px-10 pt-6">
        <div className="flex-1 flex items-center gap-1.5">
          {scenes.map((s, i) => (
            <button
              key={s.kind + i}
              onClick={() => goto(i)}
              aria-label={s.title}
              className={`h-1 rounded-full transition-all duration-500 ${
                i === index ? "bg-amber-300/90 flex-[3]" : i < index ? "bg-white/50 flex-1" : "bg-white/15 flex-1"
              }`}
            />
          ))}
        </div>
        <span className="text-[11px] text-white/50 tabular-nums">
          {index + 1}/{scenes.length}
        </span>
        <button
          onClick={() => setPlaying((p) => !p)}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          title={playing ? "暂停" : "继续"}
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <button
          onClick={onExit}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          title="退出回忆模式"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 场景主体 */}
      <div className="relative z-10 h-[calc(100%-88px)] flex items-center justify-center px-6 md:px-16">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-4xl text-center text-white"
          >
            {scene.kind === "opening" && (
              <div>
                <motion.h1
                  initial={{ letterSpacing: "0.4em", opacity: 0 }}
                  animate={{ letterSpacing: "0.05em", opacity: 1 }}
                  transition={{ duration: 1.4, ease: "easeOut" }}
                  className="text-6xl md:text-8xl font-bold"
                  style={{ fontFamily: "'Noto Serif SC', serif" }}
                >
                  {scene.title}
                </motion.h1>
                <p className="mt-3 text-lg md:text-2xl text-white/70" style={{ fontFamily: "'Noto Serif SC', serif" }}>
                  {scene.subtitle}
                </p>
                <p className="mt-6 text-sm md:text-base text-white/50">{scene.text}</p>
              </div>
            )}

            {scene.kind === "stats" && (
              <div>
                <h2 className="text-2xl md:text-3xl font-semibold mb-10" style={{ fontFamily: "'Noto Serif SC', serif" }}>
                  {scene.title}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
                  {scene.stats?.map((s, i) => (
                    <motion.div
                      key={s.label}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 * i + 0.2, duration: 0.6 }}
                      className="rounded-2xl bg-white/5 border border-white/10 py-6 backdrop-blur-md"
                    >
                      <div className="text-3xl md:text-4xl font-bold text-amber-200">{s.value}</div>
                      <div className="mt-1 text-xs text-white/50">{s.label}</div>
                    </motion.div>
                  ))}
                </div>
                {scene.text && <p className="mt-8 text-sm text-white/60">{scene.text}</p>}
              </div>
            )}

            {scene.kind === "photos" && (
              <div className="flex flex-col md:flex-row items-center gap-8 text-left">
                <motion.div
                  initial={{ opacity: 0, rotate: -2, scale: 0.94 }}
                  animate={{ opacity: 1, rotate: -1.5, scale: 1 }}
                  transition={{ duration: 0.9 }}
                  className="w-64 md:w-80 shrink-0 rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/15"
                >
                  {/* 一叠照片：后面几张错开角度垫着 */}
                  <div
                    className="relative w-full h-56 md:h-72 cursor-pointer"
                    onClick={() => setDeckOpen(true)}
                    title="点一下摊开看全部"
                  >
                    {stackPhotos.length > 1 &&
                      stackPhotos.slice(0, 3).map((photo, i) => {
                        if (i === 0) return null;
                        return (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={`back-${i}-${photo.url}`}
                            src={photo.url}
                            alt=""
                            aria-hidden
                            className="absolute inset-0 w-full h-full object-cover rounded-md"
                            style={{
                              transform: `rotate(${i === 1 ? -4 : 3}deg) scale(${i === 1 ? 0.94 : 0.88})`,
                              opacity: i === 1 ? 0.75 : 0.5,
                            }}
                          />
                        );
                      })}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      key={scene.cover ?? index}
                      src={stackPhotos[0]?.url || scene.cover || "/images/1.webp"}
                      alt=""
                      loading="eager"
                      className="relative w-full h-full object-cover rounded-md"
                    />
                    {stackPhotos.length > 1 && (
                      <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-lg bg-black/55 text-white/90 text-[10px]">
                        共 {stackPhotos.length} 张 · 点开
                      </span>
                    )}
                  </div>
                </motion.div>
                <div>
                  <h3 className="text-xl md:text-2xl font-semibold" style={{ fontFamily: "'Noto Serif SC', serif" }}>
                    {scene.subtitle}
                  </h3>
                  <p className="mt-3 text-sm md:text-base text-white/70 leading-relaxed">{scene.text}</p>
                </div>
              </div>
            )}

            {scene.kind === "map" && (
              <div>
                <h2 className="text-2xl md:text-3xl font-semibold mb-8" style={{ fontFamily: "'Noto Serif SC', serif" }}>
                  {scene.title}
                </h2>
                <div className="flex flex-wrap items-center justify-center gap-4">
                  {scene.cities?.map((c, i) => (
                    <motion.div
                      key={c.name}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.18 * i + 0.2, duration: 0.6, type: "spring", stiffness: 160 }}
                      className="relative group"
                    >
                      <div className="w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden ring-2 ring-amber-200/40 shadow-[0_0_40px_rgba(217,179,108,0.35)]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={c.cover} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="mt-2 flex items-center justify-center gap-1 text-xs text-white/80">
                        <MapPin className="w-3 h-3 text-amber-200" />
                        {c.name} · {c.count}
                      </div>
                    </motion.div>
                  ))}
                </div>
                {scene.text && <p className="mt-8 text-sm text-white/60">{scene.text}</p>}
              </div>
            )}

            {scene.kind === "people" && (
              <div>
                <h2 className="text-2xl md:text-3xl font-semibold mb-10" style={{ fontFamily: "'Noto Serif SC', serif" }}>
                  {scene.title}
                </h2>
                <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10">
                  {scene.people?.map((p, i) => (
                    <motion.div
                      key={p.person.id}
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 * i + 0.2, duration: 0.6 }}
                      className="flex flex-col items-center"
                    >
                      <div className="w-16 h-16 md:w-20 md:h-20 rounded-full overflow-hidden ring-2 ring-white/20">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.person.avatar} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="mt-2 text-sm">{p.person.name}</div>
                      <div className="text-[11px] text-white/50">共同 {p.count} 段</div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {scene.kind === "months" && (
              <div>
                <h2 className="text-2xl md:text-3xl font-semibold mb-8" style={{ fontFamily: "'Noto Serif SC', serif" }}>
                  {scene.title}
                </h2>
                <div className="flex gap-4 justify-start md:justify-center overflow-x-auto pb-4 px-2">
                  {scene.months?.map((m, i) => (
                    <motion.div
                      key={m.label}
                      initial={{ opacity: 0, x: 24 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.16 * i + 0.2, duration: 0.6 }}
                      className="w-40 shrink-0 rounded-xl overflow-hidden bg-white/5 border border-white/10 text-left"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.cover} alt="" className="w-full h-24 object-cover" />
                      <div className="p-3">
                        <div className="text-[11px] text-amber-200">{m.label}</div>
                        <div className="text-xs mt-1 line-clamp-2 text-white/85">{m.title}</div>
                        <div className="text-[10px] text-white/40 mt-1">{m.date}</div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {scene.kind === "summary" && (
              <div className="max-w-2xl mx-auto">
                <h2 className="text-2xl md:text-3xl font-semibold mb-6" style={{ fontFamily: "'Noto Serif SC', serif" }}>
                  {scene.title}
                </h2>
                <p className="text-base md:text-lg leading-loose text-white/85 whitespace-pre-line">{scene.text}</p>
                <p className="mt-6 text-[11px] text-white/40">
                  以上文字由 AI 依据 {year} 年的 {scenes.length} 个场景数据生成，可编辑或删除。
                </p>
              </div>
            )}

            {scene.kind === "ending" && (
              <div>
                <h2 className="text-3xl md:text-4xl font-semibold" style={{ fontFamily: "'Noto Serif SC', serif" }}>
                  {scene.title}
                </h2>
                <p className="mt-5 text-sm md:text-base text-white/60">{scene.text}</p>
                <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={() => {
                      setIndex(0);
                      setPlaying(true);
                    }}
                    className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-sm transition-colors"
                  >
                    再看一遍
                  </button>
                  {onOpenStory && (
                    <button
                      onClick={onOpenStory}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-200/90 hover:bg-amber-200 text-slate-900 text-sm font-medium transition-colors"
                    >
                      <BookOpen className="w-4 h-4" /> 生成故事
                    </button>
                  )}
                  <button
                    onClick={onExit}
                    className="px-5 py-2.5 rounded-xl glass-button text-sm text-white/85"
                  >
                    返回时间线
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 底部控制条 */}
      <div className="absolute bottom-6 left-0 right-0 z-10 flex items-center justify-center gap-3">
        <button
          onClick={() => goto(index - 1)}
          disabled={index === 0}
          className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => setPlaying((p) => !p)}
          className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs transition-colors"
        >
          {playing ? "暂停播放" : "继续播放"}
        </button>
        <button
          onClick={() => goto(scenes.length - 1)}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs transition-colors"
        >
          <SkipForward className="w-3.5 h-3.5" /> 跳过
        </button>
        <button
          onClick={() => goto(index + 1)}
          disabled={index === scenes.length - 1}
          className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <span className="flex items-center gap-1 text-[11px] text-white/35 ml-2" title="演示版默认静音">
          <VolumeX className="w-3.5 h-3.5" /> 静音
        </span>
      </div>
    </motion.div>
  );
}
