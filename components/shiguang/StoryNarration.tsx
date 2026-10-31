"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AudioLines, Loader2, Pause, Play, RefreshCw, SkipBack, SkipForward } from "lucide-react";

interface SubtitleSeg {
  text: string;
  start_ms: number;
  duration_ms: number;
  level: string;
}

interface Scene {
  id: string;
  sort: number;
  narration: string | null;
  image_url: string | null;
  audio_url: string | null;
  duration_ms: number;
  subtitles: SubtitleSeg[];
}

interface Story {
  id: string;
  title: string;
  status: string;
  duration_ms: number;
  scenes: Scene[];
  ai_generated?: boolean;
}

const fmt = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/** 把词级时间轴拼回整句，并记录每个词在句中的位置 */
function buildLine(segments: SubtitleSeg[]) {
  let cursor = 0;
  const parts = segments.map((seg) => {
    const start = cursor;
    cursor += seg.text.length;
    return { ...seg, charStart: start, charEnd: cursor };
  });
  return { text: segments.map((s) => s.text).join(""), parts };
}

export default function StoryNarration({ memoryId }: { memoryId: string }) {
  const [story, setStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [timeMs, setTimeMs] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/memories/${memoryId}/narration`, { cache: "no-store" });
      const json = (await res.json()) as { story: Story | null };
      setStory(json.story ?? null);
    } catch {
      setStory(null);
    } finally {
      setLoading(false);
    }
  }, [memoryId]);

  useEffect(() => {
    load();
  }, [load]);

  const generate = async () => {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch(`/api/memories/${memoryId}/narration?scenes=4`, { method: "POST" });
      if (!res.ok) throw new Error((await res.text()).slice(0, 120) || "生成失败");
      const json = (await res.json()) as Story;
      setStory(json);
      setIndex(0);
    } catch (e) {
      setError((e as Error).message || "生成失败，请稍后再试");
    } finally {
      setGenerating(false);
    }
  };

  const scene = story?.scenes[index];
  const line = useMemo(() => buildLine(scene?.subtitles ?? []), [scene]);

  const active = useMemo(
    () => line.parts.find((p) => timeMs >= p.start_ms && timeMs < p.start_ms + p.duration_ms),
    [line, timeMs],
  );

  // 切幕时重置播放
  useEffect(() => {
    setTimeMs(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      if (playing) audioRef.current.play().catch(() => setPlaying(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      el.play()
        .then(() => setPlaying(true))
        .catch(() => setError("浏览器拦截了自动播放，请再点一次播放"));
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  const step = (delta: number) => {
    if (!story) return;
    const next = index + delta;
    if (next < 0 || next >= story.scenes.length) {
      setPlaying(false);
      return;
    }
    setIndex(next);
  };

  if (loading) {
    return (
      <div className="mt-5 glass-card rounded-2xl border-white/40 dark:border-white/10 p-5 text-[11px] text-slate-400">
        正在读取配音故事…
      </div>
    );
  }

  if (!story) {
    return (
      <div className="mt-5 glass-card rounded-2xl border-white/40 dark:border-white/10 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
              <AudioLines className="w-4 h-4 text-sky-500" /> 配音故事
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              让这段记忆变成一段能听的旁白，每张照片对应一幕，配字幕。
            </p>
          </div>
          <button
            onClick={generate}
            disabled={generating}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-sky-500 text-white text-xs hover:bg-sky-600 transition-colors disabled:opacity-70"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AudioLines className="w-3.5 h-3.5" />}
            {generating ? "正在写旁白并配音…" : "生成配音故事"}
          </button>
        </div>
        {error && <p className="mt-2 text-[11px] text-rose-500">{error}</p>}
        {generating && (
          <p className="mt-2 text-[11px] text-slate-400">
            通常需要十几秒：写分幕旁白 → 逐幕合成语音 → 存入库中。
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-5 glass-card rounded-2xl border-white/40 dark:border-white/10 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <AudioLines className="w-4 h-4 text-sky-500" /> 配音故事
          <span className="text-[11px] font-normal text-slate-400">
            共 {story.scenes.length} 幕 · {fmt(story.duration_ms)}
            {story.status !== "voiced" ? " · 本次配音未完成" : ""}
          </span>
        </div>
        <button
          onClick={generate}
          disabled={generating}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl glass-button text-[11px] text-slate-600 dark:text-slate-200 disabled:opacity-70"
        >
          {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          {generating ? "重新生成中…" : "换一版旁白"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-4">
          <div className="relative rounded-2xl overflow-hidden bg-slate-900/40 aspect-[4/3]">
            <AnimatePresence mode="wait">
              <motion.img
                key={scene?.id}
                src={scene?.image_url || story.scenes[0]?.image_url || ""}
                alt={`第 ${index + 1} 幕`}
                initial={{ opacity: 0, scale: 1.02 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
                className="w-full h-full object-cover"
              />
            </AnimatePresence>
            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-lg bg-black/50 text-white/85 text-[11px]">
              第 {index + 1} 幕
            </div>
          </div>
        </div>

        <div className="md:col-span-8 flex flex-col">
          <div className="flex-1 min-h-[124px] rounded-2xl bg-slate-900/5 dark:bg-white/5 p-4">
            <p className="text-sm leading-loose text-slate-700 dark:text-slate-200">
              {line.parts.length === 0 && (scene?.narration || "")}
              {line.parts.length > 0 &&
                (() => {
                  const nodes: React.ReactNode[] = [];
                  let cursor = 0;
                  line.parts.forEach((part, i) => {
                    if (part.charStart > cursor) nodes.push(line.text.slice(cursor, part.charStart));
                    const isActive = active?.charStart === part.charStart;
                    nodes.push(
                      <span
                        key={i}
                        className={isActive ? "text-sky-500 font-semibold" : undefined}
                      >
                        {part.text}
                      </span>,
                    );
                    cursor = part.charEnd;
                  });
                  if (cursor < line.text.length) nodes.push(line.text.slice(cursor));
                  return nodes;
                })()}
            </p>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={() => step(-1)}
              disabled={index === 0}
              className="p-2 rounded-full glass-button text-slate-600 dark:text-slate-200 disabled:opacity-40"
              aria-label="上一幕"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              onClick={toggle}
              disabled={!scene?.audio_url}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-sky-500 text-white text-xs hover:bg-sky-600 transition-colors disabled:opacity-50"
            >
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {playing ? "暂停" : "播放"}
            </button>
            <button
              onClick={() => step(1)}
              disabled={index >= story.scenes.length - 1}
              className="p-2 rounded-full glass-button text-slate-600 dark:text-slate-200 disabled:opacity-40"
              aria-label="下一幕"
            >
              <SkipForward className="w-4 h-4" />
            </button>

            <div className="flex-1 h-1.5 rounded-full bg-slate-900/10 dark:bg-white/10 overflow-hidden">
              <div
                className="h-full bg-sky-400 transition-[width] duration-200"
                style={{
                  width: `${scene?.duration_ms ? Math.min(100, (timeMs / scene.duration_ms) * 100) : 0}%`,
                }}
              />
            </div>
            <span className="text-[11px] text-slate-400 tabular-nums">
              {fmt(timeMs)} / {fmt(scene?.duration_ms || 0)}
            </span>
          </div>

          {!scene?.audio_url && (
            <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
              这一幕配音没生成成功，可以点「换一版旁白」重试，文字仍然可以读。
            </p>
          )}
          {error && <p className="mt-2 text-[11px] text-rose-500">{error}</p>}
        </div>
      </div>

      {scene?.audio_url && (
        <audio
          key={scene.id}
          ref={audioRef}
          src={scene.audio_url}
          preload="auto"
          onTimeUpdate={(e) => setTimeMs(e.currentTarget.currentTime * 1000)}
          onEnded={() => {
            if (story.scenes[index + 1]) {
              setIndex(index + 1);
            } else {
              setPlaying(false);
              setTimeMs(scene.duration_ms);
            }
          }}
        />
      )}
    </div>
  );
}
