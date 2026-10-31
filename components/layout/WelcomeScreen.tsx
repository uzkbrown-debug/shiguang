"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { siteConfig } from "@/siteConfig";

const CLIPS = [
  "/videos/boot/boot-1.mp4?v=2",
  "/videos/boot/boot-2.mp4?v=2",
  "/videos/boot/boot-3.mp4?v=2",
];
const MIN_SHOW_MS = 2400;
const FADE_MS = 1000;
const WARM_MS = 800; // 交班后留给站点挂载、稳住的时间

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** 开场期间真正要做的事：一件一件来，进度条跟着它们的完成度走。
    这里每一步都**真的等**：没准备好就不往下走，也就不放人进主页。 */
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const STEPS: { label: string; run: () => Promise<void> }[] = [
  {
    label: "连接记忆库",
    run: async () => {
      // 后端可能还在起，等它真的回答为止（浏览器这会儿已经先打开了）
      // 问 /readyz（Next 自己的路由）而不是 /api/health：后者走代理，
      // 后端没起来时会在控制台刷一堆 Failed to proxy 的红字。
      for (let i = 0; i < 180; i++) {
        try {
          const res = await fetch("/readyz", { cache: "no-store" });
          if (res.ok && ((await res.json()) as { ready?: boolean }).ready) return;
        } catch {
          /* 还没起来，继续等 */
        }
        await wait(500);
      }
      throw new Error("记忆库没有响应");
    },
  },
  {
    label: "读取记忆数据",
    run: async () => {
      for (let i = 0; i < 30; i++) {
        try {
          const res = await fetch("/api/memories?limit=1", { cache: "no-store" });
          if (res.ok) return;
        } catch {
          /* ignore */
        }
        await wait(400);
      }
      throw new Error("记忆数据读取失败");
    },
  },
  {
    label: "整理界面",
    run: () => wait(150).then(() => undefined),
  },
];

interface StartupStage {
  stage: string;
  label: string;
  state: string;
  seconds: number;
}

