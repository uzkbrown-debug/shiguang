"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useMotionValue } from "framer-motion";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Sparkles, X, Send, ArrowRight, ShieldCheck, Mic, Volume2, VolumeX, MapPin, CheckCircle2, Compass } from "lucide-react";

// 浏览器语音识别（Web Speech API）的最小类型声明
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult:
    | ((event: {
        resultIndex: number;
        results: { isFinal: boolean; length: number; 0: { transcript: string } }[];
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

const SPEAK_KEY = "xiaoshi_auto_speak";
import {
  askAssistant,
  assistantSamples,
  locationById,
  memoryById,
  personById,
  type AssistantAnswer,
} from "@/data/shiguang";

interface Turn {
  role: "user" | "ai";
  text: string;
  result?: AssistantAnswer;
  source?: "deepseek" | "local";
}

const BALL_POS_KEY = "xiaoshi_ball_pos";

/** 本地规则降级时补一次「我去过没 / 谁去过」，不调模型 */
async function fetchPlaceCheck(question: string): Promise<{
  placeCheck?: AssistantAnswer["placeCheck"];
  places?: AssistantAnswer["places"];
} | null> {
  try {
    const res = await fetch("/api/assistant/place", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { placeCheck: data?.placeCheck ?? null, places: data?.places ?? null };
  } catch {
    return null;
  }
}

export default function XiaoshiAI() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [speakReplies, setSpeakReplies] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTextRef = useRef("");

  // 记住「自动朗读」开关
  useEffect(() => {
    setSpeakReplies(localStorage.getItem(SPEAK_KEY) === "1");
  }, []);

  // 卸载时停掉语音
  useEffect(
    () => () => {
      recognitionRef.current?.stop();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    },
    [],
  );

  // 面板打开后把光标放进输入框，省掉一次点击
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 220);
    return () => window.clearTimeout(id);
  }, [open]);

  // Esc 关面板（键盘用户别被浮层困住）
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const stopVoice = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  };

  const startVoice = () => {
    if (listening) {
      stopVoice();
      return;
    }
    setVoiceError("");
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Recognition = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceError("当前浏览器不支持语音识别，建议用 Edge 或 Chrome");
      return;
    }

    try {
      const rec = new Recognition();
      rec.lang = "zh-CN";
      rec.interimResults = true;
      rec.continuous = false;
      rec.onresult = (event) => {
        let text = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          text += event.results[i][0].transcript;
          if (event.results[i].isFinal) finalTextRef.current = text;
        }
        setInput(text);
      };
      rec.onerror = (event) => {
        const map: Record<string, string> = {
          "not-allowed": "麦克风权限被拒绝，请点地址栏的锁图标允许麦克风",
          "service-not-allowed": "浏览器禁止了语音服务，请检查权限设置",
          "no-speech": "没有听到声音，再说一次试试",
          "audio-capture": "没有检测到麦克风设备",
          network: "语音识别服务连不上（Edge 通常更稳）",
        };
        setVoiceError(map[event.error] ?? `语音识别出错：${event.error}`);
        setListening(false);
        recognitionRef.current = null;
      };
      rec.onend = () => {
        setListening(false);
        recognitionRef.current = null;
        const text = finalTextRef.current.trim();
        finalTextRef.current = "";
        if (text) send(text); // 说完自动发送
        else setInput("");
      };
      recognitionRef.current = rec;
      setListening(true);
      rec.start();
    } catch {
      setVoiceError("语音识别启动失败，换个浏览器试试");
      setListening(false);
    }
  };

  const toggleSpeak = () => {
    const next = !speakReplies;
    setSpeakReplies(next);
    localStorage.setItem(SPEAK_KEY, next ? "1" : "0");
    if (!next && typeof window !== "undefined") window.speechSynthesis?.cancel();
  };

  const speak = (text: string) => {
    if (!speakReplies || typeof window === "undefined" || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text.slice(0, 300));
      utterance.lang = "zh-CN";
      utterance.rate = 1.05;
      window.speechSynthesis.speak(utterance);
    } catch {
      /* 朗读失败不影响文字回答 */
    }
  };
  const [turns, setTurns] = useState<Turn[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ballRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const ballX = useMotionValue(0);
  const ballY = useMotionValue(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  // 面板贴着球展开：球在右半边就从右边弹出，在左半边就从左边弹出
  const [panelPos, setPanelPos] = useState<{ side: "left" | "right"; bottom: number }>({
    side: "right",
    bottom: 96,
  });

  const openPanel = () => {
    const el = ballRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const side: "left" | "right" =
        rect.left + rect.width / 2 > window.innerWidth / 2 ? "right" : "left";
      const bottom = Math.min(
        Math.max(16, window.innerHeight - rect.bottom - rect.height / 2),
        Math.max(16, window.innerHeight - 420),
      );
      setPanelPos({ side, bottom });
    }
    setOpen(true);
  };

  // 恢复小球上次被拖到的位置
  useEffect(() => {
    try {
      const saved = localStorage.getItem(BALL_POS_KEY);
      if (saved) {
        const p = JSON.parse(saved) as { x: number; y: number };
        if (typeof p.x === "number" && typeof p.y === "number") {
          ballX.set(p.x);
          ballY.set(p.y);
        }
      }
    } catch {
      /* ignore */
    }
  }, [ballX, ballY]);

  const clampBall = () => {
    const el = ballRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let nx = ballX.get();
    let ny = ballY.get();
    if (rect.left < pad) nx += pad - rect.left;
    if (rect.right > window.innerWidth - pad) nx -= rect.right - (window.innerWidth - pad);
    if (rect.top < 72) ny += 72 - rect.top;
    if (rect.bottom > window.innerHeight - pad) ny -= rect.bottom - (window.innerHeight - pad);
    ballX.set(nx);
    ballY.set(ny);
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, open]);

  const send = async (q: string) => {
    const question = q.trim();
    if (!question || thinking) return;
    // 最近 2 轮问答一起带上，后端只用它消解指代（「那次是和谁去的」）
    const history = turns.slice(-4).map((t) => ({ role: t.role, text: t.text }));
    setInput("");
    setTurns((t) => [...t, { role: "user", text: question }]);
    setThinking(true);

    let result: AssistantAnswer | null = null;
    let source: "deepseek" | "local" = "local";

    try {
      const res = await fetch("/api/assistant/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.answer) {
          result = {
            answer: data.answer,
            evidenceMemoryIds: data.evidenceMemoryIds ?? [],
            // 后端顺手算好的「记忆 → 攻略」映射：其它入口可能用到
            evidenceGuideIds: data.evidenceGuideIds ?? {},
            evidenceCards: data.evidenceCards ?? [],
            placeCheck: data.placeCheck ?? null,
            places: data.places ?? null,
          };
          source = "deepseek";
        }
      }
    } catch {
      /* 后端不可用时走本地规则降级 */
    }

    if (!result) {
      result = askAssistant(question);
      source = "local";
      // 本地规则不会算「去过没」，补一次只查数据、不调模型的核查
      const extra = await fetchPlaceCheck(question);
      if (extra) result = { ...result, ...extra };
    }

    setTurns((t) => [...t, { role: "ai", text: result!.answer, result: result!, source }]);
    setThinking(false);
    speak(result!.answer);
  };

  const runAction = (answer: AssistantAnswer) => {
    const a = answer.action;
    if (!a) return;
    const p = a.params;
    switch (a.type) {
      case "NAVIGATE_TIMELINE":
        router.push(`/timeline?year=${p.year}`);
        break;
      case "FILTER_BY_PERSON":
        router.push(`/timeline?person=${p.personId}`);
        break;
      case "FOCUS_MAP_LOCATION": {
        // 地图页按关键词过滤，所以传地名而不是 location id
        const place = locationById(p.locationId)?.name ?? "";
        router.push(place ? `/map?q=${encodeURIComponent(place)}` : "/map");
        break;
      }
      case "PREVIEW_STORY":
        router.push(`/stories/${p.storyId}`);
        break;
      case "START_RECALL_MODE":
        router.push(`/recall?year=${p.year}`);
        break;
      case "OPEN_MEMORY":
        // 不再弹层：直接传送到这条记忆的完整页面
        router.push(`/memories/${p.memoryId}`);
        break;
    }
    setOpen(false);
  };

  if (pathname.startsWith("/login")) return null;

  const content = (
    <>
      {/* 悬浮球：可拖动，点击展开 */}
      <AnimatePresence>
        {!open && (
          <motion.div
            ref={ballRef}
            drag
            dragMomentum={false}
            dragElastic={0.05}
            style={{ x: ballX, y: ballY }}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ type: "spring", stiffness: 300, damping: 24 }}
            onDragStart={() => {
              dragging.current = true;
            }}
            onDragEnd={() => {
              clampBall();
              try {
                localStorage.setItem(BALL_POS_KEY, JSON.stringify({ x: ballX.get(), y: ballY.get() }));
              } catch {
                /* ignore */
              }
              setTimeout(() => {
                dragging.current = false;
              }, 150);
            }}
            className="fixed right-5 bottom-24 md:bottom-8 z-[70] cursor-grab active:cursor-grabbing touch-none select-none"
          >
            <button
              type="button"
              onClick={() => {
                if (dragging.current) return;
                openPanel();
              }}
              title="小拾 AI · 可拖动，点击展开"
              aria-label="打开小拾 AI"
              aria-expanded={open}
              className="relative w-14 h-14 rounded-full flex items-center justify-center text-white shadow-xl hover:scale-105 transition-transform"
              style={{
                backgroundImage: "linear-gradient(135deg, #06b6d4 0%, #3b82f6 55%, #6366f1 100%)",
              }}
            >
              <Sparkles className="w-6 h-6" />
              <span className="absolute inset-0 rounded-full ring-1 ring-white/30" />
              <span className="absolute -inset-1 rounded-full bg-sky-400/20 animate-ping" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.aside
            role="dialog"
            aria-label="小拾 AI"
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            style={{
              position: "fixed", // 覆盖 .glass-card 的 position: relative
              transformOrigin: panelPos.side === "right" ? "bottom right" : "bottom left",
            }}
            className={`fixed bottom-24 z-[75] w-[min(92vw,380px)] max-h-[min(70vh,600px)] glass-card rounded-2xl border-white/40 dark:border-white/10 flex flex-col overflow-hidden shadow-2xl ${
              panelPos.side === "right" ? "right-4" : "left-4"
            }`}
          >
            <header className="flex items-center gap-2 px-4 py-3 border-b border-slate-200/50 dark:border-white/10">
              <Sparkles className="w-4 h-4 text-sky-500" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">小拾 AI</div>
                <div className="text-[10px] text-slate-400">基于你的记忆回答问题</div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="关闭小拾"
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-500/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            <div
              ref={scrollRef}
              role="log"
              aria-live="polite"
              className="flex-1 overflow-y-auto p-4 space-y-4"
            >
              {turns.length === 0 && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    问我任何关于你记忆的问题。我的回答只依据你的真实记录，并会附上证据。
                  </p>
                  {assistantSamples.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="w-full text-left text-xs px-3 py-2.5 rounded-xl glass-button text-slate-600 dark:text-slate-300"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {turns.map((t, i) => {
                const pc = t.result?.placeCheck ?? null;
                const myPlaces = t.result?.places ?? null;
                // 证据方块：后端给了展示信息就用后端的（新上传的记忆本地没有），
                // 没有就退回本地演示数据。方块一律去「这条记忆」，攻略只在
                // 「去过的人」那一栏出现 —— 同城三条记忆点进同一篇攻略会像 bug。
                const cards = t.result?.evidenceCards ?? [];
                const evidenceItems: {
                  id: string;
                  title: string;
                  date: string;
                  place: string;
                  cover: string | null;
                  people: string[];
                  tags: string[];
                }[] = cards.length
                  ? cards.map((c) => ({
                      id: c.id,
                      title: c.title,
                      date: c.date ?? "",
                      place: c.place ?? "",
                      cover: c.cover ?? null,
                      people: c.people ?? [],
                      tags: c.tags ?? [],
                    }))
                  : (t.result?.evidenceMemoryIds ?? []).flatMap((id) => {
                      const m = memoryById(id);
                      if (!m) return [];
                      return [
                        {
                          id,
                          title: m.title,
                          date: m.happenedAt.slice(0, 10),
                          place: locationById(m.locationId)?.name ?? "",
                          cover: m.cover,
                          people: m.personIds
                            .map((pid) => personById(pid)?.name ?? "")
                            .filter((name) => name && name !== "我"),
                          tags: m.tags.slice(0, 3),
                        },
                      ];
                    });
                return (
                <div key={i} className={t.role === "user" ? "text-right" : ""}>
                  {t.role === "user" ? (
                    <span className="inline-block max-w-[85%] px-3.5 py-2 rounded-2xl bg-sky-500 text-white text-xs text-left">
                      {t.text}
                    </span>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">{t.text}</p>
                      {t.source && (
                        <div className="flex items-center gap-1 text-[10px] text-slate-400">
                          <Sparkles className="w-2.5 h-2.5" />
                          {t.source === "deepseek"
                            ? "基于你的记忆库回答"
                            : "基于关键词匹配"}
                        </div>
                      )}

                      {t.result?.uncertainty && (
                        <p className="flex items-start gap-1.5 text-[10px] text-amber-500 bg-amber-500/10 rounded-lg px-2.5 py-2">
                          <ShieldCheck className="w-3 h-3 mt-0.5 shrink-0" />
                          {t.result.uncertainty}
                        </p>
                      )}

                      {/* 地点核查：我去过没 → 提示；没去过 → 谁去过，点一下就传送到 TA 的攻略 */}
                      {pc && (
                        <div
                          className={`rounded-xl px-3 py-2.5 space-y-1.5 ${
                            pc.visited ? "bg-emerald-500/10" : "bg-slate-500/10"
                          }`}
                        >
                          <div
                            className={`flex items-center gap-1.5 text-[11px] font-medium ${
                              pc.visited
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-slate-500 dark:text-slate-300"
                            }`}
                          >
                            {pc.visited ? (
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            ) : (
                              <MapPin className="w-3.5 h-3.5 shrink-0" />
                            )}
                            <span className="truncate">
                              {pc.visited
                                ? `你去过${pc.place}${
                                    pc.level === "place" && pc.city && pc.city !== pc.place
                                      ? `（${pc.city}）`
                                      : ""
                                  }${pc.visitCount > 1 ? ` · ${pc.visitCount} 次` : ""}`
                                : `你还没去过${pc.place}`}
                            </span>
                            {pc.checkIn === "visited" && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-[9px] text-emerald-600 dark:text-emerald-400 shrink-0">
                                已打卡
                              </span>
                            )}
                            {pc.checkIn === "wish" && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-[9px] text-amber-600 dark:text-amber-400 shrink-0">
                                想去
                              </span>
                            )}
                          </div>
                          {pc.visited && (pc.firstVisit || pc.lastVisit) && (
                            <div className="text-[10px] text-slate-400">
                              {pc.firstVisit && pc.lastVisit && pc.firstVisit !== pc.lastVisit
                                ? `第一次 ${pc.firstVisit} · 最近 ${pc.lastVisit}`
                                : `记录于 ${pc.firstVisit ?? pc.lastVisit}`}
                              <span className="text-slate-400/70">（按记忆记录算）</span>
                            </div>
                          )}
                          {pc.visited && !!pc.evidence?.length && (
                            <div className="text-[10px] text-slate-400 truncate">
                              依据：{pc.evidence[0].title}
                              {pc.evidence[0].place ? `（${pc.evidence[0].place}）` : ""}
                            </div>
                          )}

                          {!!pc.others?.length ? (
                            <div className="pt-1 space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] text-slate-400 truncate">
                                  去过的人 · {pc.others.length} 位
                                  {!!pc.hiddenOthers &&
                                    `（另有 ${pc.hiddenOthers} 位仅好友可见）`}
                                </span>
                                <Link
                                  href={`/map?q=${encodeURIComponent(pc.city || pc.place)}`}
                                  onClick={() => setOpen(false)}
                                  className="text-[10px] text-sky-500 hover:underline shrink-0"
                                >
                                  地图上看
                                </Link>
                              </div>
                              {pc.others.map((o) => (
                                <Link
                                  key={o.userId}
                                  href={o.guideId ? `/travel/${o.guideId}` : `/memories/${o.memoryId}`}
                                  onClick={() => setOpen(false)}
                                  title={o.guideId ? "打开 TA 的攻略" : "打开 TA 的记忆"}
                                  className="group flex items-center gap-2 rounded-lg bg-white/50 dark:bg-white/5 px-2 py-1.5 hover:ring-1 hover:ring-sky-400/50 transition-all"
                                >
                                  {o.avatar ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={o.avatar}
                                      alt=""
                                      className="w-6 h-6 rounded-full object-cover shrink-0"
                                    />
                                  ) : (
                                    <span className="w-6 h-6 rounded-full bg-slate-400/40 shrink-0" />
                                  )}
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-[11px] text-slate-700 dark:text-slate-200 truncate">
                                      {o.name}
                                      {o.count > 1 ? ` · ${o.count} 次` : ""}
                                    </span>
                                    <span className="block text-[10px] text-slate-400 truncate">
                                      {o.guideTitle || o.title || "有记录"}
                                    </span>
                                  </span>
                                  <span className="shrink-0 flex items-center gap-1 text-[10px] text-sky-500">
                                    {o.guideId ? "攻略" : "记忆"}
                                    <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                                  </span>
                                </Link>
                              ))}
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-400">
                              数据库里还没有人记录过这里。
                            </div>
                          )}
                        </div>
                      )}

                      {/* 我去过哪些地方：按城市聚合的足迹 */}
                      {!!myPlaces?.length && (
                        <div className="rounded-xl bg-sky-500/10 px-3 py-2.5">
                          <div className="flex items-center gap-1.5 text-[11px] font-medium text-sky-600 dark:text-sky-400">
                            <Compass className="w-3.5 h-3.5" />
                            你去过 {myPlaces.length} 个地方
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {myPlaces.slice(0, 10).map((p) => (
                              <Link
                                key={p.city}
                                href={`/map?q=${encodeURIComponent(p.city)}`}
                                onClick={() => setOpen(false)}
                                title={p.last ? `最近一次 ${p.last}` : "在地图上看看"}
                                className="px-2 py-1 rounded-lg bg-white/50 dark:bg-white/5 text-[10px] text-slate-600 dark:text-slate-300 hover:ring-1 hover:ring-sky-400/50 transition-all"
                              >
                                {p.city}
                                <span className="text-slate-400"> · {p.count}</span>
                              </Link>
                            ))}
                            {myPlaces.length > 10 && (
                              <span className="px-2 py-1 text-[10px] text-slate-400">
                                还有 {myPlaces.length - 10} 个
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {!!evidenceItems.length && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-1 text-[10px] text-slate-400">
                            证据记忆
                            <span className="text-slate-300 dark:text-slate-500">· 点方块直接打开</span>
                          </div>
                          {evidenceItems.map((item) => {
                            // 证据方块一律去这条记忆本身；攻略只在「去过的人」那一栏
                            const meta = [item.date, item.place, item.people.join("、")]
                              .filter(Boolean)
                              .join(" · ");
                            return (
                              <Link
                                key={item.id}
                                href={`/memories/${item.id}`}
                                onClick={() => setOpen(false)}
                                title="打开这条记忆"
                                className="group w-full flex items-center gap-3 p-2 rounded-xl glass-button text-left hover:ring-1 hover:ring-sky-400/50 transition-all"
                              >
                                {item.cover ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={item.cover}
                                    alt={item.title}
                                    className="w-11 h-11 rounded-lg object-cover shrink-0"
                                  />
                                ) : (
                                  <span className="w-11 h-11 rounded-lg bg-slate-400/30 shrink-0" />
                                )}
                                <span className="min-w-0 flex-1">
                                  <span className="block text-[11px] font-medium text-slate-700 dark:text-slate-200 truncate">
                                    {item.title}
                                  </span>
                                  <span className="block text-[10px] text-slate-400 truncate">
                                    {meta}
                                  </span>
                                  {!!item.tags.length && (
                                    <span className="block text-[10px] text-slate-400/80 truncate">
                                      {item.tags.map((tag) => `#${tag}`).join(" ")}
                                    </span>
                                  )}
                                </span>
                                <span className="shrink-0 flex items-center gap-1 text-[10px] text-sky-500 dark:text-sky-400">
                                  记忆
                                  <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                                </span>
                              </Link>
                            );
                          })}
                        </div>
                      )}

                      {t.result?.action && (
                        <button
                          onClick={() => runAction(t.result!)}
                          className="flex items-center gap-1.5 text-[11px] px-3 py-2 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-500/20 transition-colors"
                        >
                          {t.result.action.label}
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                );
              })}

              {thinking && (
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span className="w-3.5 h-3.5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
                  小拾正在翻你的记忆…
                </div>
              )}
            </div>

            <div className="p-3 border-t border-slate-200/50 dark:border-white/10">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={startVoice}
                  title={listening ? "停止聆听" : "语音输入（点一下开始说话）"}
                  className={`p-2.5 rounded-xl transition-colors ${
                    listening
                      ? "bg-rose-500 text-white animate-pulse"
                      : "glass-button text-slate-600 dark:text-slate-200"
                  }`}
                >
                  <Mic className="w-4 h-4" />
                </button>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send(input)}
                  disabled={thinking}
                  placeholder={thinking ? "小拾正在回答…" : listening ? "正在听你说…" : "问问你的记忆…"}
                  className="glass-input flex-1 !py-2.5 text-xs text-slate-800 dark:text-slate-100 disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={toggleSpeak}
                  title={speakReplies ? "已开启自动朗读（点击关闭）" : "开启回答自动朗读"}
                  className={`p-2.5 rounded-xl transition-colors ${
                    speakReplies
                      ? "bg-sky-500 text-white"
                      : "glass-button text-slate-500 dark:text-slate-300"
                  }`}
                >
                  {speakReplies ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => send(input)}
                  disabled={thinking}
                  className="p-2.5 rounded-xl bg-sky-500 text-white hover:bg-sky-600 transition-colors disabled:opacity-60"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>

              {(listening || voiceError) && (
                <div className={`mt-2 text-[10px] ${voiceError ? "text-rose-500" : "text-rose-400"}`}>
                  {voiceError || "正在聆听… 说完会自动发送"}
                </div>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );

  // 挂到 body 上，避免被外层容器的 transform 影响定位
  return mounted ? createPortal(content, document.body) : content;
}
