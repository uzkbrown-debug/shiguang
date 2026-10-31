"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

function fmt(sec: number) {
  if (!Number.isFinite(sec)) return "0:00";
  const total = Math.floor(sec);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** 站内风格的播放器：不用浏览器那套原生控件 */
export default function MemoryVideoPlayer({ src, poster }: { src: string; poster?: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [ready, setReady] = useState(false);

  const toggle = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    } else {
      el.pause();
      setPlaying(false);
    }
  }, []);

  // 空格播放/暂停，左右键快退快进（不影响输入框）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const el = videoRef.current;
      if (!el) return;
      if (e.key === " ") {
        e.preventDefault();
        toggle();
      } else if (e.key === "ArrowRight") {
        el.currentTime = Math.min(el.duration || 0, el.currentTime + 5);
      } else if (e.key === "ArrowLeft") {
        el.currentTime = Math.max(0, el.currentTime - 5);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const pickSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = videoRef.current;
    if (!el || !el.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    el.currentTime = ((e.clientX - rect.left) / rect.width) * el.duration;
  };

  const pct = duration ? (time / duration) * 100 : 0;

  return (
    <div className="relative rounded-2xl overflow-hidden bg-black/85 group">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        playsInline
        preload="metadata"
        className="w-full max-h-[62vh] object-contain cursor-pointer"
        onClick={toggle}
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration || 0);
          setReady(true);
        }}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />

      {/* 中间的大播放键 */}
      {!playing && (
        <button
          type="button"
          onClick={toggle}
          className="absolute inset-0 m-auto w-16 h-16 rounded-full flex items-center justify-center sg-primary text-white shadow-xl"
          aria-label="播放"
        >
          {ready && time > 0 ? <RotateCcw className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
        </button>
      )}

      {/* 底部控制条 */}
      <div className="absolute left-0 right-0 bottom-0 px-3 pb-2.5 pt-6 bg-gradient-to-t from-black/75 to-transparent">
        <div
          onClick={seek}
          className="h-1.5 w-full rounded-full bg-white/20 overflow-hidden cursor-pointer"
          title="点击跳转"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-violet-400"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 flex items-center gap-3 text-white/85">
          <button type="button" onClick={toggle} className="hover:text-white" aria-label="播放/暂停">
            {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <span className="text-[11px] tabular-nums">
            {fmt(time)} / {fmt(duration)}
          </span>
          <button
            type="button"
            onClick={pickSpeed}
            className="text-[11px] px-1.5 py-0.5 rounded-md hover:bg-white/15 tabular-nums"
            title="播放速度"
          >
            {speed}×
          </button>
          <button
            type="button"
            onClick={() => {
              const el = videoRef.current;
              if (!el) return;
              el.muted = !el.muted;
              setMuted(el.muted);
            }}
            className="ml-auto hover:text-white"
            aria-label="静音"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => videoRef.current?.requestFullscreen?.()}
            className="hover:text-white"
            aria-label="全屏"
          >
            <Maximize className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