export default function WelcomeScreen() {
  const [show, setShow] = useState(false);
  const [clipIndex, setClipIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [warming, setWarming] = useState(false);
  const [done, setDone] = useState(0);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState("");
  const [warning, setWarning] = useState("");
  const [stages, setStages] = useState<StartupStage[]>([]);
  const clip = CLIPS[clipIndex % CLIPS.length];
  const [hintWaiting, setHintWaiting] = useState(false);
  const pathname = usePathname();

  const startedAt = useRef(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const pctRef = useRef<HTMLSpanElement | null>(null);
  const shownRef = useRef(0); // 进度条当前值（0~1），逐帧逼近目标，所以是平滑的
  const doneRef = useRef(0);
  const durationRef = useRef(0);
  const warmingRef = useRef(false);
  const bootStartRef = useRef(0);
  const videoDone = useRef(false);
  const stepsDone = useRef(false);
  const finishRef = useRef<() => void>(() => {});

  // 播不播、播哪一条，都由 layout 里的内联脚本提前写在 <html> 上，这里只读
  useIsoLayoutEffect(() => {
    const root = document.documentElement;
    if (root.dataset.boot !== "1") return;
    setClipIndex(0);
    setShow(true);
    startedAt.current = Date.now();
  }, []);

  // 收尾三步：先把站点在遮罩后面挂起来（挂载开销全被盖住）→ 等它站住 → 再淡出
  const finish = useCallback(() => {
    if (warming) return;
    // 还没加载完就不放人进去：点一下只提示"还在加载"
    if (!stepsDone.current) {
      setHintWaiting(true);
      setTimeout(() => setHintWaiting(false), 1600);
      return;
    }
    const waited = Date.now() - startedAt.current;
    const hold = Math.max(0, MIN_SHOW_MS - waited);
    setWarming(true);
    setTimeout(() => setLeaving(true), hold + WARM_MS);
    setTimeout(() => setShow(false), hold + WARM_MS + FADE_MS + 200);
  }, [warming]);

  finishRef.current = finish;

  // 逐件事推进。有 start.bat 的启动记录时，进度条就按那几步的**真实耗时比例**来走，
  // 也就是"命令行当时花了多久，这里就占多大一段"；没有记录就退回到内置的三步。
  useEffect(() => {
    if (!show || !duration) return;
    let alive = true;

    const runSteps = async () => {
      const usesLog = stages.length > 0;
      const totalWeight = usesLog
        ? stages.reduce((sum, s) => sum + (s.seconds || 0.5), 0) || 1
        : STEPS.length;
      const unit = (duration * 1000 * 0.8) / totalWeight; // 留 20% 给片子收尾
      const count = usesLog ? stages.length : STEPS.length;

      for (let i = 0; i < count; i++) {
        if (!alive) return;
        const label = usesLog ? stages[i].label : STEPS[i].label;
        setCurrent(label);
        const work = usesLog
          ? Promise.resolve()
          : STEPS[i].run().catch((e: Error) => {
              if (label !== "整理界面") setWarning(e.message || "记忆库暂时没连上");
            });
        const weight = usesLog ? stages[i].seconds || 0.5 : 1;
        await Promise.all([work, new Promise((r) => setTimeout(r, unit * weight))]);
        if (!alive) return;
        setCurrent("");
        setDone(i + 1);
      }
      stepsDone.current = true;
      if (videoDone.current) finishRef.current();
    };

    runSteps();
    return () => {
      alive = false;
    };
  }, [show, duration, stages]);

  // 兜底：短片没加载出来 / 加载慢 / 标签页被后台限速时，别把用户永远关在开场屏里
  useEffect(() => {
    if (!show) return;
    const limit = (duration > 0 ? duration * 1000 : 9000) + 8000;
    const timer = setTimeout(() => finishRef.current(), limit);
    return () => clearTimeout(timer);
  }, [show, duration]);

  // 读 start.bat 写下的启动记录：开场动画里展示的就是命令行刚才真正做过的事
  // 注意：要等 /api/health 通了再去读，否则后端还在起，代理会往控制台刷
  // "Failed to proxy ... ECONNREFUSED" 这种看着像报错的红字。
  useEffect(() => {
    if (!show) return;
    let alive = true;

    const load = async () => {
      for (let i = 0; i < 180 && alive; i++) {
        try {
          const probe = await fetch("/readyz", { cache: "no-store" });
          if (probe.ok && ((await probe.json()) as { ready?: boolean }).ready) break;
        } catch {
          /* 后端还没起来，继续等 */
        }
        await wait(500);
      }
      if (!alive) return;
      try {
        const res = await fetch("/api/startup", { cache: "no-store" });
        if (!res.ok || !alive) return;
        const data = (await res.json()) as { stages?: StartupStage[] };
        if (!data?.stages?.length) return;
        setStages(data.stages.filter((s) => s.state !== "failed"));
      } catch {
        /* 读不到就用兜底的通用步骤 */
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, [show]);

  // 开始收尾就把站点交出来，让它在遮罩后面挂载，淡出时已经没有活了
  useEffect(() => {
    if (show && warming) delete document.documentElement.dataset.boot;
  }, [show, warming]);

  useEffect(() => {
    doneRef.current = done;
  }, [done]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    warmingRef.current = warming;
  }, [warming]);

  // 进度条：每帧直接改 DOM，不触发 React 重渲染。
  // 目标 = max(真正做完的比例, 按时间线性推进的比例)，但不允许比真实进度超前超过一格，
  // 所以看上去是一条匀速的线，而不是 20%、40% 这样一格一格跳。
  useEffect(() => {
    if (!show) return;
    bootStartRef.current = performance.now();
    const total = STEPS.length + 1;
    let raf = 0;
    let lastPct = -1;

    const loop = () => {
      const elapsed = performance.now() - bootStartRef.current;
      const durMs = (durationRef.current || 8) * 1000;
      const stepProgress = doneRef.current / total;
      const timeProgress = Math.min(0.98, elapsed / durMs);
      let target = Math.min(Math.max(stepProgress, timeProgress), stepProgress + 1 / total);
      if (warmingRef.current) target = 1;

      shownRef.current += (target - shownRef.current) * 0.06;
      if (barRef.current) barRef.current.style.transform = `scaleX(${shownRef.current.toFixed(4)})`;

      const pct = Math.round(shownRef.current * 100);
      if (pct !== lastPct && pctRef.current) {
        pctRef.current.textContent = `${pct}%`;
        lastPct = pct;
      }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [show]);

  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " ") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show, finish]);

  // 登录页不播开场动画（要让人立刻看到登录框）。
  // 但 layout 的内联脚本已经可能把 data-boot=1 打在 <html> 上了，而那条 CSS 会
  // 隐藏全站内容 —— 不摘掉这个标记，登录页就是一片空白。这里兜底摘掉。
  useIsoLayoutEffect(() => {
    if (pathname.startsWith("/login")) delete document.documentElement.dataset.boot;
  }, [pathname]);

  if (pathname.startsWith("/login") || !show) return null;

  return (
    <div
      onClick={finish}
      className={`sg-boot-overlay fixed inset-0 z-[99999] overflow-hidden bg-black transition-opacity ease-in-out ${
        leaving ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      {/* 全屏短片：单独一层，强制走 GPU 合成 */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ transform: "translateZ(0)", willChange: "transform", backfaceVisibility: "hidden" }}
        src={clip}
        autoPlay
        muted
        playsInline
        preload="auto"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onEnded={() => {
          // 加载还没完成就接着播下一段，直到就绪 —— 不会让人干等一个静止的画面
          if (stepsDone.current) {
            videoDone.current = true;
            finishRef.current();
          } else {
            videoDone.current = false;
            setClipIndex((i) => (i + 1) % CLIPS.length);
          }
        }}
        onError={finish}
      />

      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/75 to-transparent" />
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/55 to-transparent" />

      {/* 站名 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        <div className="sg-boot-rise flex items-center justify-center space-x-1">
          <span
            className="text-4xl md:text-6xl font-bold tracking-tight bg-gradient-to-r from-cyan-200 via-sky-300 to-violet-300 bg-clip-text text-transparent"
            style={{ fontFamily: "'Noto Serif SC', serif", filter: "drop-shadow(0 0 24px rgba(56,189,248,0.35))" }}
          >
            拾光
          </span>
          <span className="text-4xl md:text-6xl font-bold text-sky-300/70" style={{ fontFamily: "serif" }}>
            ·
          </span>
          <span
            className="text-2xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-sky-200 via-blue-200 to-fuchsia-200 bg-clip-text text-transparent"
            style={{ fontFamily: "'Noto Serif SC', serif" }}
          >
            数字记忆馆
          </span>
        </div>

        <p className="sg-boot-fade-slow mt-5 text-[11px] md:text-sm tracking-[0.35em] text-white/55">
          {siteConfig.bio}
        </p>
      </div>

      {/* 左下角的启动清单：命令行刚刚真正做过的事（有真实耗时就用真实的） */}
      <div className="absolute left-8 md:left-16 bottom-24 md:bottom-28 space-y-1 font-mono text-[11px] leading-5">
        {stages.length > 0
          ? stages.slice(0, done).map((s) => (
              <div key={s.stage} className="text-cyan-200/70">
                <span className="text-cyan-300/90">✓</span> {s.label}
                <span className="ml-2 text-white/35">{s.seconds ? `${s.seconds}s` : ""}</span>
              </div>
            ))
          : STEPS.slice(0, done).map((step) => (
              <div key={step.label} className="text-cyan-200/70">
                <span className="text-cyan-300/90">✓</span> {step.label}
              </div>
            ))}
        {current && (
          <div className="text-white/60">
            <span className="sg-boot-dots">•</span> {current}
          </div>
        )}
        {stages.length === 0 && (
          <div className="pt-1 text-[10px] text-white/25">
            启动记录：命令行这次是从后台起来的，没有留下过程
          </div>
        )}
      </div>

      {/* 底部进度 + 提示 */}
      <div className="absolute bottom-10 left-0 right-0 px-8 md:px-16">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between text-[11px] text-white/45 mb-2 tracking-wider">
            <span>
              {warming ? "正在进入…" : current ? `${current}…` : "记忆正在加载"}
              {warning && <span className="ml-2 text-amber-300/80">{warning}</span>}
            </span>
            <span ref={pctRef} className="tabular-nums">
              0%
            </span>
          </div>
          <div className="h-[3px] w-full rounded-full bg-white/12 overflow-hidden">
            <div
              ref={barRef}
              className="h-full w-full origin-left rounded-full bg-gradient-to-r from-cyan-300 to-violet-400"
              style={{ transform: "scaleX(0)" }}
            />
          </div>
          <p className="sg-boot-fade-slow mt-4 text-center text-[11px] text-white/40 tracking-widest">
            {hintWaiting ? "还在加载，稍等一下…" : "加载完成后点击进入 · 也可以等它自己放完"}
          </p>
        </div>
      </div>
    </div>
  );
}
