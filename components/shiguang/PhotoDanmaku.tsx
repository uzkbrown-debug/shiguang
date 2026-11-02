"use client";

import { useMemo, useRef } from "react";
import { DEFAULT_SETTINGS, type DanmakuSettings } from "@/components/shiguang/DanmakuSettings";

export interface PhotoComment {
  id: string;
  memory_id?: string;
  media_url: string;
  kind: "text" | "voice" | string;
  content?: string | null;
  audio_url?: string | null;
  duration_ms?: number | null;
  nickname?: string | null;
  avatar?: string | null;
  created_at?: string | null;
  /** 这条弹幕是不是自己发的：别人的会在前面挂个昵称 */
  is_mine?: boolean;
  can_delete?: boolean;
}

/**
 * 弹幕层：纯文字从右往左横穿，鼠标移上去会停住。
 * 好友留的弹幕前面带昵称，一眼分得清是谁在说。
 */
export default function PhotoDanmaku({
  items,
  settings = DEFAULT_SETTINGS,
  compact = false,
}: {
  items: PhotoComment[];
  settings?: DanmakuSettings;
  compact?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const range =
    settings.place === "top" ? [6, 26] : settings.place === "middle" ? [34, 30] : [64, 26];

  const lanes = useMemo(() => {
    const count = compact ? 3 : 5;
    const out: PhotoComment[][] = Array.from({ length: count }, () => []);
    const list = compact ? items.slice(0, 9) : items;
    list.forEach((c, i) => out[i % count].push(c));
    return out;
  }, [items, compact]);

  const play = (url?: string | null) => {
    if (!url) return;
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = url;
    void audioRef.current.play().catch(() => {});
  };

  if (!items.length || !settings.enabled) return null;

  const topPct = range[0];
  const spanPct = range[1];

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden select-none">
      {lanes.map((lane, laneIndex) =>
        lane.map((c, order) => {
          const dur = Math.round((c.duration_ms ?? 0) / 1000);
          const text =
            c.kind === "voice"
              ? "\uD83D\uDD0A 语音" + (dur > 0 ? " 0:" + String(dur).padStart(2, "0") : "")
              : (c.content ?? "");
          // 单条时长：短句 18 秒，长句最多 32 秒；速度档再乘一遍
          const base = 18 + Math.min(14, text.length * 0.5);
          const duration = (base / settings.speed).toFixed(1);
          const top = topPct + (laneIndex * spanPct) / Math.max(1, lanes.length);
          const fontSize = (compact ? Math.max(11, settings.size - 4) : settings.size) + "px";
          return (
            <button
              key={c.id}
              onClick={(e) => {
                e.stopPropagation();
                if (c.kind === "voice") play(c.audio_url);
              }}
              // 双保险：CSS 的 hover 规则万一被内联样式盖掉，这里直接改 play-state
              onMouseEnter={(e) => {
                e.currentTarget.style.animationPlayState = "paused";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.animationPlayState = "running";
              }}
              className={
                "absolute whitespace-nowrap font-semibold pointer-events-auto " +
                (c.kind === "voice" ? "cursor-pointer " : "cursor-default ") +
                "hover:[animation-play-state:paused]"
              }
              style={{
                top: top + "%",
                left: "100%",
                fontSize: fontSize,
                color: settings.color,
                textShadow: "0 1px 3px rgba(0,0,0,.9), 0 0 12px rgba(0,0,0,.55)",
                // 不用 animation 简写：它会把 animation-play-state 一起写成 running，
                // 悬停那条 CSS 规则就会被内联样式盖掉，停不下来
                animationName: "dm-run",
                animationDuration: duration + "s",
                animationTimingFunction: "linear",
                animationDelay: (order * 3.4 + laneIndex * 1.1) + "s",
                animationIterationCount: "infinite",
              }}
              title={
                (c.nickname ? c.nickname + "：" : "") +
                (c.kind === "voice" ? "点一下播放语音" : text)
              }
            >
              {!c.is_mine && c.nickname ? (
                <span className="mr-1 align-middle opacity-75" style={{ fontSize: "0.78em" }}>
                  {c.nickname}：
                </span>
              ) : null}
              {text}
            </button>
          );
        }),
      )}
    </div>
  );
}
