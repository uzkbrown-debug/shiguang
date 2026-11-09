"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, MapPin, Search, X } from "lucide-react";

/**
 * 改天气卡的城市
 *
 * 做成居中的小弹窗而不是贴着卡片的小气泡：天气卡在对话卡内部，
 * 外层有 overflow-hidden，气泡会被裁掉。
 * 城市名走 /api/weather/cities（高德行政区搜索），随便打两个字就有提示。
 */

const HOT = ["北京", "上海", "广州", "深圳", "厦门", "泉州", "杭州", "成都", "西安", "武汉"];

interface CityHit {
  name: string;
  level?: string;
}

export default function WeatherCityPicker({
  current,
  onPick,
  onClose,
}: {
  current: string;
  onPick: (city: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CityHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const kw = q.trim();
    if (!kw) {
      const t = setTimeout(() => setHits([]), 0);
      return () => clearTimeout(t);
    }
    let alive = true;
    const timer = setTimeout(() => {
      setBusy(true);
      fetch(`/api/weather/cities?q=${encodeURIComponent(kw)}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: CityHit[]) => {
          if (alive) setHits(Array.isArray(rows) ? rows : []);
        })
        .catch(() => {
          if (alive) setHits([]);
        })
        .finally(() => {
          if (alive) setBusy(false);
        });
    }, 260);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q]);

  const pick = async (city: string) => {
    if (!city || saving) return;
    setSaving(city);
    try {
      await onPick(city);
      onClose();
    } finally {
      setSaving("");
    }
  };

  const list = q.trim() ? hits : HOT.map((name) => ({ name, level: "hot" }));

  return (
    <div
      className="fixed inset-0 z-[700] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl glass-card border-white/30 dark:border-white/10 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="w-3.5 h-3.5 text-sky-500" />
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
            天气看哪座城市
          </span>
          <button
            onClick={onClose}
            className="ml-auto p-1 rounded-lg text-slate-400 hover:text-rose-500"
            title="关掉"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const first = q.trim() ? hits[0]?.name : q.trim();
                if (first) void pick(first);
              }
              if (e.key === "Escape") onClose();
            }}
            placeholder="输入城市名，比如 青岛 / 京都"
            className="w-full pl-8 pr-3 py-2 rounded-xl bg-white/60 dark:bg-white/5 border border-white/50 dark:border-white/10 text-xs text-slate-700 dark:text-slate-100 outline-none focus:border-sky-400/60"
          />
        </div>

        <p className="mt-2.5 mb-1.5 text-[10.5px] text-slate-400">
          {q.trim() ? (busy ? "正在找…" : hits.length ? "点一个用上" : "没找到，直接回车也能试") : "常用城市"}
        </p>

        <div className="max-h-56 overflow-y-auto overscroll-contain space-y-1">
          {busy && (
            <div className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-slate-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              查一下…
            </div>
          )}
          {list.map((c) => (
            <button
              key={`${c.name}-${c.level ?? ""}`}
              onClick={() => void pick(c.name)}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-[11.5px] text-left transition-colors ${
                c.name === current
                  ? "bg-sky-500/15 text-sky-600 dark:text-sky-300"
                  : "hover:bg-white/60 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300"
              }`}
            >
              <span className="truncate">{c.name}</span>
              {c.name === current && <Check className="w-3 h-3 ml-auto shrink-0" />}
              {saving === c.name && <Loader2 className="w-3 h-3 ml-auto shrink-0 animate-spin" />}
            </button>
          ))}
          {!busy && q.trim() && !hits.length && (
            <button
              onClick={() => void pick(q.trim())}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-[11.5px] text-left text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-white/10"
            >
              就用「{q.trim()}」
            </button>
          )}
        </div>

        <p className="mt-3 text-[10px] text-slate-400">
          选过的城市跟着账号走；清空后按「常驻城市」显示。
        </p>
      </div>
    </div>
  );
}
