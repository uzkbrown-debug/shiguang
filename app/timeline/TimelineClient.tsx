"use client";
import { createPortal } from "react-dom";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  motion,
  useAnimationControls,
  useMotionValue,
} from "framer-motion";
import {
  Trash2, Clock, Filter, Search, Sparkles, MapPin, Users, Play, X, ImageIcon, RefreshCw } from "lucide-react";
import MemoryDetail from "@/components/shiguang/MemoryDetail";
import RecallStage from "@/components/shiguang/RecallStage";
import {
  buildTimeline,
  locations,
  persons,
  personById,
  locationById,
  yearOf,
  type ShiguangMemory,
  type YearGroup,
} from "@/data/shiguang";
import { fetchMemories, toShiguangMemory } from "@/app/api/shiguang";

// ── 河流几何 ─────────────────────────────────────────

function waveY(cx: number, riverY: number, amplitude: number, wavelength: number) {
  return (
    riverY +
    amplitude * 0.5 * Math.sin((cx / wavelength) * Math.PI * 2) +
    amplitude * 0.3 * Math.sin((cx / (wavelength * 0.6)) * Math.PI * 2 + 1) +
    amplitude * 0.2 * Math.sin((cx / (wavelength * 1.5)) * Math.PI * 2 + 2.5)
  );
}

