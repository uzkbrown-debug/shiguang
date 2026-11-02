"use client";

import { useEffect, useRef } from "react";

export type DanmakuPlace = "top" | "middle" | "bottom";

export interface DanmakuSettings {
  enabled: boolean;
  speed: number;
  size: number;
  color: string;
  place: DanmakuPlace;
}

export const DANMAKU_COLORS: { key: string; label: string; value: string }[] = [
  { key: "white", label: "白", value: "#ffffff" },
  { key: "yellow", label: "黄", value: "#facc15" },
  { key: "cyan", label: "青", value: "#67e8f9" },
  { key: "pink", label: "粉", value: "#f9a8d4" },
  { key: "green", label: "绿", value: "#86efac" },
];

export const DEFAULT_SETTINGS: DanmakuSettings = {
  enabled: true,
  speed: 1,
  size: 16,
  color: "#ffffff",
  place: "top",
};

const KEY = "danmaku-settings-v2";

export function loadSettings(): DanmakuSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<DanmakuSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(v: DanmakuSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {}
}

export default function DanmakuSettingsPanel({
  value,
  onChange,
  onClose,
  dark = true,
}: {
  value: DanmakuSettings;
  onChange: (v: DanmakuSettings) => void;
  onClose: () => void;
  dark?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [onClose]);

  const shell = dark
    ? "bg-slate-900/95 border-white/15 text-white"
    : "bg-white/95 dark:bg-slate-900/95 border-white/50 dark:border-white/10 text-slate-800 dark:text-slate-100";
  const sub = dark ? "text-white/50" : "text-slate-500 dark:text-slate-400";
  const idle = dark ? "bg-white/10 text-white/70" : "bg-slate-500/10 text-slate-500 dark:text-slate-400";

  return (
    <div className={"absolute right-0 bottom-full mb-2 w-[252px] z-40 rounded-2xl border backdrop-blur-xl shadow-2xl p-3.5 " + shell}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[12px] font-semibold">弹幕设置</span>
        <button
          onClick={() => onChange({ ...value, enabled: !value.enabled })}
          className={"relative w-9 h-5 rounded-full transition-colors " + (value.enabled ? "bg-sky-500" : "bg-slate-400/40")}
          aria-label="开关弹幕"
        >
          <span className={"absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all " + (value.enabled ? "left-[18px]" : "left-0.5")} />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <div className={"flex items-center justify-between text-[11px] " + sub}>
            <span>位置</span>
            <span>{value.place === "top" ? "上面" : value.place === "middle" ? "中间" : "下面"}</span>
          </div>
          <div className="mt-1.5 flex gap-1">
            {([["top", "上面"], ["middle", "中间"], ["bottom", "下面"]] as [DanmakuPlace, string][]).map(([k, label]) => (
              <button
                key={k}
                onClick={() => onChange({ ...value, place: k })}
                className={"flex-1 py-1.5 rounded-lg text-[11px] transition-colors " + (value.place === k ? "bg-sky-500 text-white font-medium" : idle)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className={"flex items-center justify-between text-[11px] " + sub}>
            <span>字号</span>
            <span className="tabular-nums">{value.size}px</span>
          </div>
          <div className="mt-1.5 flex gap-1">
            {[14, 16, 18, 22].map((s) => (
              <button
                key={s}
                onClick={() => onChange({ ...value, size: s })}
                className={"flex-1 py-1.5 rounded-lg text-[11px] transition-colors " + (value.size === s ? "bg-sky-500 text-white font-medium" : idle)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className={"text-[11px] " + sub}>颜色</div>
          <div className="mt-1.5 flex items-center gap-2">
            {DANMAKU_COLORS.map((c) => (
              <button
                key={c.key}
                onClick={() => onChange({ ...value, color: c.value })}
                title={c.label}
                className={"w-6 h-6 rounded-full border-2 transition-transform " + (value.color === c.value ? "border-sky-400 scale-110" : "border-transparent")}
                style={{ background: c.value }}
              />
            ))}
          </div>
        </div>

        <div>
          <div className={"flex items-center justify-between text-[11px] " + sub}>
            <span>速度</span>
            <span>{value.speed === 0.6 ? "慢" : value.speed === 1.6 ? "快" : "正常"}</span>
          </div>
          <div className="mt-1.5 flex gap-1">
            {[{ v: 0.6, t: "慢" }, { v: 1, t: "正常" }, { v: 1.6, t: "快" }].map((o) => (
              <button
                key={o.v}
                onClick={() => onChange({ ...value, speed: o.v })}
                className={"flex-1 py-1.5 rounded-lg text-[11px] transition-colors " + (value.speed === o.v ? "bg-sky-500 text-white font-medium" : idle)}
              >
                {o.t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button onClick={() => onChange(DEFAULT_SETTINGS)} className={"mt-3 w-full py-1.5 rounded-lg text-[11px] hover:opacity-80 " + idle}>
        恢复默认
      </button>
    </div>
  );
}