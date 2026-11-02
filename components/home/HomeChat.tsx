"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Sparkles, Sun, CloudSun, CloudFog, CloudRain, Snowflake, CloudLightning, ChevronUp } from "lucide-react";
import type { WeatherData } from "@/components/home/WeatherCard";

interface Msg {
  role: "user" | "ai";
  text: string;
}

const QUICK = ["今天适合去哪", "我去过哪些地方", "帮我写今天的记忆", "去年的今天"];

const W_ICONS: Record<string, typeof Sun> = {
  sun: Sun,
  "cloud-sun": CloudSun,
  fog: CloudFog,
  rain: CloudRain,
  snow: Snowflake,
  storm: CloudLightning,
};

/**
 * 首页的小拾对话卡：和后端 /api/assistant/query 直连，
 * 和小拾浮窗共用同一套能力（地点核查、证据记忆、多轮上下文）。
 */
export default function HomeChat({
  name,
  memoryCount,
  cityCount,
  weather,
}: {
  name?: string | null;
  memoryCount: number;
  cityCount: number;
  weather?: WeatherData | null;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const scrollToEnd = () => {
    requestAnimationFrame(() => {
      const el = boxRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  const ask = async (raw: string) => {
    const question = raw.trim();
    if (!question || busy) return;
    setInput("");
    const history = msgs.slice(-6).map((m) => ({ role: m.role, text: m.text }));
    setMsgs((prev) => [...prev, { role: "user", text: question }]);
    setBusy(true);
    scrollToEnd();
    try {
      const res = await fetch("/api/assistant/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { answer?: string };
      const answer = (data.answer ?? "").trim() || "这一条我没在记忆里找到对应的地方。";
      setMsgs((prev) => [...prev, { role: "ai", text: answer }]);
    } catch {
      setMsgs((prev) => [...prev, { role: "ai", text: "刚刚没连上记忆库，稍后再问我一次。" }]);
    } finally {
      setBusy(false);
      scrollToEnd();
    }
  };

  const greeting =
    memoryCount > 0
      ? `我是小拾。你已经在这里留下 ${memoryCount} 段记忆${cityCount ? `、走过 ${cityCount} 座城市` : ""}——想问什么直接说。`
      : "我是小拾。等你传第一批照片，我就能认出那是哪座城市、哪一天、和谁在一起。";

  return (
    <section className="w-full h-full relative glass-card rounded-3xl border-white/40 dark:border-white/10 overflow-hidden flex flex-col min-h-[540px] lg:min-h-[660px]">
      {/* 标题栏 */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/20 dark:border-white/10">
        <span className="w-7 h-7 rounded-full bg-gradient-to-br from-sky-400 to-emerald-400 grid place-items-center text-[11px] font-bold text-slate-900">
          拾
        </span>
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">小拾</span>
        <span className="ml-auto text-[10px] text-slate-400 border border-white/25 dark:border-white/15 rounded-full px-2 py-0.5">
          {name ? `${name} 的记忆` : "记得你去过的地方"}
        </span>
      </div>

      {/* 天气：照参考图那种竖排小卡，固定在右上角 */}
      {weather?.ok && (
        <div className="hidden lg:flex flex-col items-center absolute right-4 top-16 w-[172px] rounded-2xl bg-white/55 dark:bg-white/5 border border-white/50 dark:border-white/10 px-3 py-3 z-10">
          <div className="flex items-center gap-0.5 text-[10.5px] text-slate-500 dark:text-slate-400">
            {weather.city ?? "泉州"}
            <ChevronUp className="w-2.5 h-2.5 text-sky-500" />
          </div>
          {(() => {
            const Icon = W_ICONS[weather.icon ?? "cloud-sun"] ?? CloudSun;
            return <Icon className="w-7 h-7 my-1.5 text-amber-400" strokeWidth={1.7} />;
          })()}
          <div className="flex items-start leading-none">
            <span className="text-[30px] font-black text-slate-800 dark:text-white tabular-nums">
              {weather.temperature ?? "--"}
            </span>
            <span className="text-[15px] font-bold text-slate-500 dark:text-slate-300 mt-0.5">°</span>
          </div>
          <div className="mt-1 text-[11.5px] text-slate-500 dark:text-slate-300">{weather.text ?? "多云"}</div>
          <div className="mt-0.5 text-[10.5px] text-slate-400 tabular-nums">
            {weather.low ?? "--"}° / {weather.high ?? "--"}°
          </div>
        </div>
      )}

      {/* 消息区 */}
      <div ref={boxRef} className="flex-1 overflow-y-auto pl-4 pr-4 lg:pr-[196px] py-3 space-y-3">
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-[12.5px] leading-relaxed bg-white/60 dark:bg-white/5 border border-white/50 dark:border-white/10 text-slate-700 dark:text-slate-200">
          {greeting}
        </div>

        <AnimatePresence initial={false}>
          {msgs.map((m, i) => (
            <motion.div
              key={`${m.role}-${i}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-relaxed whitespace-pre-wrap ${
                m.role === "user"
                  ? "ml-auto bg-sky-500/20 border border-sky-400/35 text-sky-900 dark:text-sky-50 rounded-tr-sm"
                  : "bg-white/60 dark:bg-white/5 border border-white/50 dark:border-white/10 text-slate-700 dark:text-slate-200 rounded-tl-sm"
              }`}
            >
              {m.text}
            </motion.div>
          ))}
        </AnimatePresence>

        {busy && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce" />
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce [animation-delay:120ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce [animation-delay:240ms]" />
            小拾正在翻你的记忆
          </div>
        )}
      </div>

      {/* 快捷问题 */}
      <div className="flex flex-wrap gap-1.5 px-4 pb-2">
        {QUICK.map((q) => (
          <button
            key={q}
            onClick={() => void ask(q)}
            disabled={busy}
            className="text-[10.5px] px-2.5 py-1 rounded-full bg-white/50 dark:bg-white/5 border border-white/50 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-sky-400/50 disabled:opacity-50 transition-colors"
          >
            {q}
          </button>
        ))}
      </div>

      {/* 输入 */}
      <div className="px-3 pb-3">
        <div className="flex items-center gap-2 rounded-2xl bg-white/60 dark:bg-white/5 border border-white/50 dark:border-white/10 px-3 py-2">
          <Sparkles className="w-3.5 h-3.5 text-sky-500 shrink-0" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) void ask(input);
            }}
            placeholder="和小拾说点什么…"
            className="flex-1 min-w-0 bg-transparent outline-none text-[12.5px] text-slate-700 dark:text-slate-100 placeholder:text-slate-400"
          />
          <button
            onClick={() => void ask(input)}
            disabled={busy || !input.trim()}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-sky-500 text-white text-[11.5px] font-medium disabled:opacity-50"
          >
            <Send className="w-3 h-3" />
            发送
          </button>
        </div>
      </div>
    </section>
  );
}