function buildRiverPath(
  totalWidth: number,
  riverY: number,
  amplitude: number,
  wavelength: number,
  offsetY: number,
  stepSize: number,
) {
  const parts: string[] = [];
  const steps = Math.max(1, Math.ceil(totalWidth / stepSize));
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * totalWidth;
    parts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${(waveY(x, riverY, amplitude, wavelength) + offsetY).toFixed(1)}`);
  }
  return parts.join(" ");
}

type RiverItem =
  | { kind: "year"; key: string; year: number; group: YearGroup }
  | { kind: "memory"; key: string; year: number; memory: ShiguangMemory };

export default function TimelineClient() {
  const params = useSearchParams();
  const router = useRouter();
  const [detail, setDetail] = useState<ShiguangMemory | null>(null);
  const [recallYear, setRecallYear] = useState<number | null>(null);
  const [personFilter, setPersonFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [viewWidth, setViewWidth] = useState(1200);
  const [isMobile, setIsMobile] = useState(false);
  const [centerYear, setCenterYear] = useState<number | null>(null);
  const [activeYear, setActiveYear] = useState<number | null>(null);
  const [memories, setMemories] = useState<ShiguangMemory[]>([]);
  const [dataSource, setDataSource] = useState<"backend" | "local" | null>(null);
  const [loading, setLoading] = useState(true);

  // 数据来自后端（MySQL），后端不可用时自动回退本地演示数据
  const loadMemories = useCallback(() => {
    setLoading(true);
    return fetchMemories({ limit: 500 })
      .then(({ items, source }) => {
        setMemories(items.map(toShiguangMemory));
        setDataSource(source);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  // 从别的页面（比如刚上传完）切回来时自动刷新
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") loadMemories();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadMemories]);

  const didDrag = useRef(false);
  // 拖动删除：卡片往下拖过阈值就"粉碎"，然后真的从库里删掉
  const [dragState, setDragState] = useState<{ id: string; y: number } | null>(null);
  const [shatterId, setShatterId] = useState<string | null>(null);
  const dragStart = useRef<{ id: string; y: number; pointerY: number } | null>(null);
  const [overZone, setOverZone] = useState(false);
  const zoneRef = useRef<HTMLDivElement | null>(null);

  const shatterAndDelete = useCallback(
    async (id: string) => {
      setShatterId(id);
      setDragState(null);
      try {
        await fetch(`/api/memories/${id}`, { method: "DELETE" });
      } catch {
        /* 删不掉也让动画走完 */
      }
      setTimeout(() => {
        setMemories((list) => list.filter((m) => m.id !== id));
        setShatterId(null);
      }, 620);
    },
    [],
  );

  const onCardPointerDown = (id: string) => (e: React.PointerEvent) => {
    if (shatterId) return;
    dragStart.current = { id, y: 0, pointerY: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onCardPointerMove = (e: React.PointerEvent) => {
    const start = dragStart.current;
    if (!start) return;
    const dy = e.clientY - start.pointerY;
    if (dy > 4) {
      didDrag.current = true;
      setDragState({ id: start.id, y: Math.min(dy, 160) });
    }
    // 指针是否落在底部那个"删除这段时光"的区域里
    const rect = zoneRef.current?.getBoundingClientRect();
    const inside =
      !!rect &&
      e.clientX >= rect.left - 24 &&
      e.clientX <= rect.right + 24 &&
      e.clientY >= rect.top - 24 &&
      e.clientY <= rect.bottom + 24;
    setOverZone(inside);
  };

  const onCardPointerUp = () => {
    const state = dragState;
    const dropped = overZone;
    dragStart.current = null;
    setOverZone(false);
    if (state && dropped) {
      shatterAndDelete(state.id);
    } else {
      setDragState(null);
    }
    setTimeout(() => {
      didDrag.current = false;
    }, 0);
  };
  const didInit = useRef(false);
  const riverRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const controls = useAnimationControls();

  const timeline = useMemo(() => buildTimeline(memories), [memories]);
  // 筛选选项只列出「数据里真实出现过」的，避免选了却没有结果
  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    memories.forEach((m) => m.tags.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14)
      .map(([t]) => t);
  }, [memories]);

  const personOptions = useMemo(() => {
    const used = new Set(memories.flatMap((m) => m.personIds));
    return persons.filter((p) => p.id !== "per_me" && used.has(p.id));
  }, [memories]);

  const locationOptions = useMemo(() => {
    const used = new Set(memories.map((m) => m.locationId).filter(Boolean));
    return locations.filter((l) => used.has(l.id));
  }, [memories]);

  // ── 响应式 ──
  useEffect(() => {
    const check = () => {
      setViewWidth(window.innerWidth);
      setIsMobile(window.innerWidth < 768);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return memories.filter((m) => {
      if (personFilter !== "all" && !m.personIds.includes(personFilter)) return false;
      if (locationFilter !== "all" && m.locationId !== locationFilter) return false;
      if (tagFilter !== "all" && !m.tags.includes(tagFilter)) return false;
      if (needle) {
        const haystack = [
          m.title,
          m.summary,
          m.content ?? "",
          ...m.tags,
          ...m.personIds.map((id) => personById(id)?.name ?? ""),
          locationById(m.locationId)?.name ?? "",
          m.happenedAt ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [memories, personFilter, locationFilter, tagFilter, q]);

  // 序列：年份牌 + 该年记忆（按时间正序）
  const items = useMemo<RiverItem[]>(() => {
    const years = Array.from(new Set(filtered.map(yearOf))).sort((a, b) => a - b);
    const res: RiverItem[] = [];
    years.forEach((y) => {
      const group = timeline.find((g) => g.year === y);
      if (!group) return;
      res.push({ kind: "year", key: `y-${y}`, year: y, group });
      filtered
        .filter((m) => yearOf(m) === y)
        .sort((a, b) => new Date(a.happenedAt).getTime() - new Date(b.happenedAt).getTime())
        .forEach((m) => res.push({ kind: "memory", key: m.id, year: y, memory: m }));
    });
    return res;
  }, [filtered, timeline]);

  // ── 尺寸常量 ──
  const CARD_W = isMobile ? 178 : 248;
  const CARD_H = isMobile ? 208 : 262;
  const CARD_GAP = isMobile ? 46 : 68;
  const RIVER_Y = isMobile ? 250 : 300;
  const AMPLITUDE = isMobile ? 52 : 78;
  const WAVELENGTH = isMobile ? 420 : 580;
  const PADDING = isMobile ? 240 : 520;
  const SVG_TOP = -80;

  const step = CARD_W + CARD_GAP;
  const totalWidth = PADDING * 2 + Math.max(items.length, 1) * step - CARD_GAP;
  const svgHeight = RIVER_Y + AMPLITUDE + CARD_H + 200 - SVG_TOP;

  const riverPath = useMemo(
    () => buildRiverPath(totalWidth, RIVER_Y, AMPLITUDE, WAVELENGTH, 0, isMobile ? 20 : 4),
    [totalWidth, RIVER_Y, AMPLITUDE, WAVELENGTH, isMobile],
  );
  const riverPathBottom = useMemo(
    () => buildRiverPath(totalWidth, RIVER_Y, AMPLITUDE, WAVELENGTH, 14, isMobile ? 24 : 6),
    [totalWidth, RIVER_Y, AMPLITUDE, WAVELENGTH, isMobile],
  );

  const itemX = useCallback((i: number) => PADDING + i * step, [PADDING, step]);
  const centerX = useCallback((i: number) => itemX(i) + CARD_W / 2, [itemX, CARD_W]);

  const xForYear = useCallback(
    (year: number) => {
      const idx = items.findIndex((it) => it.year === year);
      if (idx < 0) return 0;
      return viewWidth / 2 - centerX(idx);
    },
    [items, centerX, viewWidth],
  );

  // ── 初始定位：?year= / ?person= / ?memory= ──
  useEffect(() => {
    if (didInit.current || !items.length) return;
    didInit.current = true;
    const y = params.get("year");
    const p = params.get("person");
    const mem = params.get("memory");
    if (p) setPersonFilter(p);
    if (y) {
      const target = Number(y);
      setActiveYear(target);
      controls.set({ x: xForYear(target) });
    } else {
      // 默认定位到最近一年
      const latest = items[items.length - 1].year;
      setActiveYear(latest);
      controls.set({ x: xForYear(latest) });
    }
    if (mem) {
      const found = memories.find((m) => m.id === mem);
      if (found) setDetail(found);
    }
    setTimeout(() => {
      const el = riverRef.current;
      if (!el) return;
      window.scrollTo({
        top: el.getBoundingClientRect().top + window.scrollY - 150,
        behavior: "smooth",
      });
    }, 260);
  }, [items, params, controls, xForYear]);

  // 筛选变化后回到最新年份
  useEffect(() => {
    if (!didInit.current || !items.length) return;
    const target = activeYear && items.some((i) => i.year === activeYear)
      ? activeYear
      : items[items.length - 1].year;
    controls.set({ x: xForYear(target) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // ── 当前视口中心年份 ──
  useEffect(() => {
    const update = (v: number) => {
      const idx = Math.round((-v - PADDING + viewWidth / 2 - CARD_W / 2) / step);
      const clamped = Math.min(Math.max(idx, 0), items.length - 1);
      const it = items[clamped];
      if (it) setCenterYear(it.year);
    };
    update(x.get());
    return x.on("change", update);
  }, [x, items, PADDING, viewWidth, CARD_W, step]);

  const goYear = (year: number) => {
    setActiveYear(year);
    controls.start({
      x: xForYear(year),
      transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] },
    });
  };

  const filterActive =
    personFilter !== "all" || locationFilter !== "all" || tagFilter !== "all" || q.trim() !== "";
  const years = useMemo(() => Array.from(new Set(items.map((i) => i.year))), [items]);

  if (loading) {
    return (
      <div className="w-full py-32 flex flex-col items-center gap-3">
        <div className="w-7 h-7 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-slate-400">正在读取你的记忆…</span>
      </div>
    );
  }

  return (
    <div className="w-full py-6 md:py-8 relative z-10">
      <MemoryDetail memory={detail} onClose={() => setDetail(null)} />
      {recallYear !== null && <RecallStage year={recallYear} onExit={() => setRecallYear(null)} />}

      {/* 页头 */}
      <motion.header
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mb-4"
      >
        <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-1.5">
          <Clock className="w-5 h-5 md:w-7 md:h-7 text-sky-500" />
          <h1
            className="text-xl md:text-3xl font-bold text-slate-800 dark:text-slate-100"
            style={{ fontFamily: "'Noto Serif SC', serif" }}
          >
            时间长河
          </h1>
          {centerYear && (
            <button
              onClick={() => setRecallYear(centerYear)}
              className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-200/90 hover:bg-amber-200 text-slate-900 text-xs font-medium transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
              AI 回忆模式 · 播放 {centerYear}
            </button>
          )}
        </div>
        <p className="text-sm md:text-base text-slate-500 dark:text-slate-400 ml-7 md:ml-10">
          归档 · 时光河流 · 共 {filtered.length} 段记忆
          {dataSource && (
            <span
              className={`ml-2 px-2 py-0.5 rounded-full text-[11px] ${
                dataSource === "backend"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
              }`}
            >
              {dataSource === "backend" ? "已同步" : "示例数据"}
            </span>
          )}
          <button
            onClick={loadMemories}
            title="重新加载"
            className="ml-2 inline-flex align-middle p-1 rounded-md text-slate-400 hover:text-sky-500 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </p>
      </motion.header>

      {/* 筛选 */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mb-3">
        <div className="glass-card rounded-2xl border-white/40 dark:border-white/10 px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Filter className="w-3.5 h-3.5" /> 筛选
          </span>

          <span className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜标题 / 摘要 / 标签 / 人物 / 地点"
              className="glass-input !py-1.5 !pl-8 !pr-3 text-xs w-full sm:w-64 text-slate-700 dark:text-slate-200"
            />
          </span>

          <select
            value={personFilter}
            onChange={(e) => setPersonFilter(e.target.value)}
            className="glass-input !py-1.5 !px-3 text-xs text-slate-700 dark:text-slate-200"
          >
            <option value="all">全部人物</option>
            {personOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="glass-input !py-1.5 !px-3 text-xs text-slate-700 dark:text-slate-200"
          >
            <option value="all">全部地点</option>
            {locationOptions.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setTagFilter("all")}
              className={`px-2.5 py-1 rounded-full text-[11px] transition-colors ${
                tagFilter === "all" ? "bg-sky-500 text-white" : "bg-slate-500/10 text-slate-500 dark:text-slate-400"
              }`}
            >
              全部主题
            </button>
            {allTags.map((t) => (
              <button
                key={t}
                onClick={() => setTagFilter(t)}
                className={`px-2.5 py-1 rounded-full text-[11px] transition-colors ${
                  tagFilter === t ? "bg-sky-500 text-white" : "bg-slate-500/10 text-slate-500 dark:text-slate-400 hover:bg-slate-500/20"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <span className="ml-auto text-[11px] text-slate-400 tabular-nums">
            命中 {filtered.length} / {memories.length} 段
          </span>
          {filterActive && (
            <button
              onClick={() => {
                setPersonFilter("all");
                setLocationFilter("all");
                setTagFilter("all");
                setQ("");
              }}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600"
            >
              <X className="w-3 h-3" /> 清除
            </button>
          )}
        </div>
      </div>

      {/* 年份刻度 */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mb-3">
        <div className="glass-card rounded-2xl border-white/40 dark:border-white/10 px-4 py-2 flex items-center gap-2 overflow-x-auto">
          <span className="text-[11px] text-slate-400 shrink-0">年份</span>
          {years.map((y) => (
            <button
              key={y}
              onClick={() => goYear(y)}
              className={`px-2.5 py-1 rounded-full text-[11px] shrink-0 transition-colors ${
                centerYear === y
                  ? "bg-sky-500 text-white"
                  : "bg-slate-500/10 text-slate-600 dark:text-slate-300 hover:bg-sky-500/20"
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* 时光河流 */}
      <div ref={riverRef} className="overflow-hidden pb-4 select-none">
        <motion.div
          drag="x"
          dragMomentum
          dragElastic={0.08}
          style={{ x }}
          animate={controls}
          dragConstraints={{ left: -(totalWidth - viewWidth), right: 0 }}
          onDragStart={() => {
            didDrag.current = true;
          }}
          onDragEnd={() => {
            const idx = Math.round((-x.get() - PADDING + viewWidth / 2 - CARD_W / 2) / step);
            const clamped = Math.min(Math.max(idx, 0), items.length - 1);
            const it = items[clamped];
            if (it) setActiveYear(it.year);
            setTimeout(() => {
              didDrag.current = false;
            }, 120);
          }}
          className="cursor-grab active:cursor-grabbing"
        >
          <svg
            width={totalWidth}
            height={svgHeight}
            viewBox={`0 ${SVG_TOP} ${totalWidth} ${svgHeight}`}
            className="block"
          >
            <defs>
              <linearGradient id="river-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0" />
                <stop offset="5%" stopColor="#38bdf8" stopOpacity="0.5" />
                <stop offset="50%" stopColor="#818cf8" stopOpacity="0.6" />
                <stop offset="95%" stopColor="#38bdf8" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="river-grad-dark" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0" />
                <stop offset="50%" stopColor="#818cf8" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
              </linearGradient>
              {!isMobile && (
                <>
                  <filter id="river-glow" x="-5%" y="-20%" width="110%" height="140%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="6" />
                  </filter>
                  <filter id="dot-glow" x="-100%" y="-100%" width="300%" height="300%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
                  </filter>
                </>
              )}
            </defs>

            {/* 河流 */}
            <motion.path
              d={riverPath}
              fill="none"
              stroke="url(#river-grad)"
              strokeWidth="3"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.8, ease: "easeInOut" }}
            />
            {!isMobile && (
              <motion.path
                d={riverPath}
                fill="none"
                stroke="url(#river-grad)"
                strokeWidth="20"
                filter="url(#river-glow)"
                opacity="0.3"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.8, ease: "easeInOut" }}
              />
            )}
            <motion.path
              d={riverPathBottom}
              fill="none"
              stroke="url(#river-grad-dark)"
              strokeWidth="1"
              opacity="0.18"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.8, ease: "easeInOut" }}
            />

            {/* 流动粒子 */}
            {!isMobile && (
              <>
                <path id="river-flow-path" d={riverPath} fill="none" stroke="none" />
                {[0, 0.34, 0.67].map((offset, i) => (
                  <circle key={i} r="3" fill="#38bdf8" opacity="0.7" filter="url(#dot-glow)">
                    <animateMotion dur={`${9 + i * 1.6}s`} repeatCount="indefinite" begin={`${offset * (9 + i * 1.6)}s`}>
                      <mpath href="#river-flow-path" />
                    </animateMotion>
                  </circle>
                ))}
              </>
            )}

            {/* 节点与卡片 */}
            {items.map((item, i) => {
              const cx = centerX(i);
              const wy = waveY(cx, RIVER_Y, AMPLITUDE, WAVELENGTH);
              const isAbove = i % 2 === 0;
              const cardY = isAbove ? wy - (isMobile ? 34 : 54) - CARD_H : wy + (isMobile ? 34 : 54);
              const lineStart = isAbove ? cardY + CARD_H : cardY;
              const isYear = item.kind === "year";

              if (isYear) {
                const g = item.group;
                return (
                  <g key={item.key} className="cursor-pointer" onClick={() => !didDrag.current && setRecallYear(item.year)}>
                    <line x1={cx} y1={lineStart} x2={cx} y2={wy} stroke="#fcd34d" strokeWidth="1.5" opacity="0.5" strokeDasharray="4 3" />
                    <circle cx={cx} cy={wy} r="7" fill="#fcd34d" />
                    <circle cx={cx} cy={wy} r="13" fill="#fcd34d" opacity="0.22" />
                    <text
                      x={cx}
                      y={wy + (isAbove ? 24 : -14)}
                      textAnchor="middle"
                      className="fill-slate-700 dark:fill-slate-200"
                      fontSize={isMobile ? "11" : "13"}
                      fontWeight="700"
                    >
                      {item.year}
                    </text>
                    <foreignObject x={itemX(i)} y={cardY} width={CARD_W} height={CARD_H} style={{ overflow: "visible" }}>
                      <div className="w-full h-full rounded-2xl overflow-hidden relative border border-amber-200/40 shadow-lg group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={g.cover} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/70 to-slate-950/35" />
                        <div className="relative h-full p-3.5 md:p-4 flex flex-col justify-end text-white">
                          <div className="text-3xl md:text-4xl font-bold leading-none" style={{ fontFamily: "'Noto Serif SC', serif" }}>
                            {item.year}
                          </div>
                          <div className="mt-2 text-[9px] md:text-[10px] text-white/60 leading-relaxed">
                            {g.count} 段记忆 · {g.photoCount} 张照片 · {g.cities.join(" / ")}
                          </div>
                          <div className="mt-1 text-[9px] md:text-[10px] text-white/50 line-clamp-2">
                            {g.tags.join(" · ")}
                          </div>
                          <span className="mt-2.5 inline-flex items-center gap-1 text-[9px] md:text-[10px] text-amber-200">
                            <Play className="w-2.5 h-2.5" /> 播放这一年
                          </span>
                        </div>
                      </div>
                    </foreignObject>
                  </g>
                );
              }

              const m = item.memory!;
              const dateText = m.happenedAt.slice(0, 10);
              const ppl = m.personIds
                .map((id) => personById(id)?.name)
                .filter((n): n is string => Boolean(n) && n !== "我");
              return (
                <g
                  key={item.key}
                  className="cursor-pointer"
                  onClick={() => {
                    if (!didDrag.current) router.push(`/memories/${m.id}`);
                  }}
                >
                  <line x1={cx} y1={lineStart} x2={cx} y2={wy} stroke="#38bdf8" strokeWidth="1.5" opacity="0.4" strokeDasharray="4 3" />
                  <circle cx={cx} cy={wy} r="6" fill="#ffffff" />
                  <circle cx={cx} cy={wy} r="10" fill="#ffffff" opacity="0.25" />
                  <text
                    x={cx}
                    y={wy + (isAbove ? 22 : -12)}
                    textAnchor="middle"
                    className="fill-slate-700 dark:fill-slate-100"
                    fontSize={isMobile ? "9" : "11"}
                    fontWeight="700"
                  >
                    {dateText}
                  </text>

                  <foreignObject x={itemX(i)} y={cardY} width={CARD_W} height={CARD_H} style={{ overflow: "visible" }}>
                    <div
                      onPointerDown={onCardPointerDown(m.id)}
                      onPointerMove={onCardPointerMove}
                      onPointerUp={onCardPointerUp}
                      onPointerCancel={onCardPointerUp}
                      style={{
                        transform:
                          dragState?.id === m.id
                            ? `translateY(${dragState.y}px) rotate(${dragState.y * 0.03}deg)`
                            : undefined,
                        transition: dragState?.id === m.id ? "none" : "transform 0.25s ease",
                      }}
                      title="往下拖可以粉碎删除"
                      className={`relative w-full h-full rounded-2xl overflow-hidden border border-white/40 dark:border-white/10 shadow-lg transition-all duration-300 group ${
                        isMobile ? "bg-white/85 dark:bg-slate-800/90" : "bg-white/60 dark:bg-slate-800/70 backdrop-blur-xl"
                      } ${shatterId === m.id ? "sg-shatter" : ""}`}
                    >
                      {dragState && typeof document !== "undefined" &&
                        createPortal(
                          <div
                            ref={zoneRef}
                            className={`fixed left-1/2 -translate-x-1/2 bottom-8 z-[120] flex items-center gap-2 px-5 py-3 rounded-2xl border text-xs transition-all duration-200 ${
                              overZone
                                ? "bg-rose-500/25 border-rose-400/70 text-rose-100 scale-110 shadow-[0_0_40px_rgba(244,63,94,0.45)]"
                                : "bg-slate-900/70 border-white/25 text-white/75"
                            }`}
                            style={{ backdropFilter: "blur(14px)" }}
                          >
                            <Trash2 className={overZone ? "w-4 h-4" : "w-4 h-4 opacity-70"} />
                            <span>{overZone ? "松手，这段时光就碎了" : "拖到这里 · 删除这段时光"}</span>
                          </div>,
                          document.body,
                        )}

                      {shatterId === m.id && (
                        <span className="absolute inset-0 z-20 pointer-events-none">
                          {Array.from({ length: 10 }).map((_, i) => (
                            <span
                              key={i}
                              className="sg-shard"
                              style={
                                {
                                  left: `${8 + i * 9}%`,
                                  top: `${20 + (i % 3) * 22}%`,
                                  "--dx": `${(i % 2 ? 1 : -1) * (18 + i * 4)}px`,
                                  "--dy": `${16 + (i % 4) * 12}px`,
                                  "--rot": `${(i % 2 ? 1 : -1) * (40 + i * 9)}deg`,
                                  animationDelay: `${i * 25}ms`,
                                } as React.CSSProperties
                              }
                            />
                          ))}
                        </span>
                      )}
                      <div className="relative overflow-hidden" style={{ height: isMobile ? 92 : 124 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={m.cover} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
                        <div className="absolute bottom-1.5 left-2 flex items-center gap-1 text-white/85 text-[9px] md:text-[10px]">
                          <ImageIcon className="w-2.5 h-2.5" />
                          {m.mediaCount}
                        </div>
                        {m.aiGenerated && (
                          <span className="absolute top-1.5 right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-black/40 backdrop-blur-md text-white/90 text-[9px]">
                            <Sparkles className="w-2.5 h-2.5" />
                            AI
                          </span>
                        )}
                      </div>
                      <div className="p-2.5 md:p-3">
                        <h3
                          className="text-[11px] md:text-sm font-bold text-slate-800 dark:text-slate-100 line-clamp-2 group-hover:text-sky-500 transition-colors leading-snug"
                          style={{ fontFamily: "'Noto Serif SC', serif" }}
                        >
                          {m.title}
                        </h3>
                        <p className="mt-1 text-[9px] md:text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                          {m.summary}
                        </p>
                        <div className="mt-2 flex items-center gap-2 text-[9px] md:text-[10px] text-slate-500 dark:text-slate-400">
                          <span className="flex items-center gap-0.5">
                            <MapPin className="w-2.5 h-2.5" />
                            {locationById(m.locationId)?.name}
                          </span>
                          {ppl.length > 0 && (
                            <span className="flex items-center gap-0.5 truncate">
                              <Users className="w-2.5 h-2.5" />
                              {ppl.join("、")}
                            </span>
                          )}
                          <span className="ml-auto text-slate-400">{m.emotion}</span>
                        </div>
                      </div>
                    </div>
                  </foreignObject>
                </g>
              );
            })}
          </svg>
        </motion.div>
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-center text-[10px] md:text-xs text-slate-400 mt-2"
      >
        左右拖动浏览时光河流 · 点卡片看记忆详情 · 点金色年份牌播放该年回忆
      </motion.p>
    </div>
  );
}
