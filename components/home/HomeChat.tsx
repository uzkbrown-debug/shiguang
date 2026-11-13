"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Send,
  Sparkles,
  Sun,
  CloudSun,
  CloudFog,
  CloudRain,
  Snowflake,
  CloudLightning,
  ChevronUp,
  ChevronDown,
  ImagePlus,
  ArrowUpRight,
} from "lucide-react";
import type { WeatherData } from "@/components/home/WeatherCard";
import WeatherCityPicker from "@/components/home/WeatherCityPicker";
import { lookupSpotByPhoto, spotHeadline, type SpotResult } from "@/lib/spotSearch";

interface Msg {
  role: "user" | "ai";
  text: string;
  /** 看图找帖子：用户那张图的本地预览 */
  image?: string;
  /** 看图找帖子的结果 */
  spot?: SpotResult;
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
  weatherCity,
  onWeatherCity,
}: {
  name?: string | null;
  memoryCount: number;
  cityCount: number;
  weather?: WeatherData | null;
  /** 天气卡当前看的城市 */
  weatherCity?: string;
  /** 换城市：存到账号上，再重新拉一次天气 */
  onWeatherCity?: (city: string) => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  // 切到地图 / 相册再回来，已经聊过的内容不能没了：存一份在本标签页里
  const CHAT_KEY = "sg-chat-history";
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [spotBusy, setSpotBusy] = useState(false);
  // 换城市的小弹窗
  const [cityOpen, setCityOpen] = useState(false);
  // 整卡可下拉收起：收起后只留标题栏，消息多的时候不占屏
  const [collapsed, setCollapsed] = useState(false);
  const spotInputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // 进页面先把上次的对话捞回来（只做一次）
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(CHAT_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw) as Msg[];
        if (Array.isArray(saved) && saved.length) setMsgs(saved);
      } catch {
        /* 存的东西坏了就算了 */
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // 有新消息就写回去，只留最近 40 条，免得越存越大
  useEffect(() => {
    if (!msgs.length) return;
    try {
      sessionStorage.setItem(CHAT_KEY, JSON.stringify(msgs.slice(-40)));
    } catch {
      /* 无痕模式/配额满了都不影响使用 */
    }
  }, [msgs]);

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

  /** 传一张旅游照片：认景点 → 站内相关帖子 */
  const handlePhoto = async (file: File | null) => {
    if (!file || spotBusy) return;
    const preview = URL.createObjectURL(file);
    setMsgs((prev) => [...prev, { role: "user", text: "这张照片是哪儿？有相关帖子吗", image: preview }]);
    setSpotBusy(true);
    setBusy(true);
    scrollToEnd();
    try {
      const data = await lookupSpotByPhoto(file);
      if (!data) {
        setMsgs((prev) => [...prev, { role: "ai", text: "图片没传上去，重试一次？" }]);
        return;
      }
      setMsgs((prev) => [...prev, { role: "ai", text: spotHeadline(data), spot: data }]);
    } finally {
      setSpotBusy(false);
      setBusy(false);
      if (spotInputRef.current) spotInputRef.current.value = "";
      scrollToEnd();
    }
  };

  const greeting =
    memoryCount > 0
      ? `我是小拾。你已经在这里留下 ${memoryCount} 段记忆${cityCount ? `、走过 ${cityCount} 座城市` : ""}——想问什么直接说。`
      : "我是小拾。等你传第一批照片，我就能认出那是哪座城市、哪一天、和谁在一起。";

  return (
    <section className="w-full relative glass-card rounded-3xl border-white/40 dark:border-white/10 overflow-hidden flex flex-col min-h-[540px] max-h-[560px] lg:min-h-[660px] lg:max-h-[680px]">
      {/* 标题栏 */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/20 dark:border-white/10">
        <span className="w-7 h-7 rounded-full bg-gradient-to-br from-sky-400 to-emerald-400 grid place-items-center text-[11px] font-bold text-slate-900">
          拾
        </span>
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">小拾</span>
        <span className="ml-auto text-[10px] text-slate-400 border border-white/25 dark:border-white/15 rounded-full px-2 py-0.5">
          {name ? `${name} 的记忆` : "记得你去过的地方"}
        </span>
        <button
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? "展开对话" : "收起对话"}
          className="grid place-items-center w-6 h-6 rounded-lg text-slate-400 hover:text-sky-500 hover:bg-sky-500/10 transition-colors"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${collapsed ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* 天气：照参考图那种竖排小卡，固定在右上角。城市没查到也留着卡，
          否则换错城市就再也点不回来 */}
      <div className="hidden lg:flex flex-col items-center absolute right-4 top-16 w-[172px] rounded-2xl bg-white/55 dark:bg-white/5 border border-white/50 dark:border-white/10 px-3 py-3 z-10">
        <button
          onClick={() => setCityOpen(true)}
          title="换个城市看天气"
          className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10.5px] text-slate-500 dark:text-slate-400 hover:bg-sky-500/10 hover:text-sky-500 transition-colors"
        >
          {weather?.city ?? weatherCity ?? "泉州"}
          <ChevronUp className="w-2.5 h-2.5 text-sky-500" />
        </button>
        {(() => {
          const Icon = W_ICONS[weather?.icon ?? "cloud-sun"] ?? CloudSun;
          return <Icon className="w-7 h-7 my-1.5 text-amber-400" strokeWidth={1.7} />;
        })()}
        <div className="flex items-start leading-none">
          <span className="text-[30px] font-black text-slate-800 dark:text-white tabular-nums">
            {weather?.ok ? weather.temperature ?? "--" : "--"}
          </span>
          <span className="text-[15px] font-bold text-slate-500 dark:text-slate-300 mt-0.5">°</span>
        </div>
        <div className="mt-1 text-[11.5px] text-slate-500 dark:text-slate-300">
          {weather?.ok ? weather.text ?? "多云" : weather ? "没查到这座城" : "读取中…"}
        </div>
        <div className="mt-0.5 text-[10.5px] text-slate-400 tabular-nums">
          {weather?.low ?? "--"}° / {weather?.high ?? "--"}°
        </div>
      </div>

      {cityOpen && (
        <WeatherCityPicker
          current={weather?.city ?? weatherCity ?? "泉州"}
          onPick={async (city) => {
            onWeatherCity?.(city);
          }}
          onClose={() => setCityOpen(false)}
        />
      )}

      {/* 收起时露一行摘要，像下拉框收起后还能看见选了什么 */}
      {collapsed && (
        <div className="px-4 pb-3 pt-1">
          <button
            onClick={() => setCollapsed(false)}
            className="w-full text-left text-[11.5px] text-slate-500 dark:text-slate-400 truncate rounded-xl bg-white/50 dark:bg-white/5 border border-white/40 dark:border-white/10 px-3 py-2 hover:border-sky-400/40 transition-colors"
          >
            {msgs.length
              ? `最近：${msgs[msgs.length - 1].text.slice(0, 40)}${msgs[msgs.length - 1].text.length > 40 ? "…" : ""}`
              : "点这里展开对话"}
          </button>
        </div>
      )}

      {/* 消息区：高度锁死、内部滚动，聊得再多也不会把首页撑变形 */}
      <div className={`relative flex-1 min-h-0 ${collapsed ? "hidden" : ""}`}>
        {/* 底部渐隐：提示"还能往下滚" */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 z-10 bg-gradient-to-t from-white/70 dark:from-slate-900/70 to-transparent" />
      <div
        ref={boxRef}
        className="h-full overflow-y-auto overscroll-contain pl-4 pr-4 lg:pr-[196px] py-3 space-y-3"
      >
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-[12.5px] leading-relaxed bg-white/60 dark:bg-white/5 border border-white/50 dark:border-white/10 text-slate-700 dark:text-slate-200">
          {greeting}
        </div>

        <AnimatePresence initial={false}>
          {msgs.map((m, i) => (
            <motion.div
              key={`${m.role}-${i}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-relaxed ${
                m.role === "user"
                  ? "ml-auto bg-sky-500/20 border border-sky-400/35 text-sky-900 dark:text-sky-50 rounded-tr-sm"
                  : "bg-white/60 dark:bg-white/5 border border-white/50 dark:border-white/10 text-slate-700 dark:text-slate-200 rounded-tl-sm"
              }`}
            >
              {m.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.image}
                  alt=""
                  className="mb-1.5 block max-h-32 w-auto max-w-full rounded-xl border border-white/20 object-cover"
                />
              )}
              <span className="whitespace-pre-wrap">{m.text}</span>

              {/* 站内没有这个景点的帖子时，至少把景点讲清楚 */}
              {m.spot?.ok && m.spot.intro && (
                <p className="mt-2 rounded-xl bg-emerald-500/10 px-2.5 py-2 text-[11.5px] leading-relaxed text-slate-600 dark:text-slate-300">
                  {m.spot.intro}
                </p>
              )}

              {/* 看图找帖子：站内相关帖子 */}
              {m.spot?.ok && !!m.spot.hits?.length && (
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                    <ImagePlus className="w-3 h-3" />
                    站内相关帖子 · {m.spot.hits.length} 条
                  </div>
                  {m.spot.hits.map((h) => (
                    <Link
                      key={`${h.kind}-${h.id}`}
                      href={h.link}
                      className="group flex items-center gap-2 rounded-xl bg-white/60 dark:bg-white/5 px-2 py-1.5 hover:ring-1 hover:ring-emerald-400/50 transition-all"
                    >
                      {h.cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={h.cover} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                      ) : (
                        <span className="w-9 h-9 rounded-lg bg-slate-400/30 shrink-0" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] text-slate-700 dark:text-slate-200 truncate">
                          {h.title}
                        </span>
                        <span className="block text-[9.5px] text-slate-400 truncate">
                          {h.kind === "memory" ? "记忆" : h.kind === "guide" ? "攻略" : "路线"}
                          {h.owner ? ` · ${h.owner}` : ""}
                          {(h.also ?? 1) > 1 ? ` · +${(h.also ?? 1) - 1}` : ""}
                          {h.reason ? ` · ${h.reason}` : ""}
                        </span>
                      </span>
                      <ArrowUpRight className="w-3 h-3 shrink-0 text-emerald-500" />
                    </Link>
                  ))}
                </div>
              )}
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
      </div>

      {/* 快捷问题 */}
      <div className={`flex flex-wrap gap-1.5 px-4 pb-2 ${collapsed ? "hidden" : ""}`}>
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
      <div className={`px-3 pb-3 ${collapsed ? "hidden" : ""}`}>
        <div className="flex items-center gap-2 rounded-2xl bg-white/60 dark:bg-white/5 border border-white/50 dark:border-white/10 px-3 py-2">
          <Sparkles className="w-3.5 h-3.5 text-sky-500 shrink-0" />
          <button
            type="button"
            onClick={() => spotInputRef.current?.click()}
            disabled={spotBusy}
            title="传一张旅游照片，小拾认景点并推荐站内帖子"
            className="shrink-0 p-1 rounded-lg text-slate-500 dark:text-slate-300 hover:text-emerald-500 hover:bg-emerald-500/10 disabled:opacity-50 transition-colors"
          >
            {spotBusy ? (
              <span className="block w-3.5 h-3.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <ImagePlus className="w-3.5 h-3.5" />
            )}
          </button>
          <input
            ref={spotInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void handlePhoto(e.target.files?.[0] ?? null)}
          />
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
