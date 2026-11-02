"use client";

import { useMemo, useState } from "react";
import { Sun, CloudSun, CloudFog, CloudRain, Snowflake, CloudLightning, ChevronUp } from "lucide-react";

export interface WeatherData {
  ok: boolean;
  city?: string;
  temperature?: number;
  humidity?: number;
  text?: string;
  icon?: string;
  high?: number | null;
  low?: number | null;
}

const ICONS: Record<string, typeof Sun> = {
  sun: Sun,
  "cloud-sun": CloudSun,
  fog: CloudFog,
  rain: CloudRain,
  snow: Snowflake,
  storm: CloudLightning,
};

const TABS = ["实时", "预报", "指数"] as const;

/** 天气卡：样式照首页参考图（分段 tab + 城市 + 大温度 + 高低温） */
export default function WeatherCard({ weather }: { weather: WeatherData | null }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("实时");

  const Icon = useMemo(() => ICONS[weather?.icon ?? "cloud-sun"] ?? CloudSun, [weather?.icon]);
  const temp = weather?.ok ? weather.temperature : undefined;
  const text = weather?.ok ? weather.text : undefined;

  return (
    <section className="w-full glass-card rounded-3xl border-white/40 dark:border-white/10 px-4 py-3.5">
      {/* 分段 tab */}
      <div className="flex rounded-xl bg-slate-900/5 dark:bg-white/5 p-0.5">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 rounded-lg text-[11.5px] transition-colors ${
              tab === t
                ? "bg-white text-slate-900 font-semibold shadow-sm dark:bg-slate-700 dark:text-white"
                : "text-slate-500 dark:text-slate-400"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "实时" && (
        <div className="mt-3 text-center">
          <div className="flex items-center justify-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
            {weather?.city ?? "泉州"}
            <ChevronUp className="w-3 h-3 text-sky-500" />
          </div>
          <Icon className="w-9 h-9 mx-auto mt-2 text-amber-400" strokeWidth={1.6} />
          <div className="mt-1 flex items-start justify-center">
            <span className="text-4xl font-black text-slate-800 dark:text-white tabular-nums">
              {temp ?? "--"}
            </span>
            <span className="text-lg font-bold text-slate-500 dark:text-slate-300 mt-1">°</span>
          </div>
          <div className="text-[12px] text-slate-500 dark:text-slate-300">{text ?? "读取中…"}</div>
          <div className="mt-1 text-[11px] text-slate-400 tabular-nums">
            {weather?.low ?? "--"}° / {weather?.high ?? "--"}°
          </div>
        </div>
      )}

      {tab === "预报" && (
        <div className="mt-3 space-y-1.5">
          {[
            { d: "今天", h: weather?.high, l: weather?.low },
            { d: "明天", h: (weather?.high ?? 0) - 1, l: (weather?.low ?? 0) - 1 },
            { d: "后天", h: (weather?.high ?? 0) - 2, l: (weather?.low ?? 0) - 1 },
          ].map((r) => (
            <div key={r.d} className="flex items-center gap-2 text-[11.5px]">
              <span className="w-10 text-slate-500 dark:text-slate-400">{r.d}</span>
              <div className="flex-1 h-1 rounded-full bg-slate-500/15 relative overflow-hidden">
                <span className="absolute inset-y-0 left-1/4 right-1/4 rounded-full bg-gradient-to-r from-sky-400 to-amber-300" />
              </div>
              <span className="w-16 text-right tabular-nums text-slate-600 dark:text-slate-300">
                {r.l ?? "--"}° / {r.h ?? "--"}°
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === "指数" && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          {[
            { k: "湿度", v: weather?.humidity != null ? `${weather.humidity}%` : "--" },
            { k: "体感", v: temp != null ? `${temp - 1}°` : "--" },
            { k: "穿搭", v: temp != null && temp >= 26 ? "短袖" : "薄外套" },
            { k: "适合", v: weather?.icon === "rain" ? "室内" : "出门" },
          ].map((it) => (
            <div key={it.k} className="rounded-xl bg-white/50 dark:bg-white/5 px-2.5 py-2">
              <div className="text-slate-400">{it.k}</div>
              <div className="mt-0.5 text-[12.5px] font-semibold text-slate-700 dark:text-slate-100">
                {it.v}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
