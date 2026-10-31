"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useMotionValue } from "framer-motion";
import { useRouter, usePathname } from "next/navigation";
import { Sparkles, X, Send, ArrowRight, ShieldCheck, Mic, Volume2, VolumeX } from "lucide-react";

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
  memoryById,
  personById,
  type AssistantAnswer,
  type ShiguangMemory,
} from "@/data/shiguang";
import MemoryDetail from "./MemoryDetail";

interface Turn {
  role: "user" | "ai";
  text: string;
  result?: AssistantAnswer;
  source?: "deepseek" | "local";
}

const BALL_POS_KEY = "xiaoshi_ball_pos";

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
  const [detail, setDetail] = useState<ShiguangMemory | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
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
    setInput("");
    setTurns((t) => [...t, { role: "user", text: question }]);
    setThinking(true);

    let result: AssistantAnswer | null = null;
    let source: "deepseek" | "local" = "local";

    try {
      const res = await fetch("/api/assistant/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.answer) {
          result = {
            answer: data.answer,
            evidenceMemoryIds: data.evidenceMemoryIds ?? [],
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
      case "FOCUS_MAP_LOCATION":
        router.push(`/map?location=${p.locationId}`);
        break;
      case "PREVIEW_STORY":
        router.push(`/stories/${p.storyId}`);
        break;
      case "START_RECALL_MODE":
        router.push(`/recall?year=${p.year}`);
        break;
      case "OPEN_MEMORY":
        setDetail(memoryById(p.memoryId) ?? null);
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
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-500/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
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

              {turns.map((t, i) => (
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

                      {!!t.result?.evidenceMemoryIds.length && (
                        <div className="space-y-2">
                          <div className="text-[10px] text-slate-400">证据记忆</div>
                          {t.result.evidenceMemoryIds.map((id) => {
                            const m = memoryById(id);
                            if (!m) return null;
                            return (
                              <button
                                key={id}
                                onClick={() => setDetail(m)}
                                className="w-full flex items-center gap-3 p-2 rounded-xl glass-button text-left"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={m.cover} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0" />
                                <span className="min-w-0">
                                  <span className="block text-[11px] font-medium text-slate-700 dark:text-slate-200 truncate">
                                    {m.title}
                                  </span>
                                  <span className="block text-[10px] text-slate-400">
                                    {m.happenedAt.slice(0, 10)} · {personById(m.personIds[0])?.name}
                                  </span>
                                </span>
                              </button>
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
              ))}

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

      <MemoryDetail memory={detail} onClose={() => setDetail(null)} />
    </>
  );

  // 挂到 body 上，避免被外层容器的 transform 影响定位
  return mounted ? createPortal(content, document.body) : content;
}
