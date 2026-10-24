"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  Sparkles,
  Check,
  ShieldCheck,
  RefreshCw,
  ArrowRight,
  AlertCircle,
  Images,
  Film,
  Route as RouteIcon,
} from "lucide-react";

type Stage = "idle" | "uploading" | "split" | "analyzing" | "confirm" | "saving" | "done";

interface StepInfo {
  name: string;
  detail: string;
}

interface MediaItem {
  id?: number;
  url: string;
  caption: string;
  sort: number;
  kind: "image" | "video" | "text";
}

interface CostItem {
  label: string;
  amount?: number | null;
  note?: string | null;
}

interface Draft {
  memory_id: string;
  title: string;
  summary?: string | null;
  content?: string | null;
  happened_at?: string | null;
  time_precision?: string;
  location_id?: string | null;
  place?: string | null;
  trip?: string | null;
  cover?: string | null;
  confidence?: number;
  visibility?: string;
  costs?: CostItem[];
  transport_info?: string | null;
  stay_info?: string | null;
  tips?: string | null;
  meta?: Record<string, unknown>;
  facts?: Record<string, { source?: string; confidence?: number; count?: number; precision?: string }>;
}

const VIS_OPTIONS: [string, string][] = [
  ["private", "仅自己"],
  ["friends", "好友可见"],
  ["public", "公开"],
];

type DayMeta = { title: string; transport: string; cost: string; content: string };
const EMPTY_DAY: DayMeta = { title: "", transport: "", cost: "", content: "" };

/** AI 只给了一整段时，按句子摊到每一天，免得第 2、3 天全空着 */
const distribute = (text: string, dayCount: number): string[] => {
  const parts = text.split(/(?<=。)/).map((x) => x.trim()).filter(Boolean);
  const n = Math.max(1, dayCount);
  if (!parts.length) return Array.from({ length: n }, () => "");
  const per = Math.ceil(parts.length / n);
  return Array.from({ length: n }, (_, i) => parts.slice(i * per, (i + 1) * per).join(""));
};

/** 正文自动撑高：不再被 rows=3 裁掉半行 */
function AutoTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={2}
      placeholder={placeholder}
      className="mt-2 w-full bg-transparent outline-none resize-none text-[12.5px] leading-6 text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
    />
  );
}

export default function UploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("idle");
  const [visibility, setVisibility] = useState("friends");
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [steps, setSteps] = useState<StepInfo[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [error, setError] = useState("");
  const [pickedCount, setPickedCount] = useState(0);
  const [guideId, setGuideId] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);

  // 确认步：地点之外都交给 AI 按事实写
  const [locationText, setLocationText] = useState("");

  // 分天 + 每天几列（编号·标题·交通·花费·图·正文）
  const [dayOf, setDayOf] = useState<Record<string, number>>({});
  const [dayCount, setDayCount] = useState(1);
  const [dayMeta, setDayMeta] = useState<Record<number, DayMeta>>({});

  /** 整篇原文兜底：哪天 AI 没写出来，就从这里摊给它 */
  const fallbackRef = useRef("");

  const imageMedia = media.filter((m) => m.kind === "image");
  const videoMedia = media.filter((m) => m.kind === "video");

  /** 分析完自动跳到这篇攻略；用户也能点按钮立刻跳 */
  useEffect(() => {
    if (stage !== "done" || !guideId) return;
    const t = setTimeout(() => router.push(`/travel/${guideId}`), 3200);
    return () => clearTimeout(t);
  }, [stage, guideId, router]);

  /** 上传 → 分析 → 写成攻略，一气走完，中间不再打断用户 */
  const startUpload = (picked: FileList | File[] | null | undefined) => {
    const list = picked ? Array.from(picked) : [];
    if (!list.length) return;

    setError("");
    setPickedCount(list.length);
    setStage("uploading");
    setProgress(0);
    setDraft(null);
    setMedia([]);
    setGuideId(null);

    const form = new FormData();
    list.forEach((f) => form.append("files", f));
    form.append("visibility", visibility);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          setDraft(data);
          const items: MediaItem[] = data.media ?? [];
          setMedia(items);
          setDayOf(Object.fromEntries(items.map((m) => [m.url, 1])));
          setDayCount(1);
          setStage("split");
        } catch {
          setError("上传响应解析失败");
          setStage("idle");
        }
      } else {
        let msg = `上传失败（${xhr.status}）`;
        try {
          msg = JSON.parse(xhr.responseText).detail ?? msg;
        } catch {
          /* ignore */
        }
        setError(msg);
        setStage("idle");
      }
    };
    xhr.onerror = () => {
      setError("上传失败：服务没起来，先双击项目里的 start.bat");
      setStage("idle");
    };
    xhr.send(form);
  };

  const analyze = async (memoryId: string) => {
    setStage("analyzing");
    setStepIndex(0);
    setError("");
    try {
      const res = await fetch(`/api/memories/${memoryId}/analyze`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const realSteps: StepInfo[] = data.steps ?? [];
      setSteps(realSteps);
      for (let i = 0; i < realSteps.length; i++) {
        setStepIndex(i + 1);
        await new Promise((r) => setTimeout(r, 460));
      }
      const d = data.draft as Draft;
      setDraft(d);
      setLocationText(d.location_id ? (d.place ?? "") : "");
      // 整篇原文留一份兜底，不再拆词也不清空用户的分天
      fallbackRef.current = (d.content ?? d.summary ?? "")
        .split("\n")
        .filter((l) => l.trim() && !/^(先说数|我的走法)/.test(l.trim()))
        .join("");

      // 用户拖好的分天原样保留；只有真的没分过才兜底成一天
      if (!dayCount || dayCount < 1) {
        setDayCount(1);
        setDayOf(Object.fromEntries((media.map((m) => m.url) as string[]).map((u) => [u, 1])));
      }

      // 还停在「分析中」这一屏时就把每天那段写完，别让下面挂着半成品
      setWriting(true);
      await redoDays(true);
      setWriting(false);
      setStage("confirm");
      return;
    } catch (e) {
      setError(`没写成：${(e as Error).message}`);
      setStage("idle");
    } finally {
      setWriting(false);
    }
  };

  /** 拖完照片点这个：让 AI 按你分的天，各看各的照片，各写一段 */
  const [redoing, setRedoing] = useState(false);
  const redoDays = async (silent = false) => {
    if (!draft) return;
    if (!silent) setRedoing(true);
    const spare = distribute(fallbackRef.current, dayCount);
    try {
      const groups = Array.from({ length: dayCount }, (_, i) => i + 1).map((n) => ({
        urls: media.filter((m) => (dayOf[m.url] ?? 1) === n).map((m) => m.url),
      }));
      const res = await fetch(`/api/memories/${draft.memory_id}/analyze-days`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: groups }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const list: { title?: string; content?: string; transport?: string; costs?: CostItem[] }[] =
        data.days ?? [];
      setDayMeta(() => {
        const next: Record<number, DayMeta> = {};
        for (let n = 1; n <= dayCount; n++) {
          const d = list[n - 1] ?? {};
          const amount = (d.costs ?? [])
            .map((c) => `${c.label ?? ""}${c.amount != null ? ` ${c.amount}` : ""}`.trim())
            .filter(Boolean)
            .join(" · ");
          next[n] = {
            title: (d.title ?? "").trim(),
            transport: (d.transport ?? "").trim(),
            cost: amount,
            content: (d.content ?? "").trim() || spare[n - 1] || "",
          };
        }
        return next;
      });
    } catch (e) {
      setError(`按天分析失败：${(e as Error).message}`);
      setDayMeta(() => {
        const next: Record<number, DayMeta> = {};
        for (let n = 1; n <= dayCount; n++) next[n] = { ...EMPTY_DAY, content: spare[n - 1] ?? "" };
        return next;
      });
    } finally {
      if (!silent) setRedoing(false);
    }
  };

  /** 确认完：先把改过的格子写回记忆，再落成一篇攻略 */
  const saveAndGuide = async () => {
    if (!draft) return;
    setStage("saving");
    setError("");
    try {
      let locationId = draft.location_id ?? null;
      const typed = locationText.trim();
      if (!locationId && typed) {
        const res = await fetch("/api/locations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: typed }),
        });
        if (res.ok) {
          const created = (await res.json()) as { id: string };
          locationId = created.id;
        }
      }

      const daysPayload = Array.from({ length: dayCount }, (_, i) => i + 1)
        .map((n) => {
          const meta = dayMeta[n] ?? { title: "", transport: "", cost: "", content: "" };
          return {
            title: meta.title.trim(),
            transport: meta.transport.trim(),
            cost: meta.cost.trim(),
            content: meta.content,
            media_urls: media.filter((m) => (dayOf[m.url] ?? 1) === n).map((m) => m.url),
          };
        })
        .filter((d) => d.media_urls.length > 0 || d.content.trim());

      const patched = await fetch(`/api/memories/${draft.memory_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          happened_at: draft.happened_at ?? undefined,
          location_id: locationId ?? undefined,
          visibility,
          ai_status: "confirmed",
        }),
      });
      if (!patched.ok) throw new Error(await patched.text());

      const randomPlace = draft.facts?.place?.source === "random";
      const made = await fetch(`/api/memories/${draft.memory_id}/to-guide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ random_place: randomPlace, days: daysPayload }),
      });
      if (!made.ok) throw new Error(await made.text());
      const info = await made.json();
      setGuideId(info.guide_id);
      setStage("done");
    } catch (e) {
      setError(`保存失败：${(e as Error).message}`);
      setStage("confirm");
    }
  };

  const reset = () => {
    setStage("idle");
    setDraft(null);
    setMedia([]);
    setGuideId(null);
    setProgress(0);
    setSteps([]);
    setStepIndex(0);
    setError("");
    setPickedCount(0);
    setLocationText("");
    fallbackRef.current = "";
    setDayOf({});
    setDayCount(1);
    setDayMeta({});
  };

  const stepLabels = ["上传", "看照片", "写几行", "写成攻略"];
  const stepNow =
    stage === "idle" || stage === "uploading"
      ? 0
      : stage === "analyzing"
        ? 1
        : stage === "split" || stage === "confirm" || stage === "saving"
          ? 2
          : 3;

  return (
    <div className="w-full py-6 md:py-10 relative z-10">
      <header className="max-w-5xl mx-auto px-4 sm:px-6 mb-5">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-gradient-to-br from-sky-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Upload className="w-5 h-5 md:w-6 md:h-6 text-white" />
          </span>
          <h1
            className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-slate-100"
            style={{ fontFamily: "'Noto Serif SC', serif" }}
          >
            添加记忆
          </h1>
        </div>
        <p className="text-sm md:text-base text-slate-500 dark:text-slate-400 ml-7 md:ml-10">
          把照片丢进来，AI 认出这是哪、算清花了多少，直接写成一篇能改的旅行攻略
        </p>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        {/* 三步：不再有「确认字段」那一步 */}
        <div className="flex items-center gap-2 mb-5 text-[11px]">
          {stepLabels.map((label, i) => {
            const active = stepNow === i;
            const done = stepNow > i;
            return (
              <div key={label} className="flex items-center gap-2">
                <span
                  className={`px-3 py-1 rounded-full transition-all ${
                    active
                      ? "bg-sky-500 text-white"
                      : done
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : "bg-slate-500/10 text-slate-400"
                  }`}
                >
                  {done ? "✓ " : `${i + 1}. `}
                  {label}
                </span>
                {i < stepLabels.length - 1 && <span className="w-6 h-px bg-slate-400/30" />}
              </div>
            );
          })}
          {stage !== "idle" && (
            <button
              type="button"
              onClick={reset}
              disabled={stage === "uploading" || stage === "analyzing"}
              className="ml-2 text-slate-400 hover:text-sky-500 disabled:opacity-40"
            >
              换一批
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 px-4 py-3 rounded-xl bg-rose-500/10 text-rose-500 text-xs">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* ---------- 上传 ---------- */}
          {stage === "idle" && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="glass-card rounded-3xl border-white/40 dark:border-white/10 p-6 md:p-10 text-center"
            >
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  startUpload(e.dataTransfer.files);
                }}
                onClick={() => inputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl py-14 px-6 cursor-pointer transition-colors ${
                  dragging ? "border-sky-400 bg-sky-500/10" : "border-slate-300/60 dark:border-white/15"
                }`}
              >
                <Upload className="w-9 h-9 mx-auto text-sky-500 mb-4" />
                <p className="text-sm text-slate-700 dark:text-slate-200">
                  把照片 / 视频拖到这里，或点击选择文件
                </p>
                <p className="mt-2 text-[11px] text-slate-400">
                  <Images className="w-3 h-3 inline -mt-0.5" /> 一次可以选多张，它们算同一趟 ·{" "}
                  <Film className="w-3 h-3 inline -mt-0.5" /> 视频会自动抽几帧好看的分析
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  支持 JPG / PNG / WebP / MP4 / MOV / WebM · 图片单张不超过 20 MB
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept="image/*,video/*,.txt,.md"
                  className="hidden"
                  onChange={(e) => startUpload(e.target.files)}
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px]">
                <span className="text-slate-400">谁能看到这篇：</span>
                {VIS_OPTIONS.map(([value, text]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setVisibility(value)}
                    className={`px-3 py-1 rounded-full transition-colors ${
                      visibility === value
                        ? "bg-sky-500 text-white"
                        : "bg-slate-500/10 text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {text}
                  </button>
                ))}
              </div>

              <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                文件安全保存，相同内容自动去重 · 认不出地点也会先给一个，随时能改
              </p>
            </motion.div>
          )}

          {/* ---------- 上传中 / 正在写 ---------- */}
          {(stage === "uploading" || stage === "analyzing") && (
            <motion.div
              key="working"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="glass-card rounded-3xl border-white/40 dark:border-white/10 p-6 md:p-8"
            >
              <div className="flex flex-col md:flex-row gap-6 md:gap-8">
                <div className="w-full md:w-[240px] shrink-0">
                  <div className="grid grid-cols-2 gap-2">
                    {(media.length ? media : []).slice(0, 5).map((m, i) => (
                      <div
                        key={`${m.url}-${i}`}
                        className={`relative rounded-xl overflow-hidden border border-white/15 ${
                          i === 0 ? "col-span-2 aspect-video" : "aspect-square"
                        }`}
                      >
                        {m.kind === "video" ? (
                          <span className="w-full h-full flex items-center justify-center bg-slate-800/60 text-slate-300">
                            <Film className="w-5 h-5" />
                          </span>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.url} alt="" className="w-full h-full object-cover" />
                        )}
                      </div>
                    ))}
                    {!media.length && (
                      <div className="col-span-2 aspect-video rounded-xl bg-slate-500/10 flex items-center justify-center">
                        <span className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                  <div className="mt-3 text-[11px] text-slate-400 space-y-1">
                    <div>
                      画面 {imageMedia.length} 张 · 视频 {videoMedia.length} 个
                    </div>
                    <div>{pickedCount > 1 ? `共 ${pickedCount} 个文件` : "1 个文件"}</div>
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  {stage === "uploading" ? (
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">正在上传…</div>
                      <div className="h-1.5 rounded-full bg-slate-500/15 overflow-hidden">
                        <div className="h-full bg-sky-500 transition-all" style={{ width: `${progress}%` }} />
                      </div>
                      <div className="mt-2 text-[11px] text-slate-400 tabular-nums">{progress}%</div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(steps.length ? steps : [{ name: "开始分析", detail: "" }]).map((s, i) => {
                        const doneStep = i < stepIndex;
                        const running = i === stepIndex;
                        return (
                          <div key={`${s.name}-${i}`} className="flex items-start gap-3">
                            <span
                              className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[11px] ${
                                doneStep
                                  ? "bg-emerald-500 text-white"
                                  : running
                                    ? "bg-sky-500 text-white"
                                    : "bg-slate-500/15 text-slate-400"
                              }`}
                            >
                              {doneStep ? <Check className="w-3 h-3" /> : i + 1}
                            </span>
                            <div className="min-w-0">
                              <div
                                className={`text-xs ${
                                  doneStep || running
                                    ? "text-slate-700 dark:text-slate-200"
                                    : "text-slate-400"
                                }`}
                              >
                                {s.name}
                              </div>
                              {doneStep && s.detail && (
                                <div className="text-[11px] text-slate-400 mt-0.5 break-words">{s.detail}</div>
                              )}
                            </div>
                            {running && (
                              <span className="ml-auto w-4 h-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin shrink-0" />
                            )}
                          </div>
                        );
                      })}

                      <div className="pt-2 flex items-center gap-2 text-[11px] text-slate-400">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                        {writing ? "正在按你分的天，一天一天写…" : "看照片、认地点、算花销"}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ---------- 分天 + 每天填几行 ---------- */}
          {(stage === "split" || stage === "confirm" || stage === "saving") && draft && (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-4"
            >
              <div className="glass-card rounded-3xl border-white/40 dark:border-white/10 p-5 md:p-6">
                <div className="flex items-center gap-3 mb-3">
                  <input
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    className="flex-1 min-w-0 bg-transparent text-lg font-bold text-slate-800 dark:text-slate-100 outline-none"
                    style={{ fontFamily: "'Noto Serif SC', serif" }}
                  />
                  <span className="text-[11px] text-slate-400 shrink-0">
                    {dayCount} 天 · {imageMedia.length} 张
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <p className="text-[11px] text-slate-400">
                    把照片拖到第几天里（手机上点照片角标切换）—— 分几天，这篇攻略就是几天。
                  </p>
                  <button
                    type="button"
                    onClick={() => redoDays()}
                    disabled={redoing}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-300 text-[11px] disabled:opacity-60"
                  >
                    {redoing ? (
                      <>
                        <span className="w-3 h-3 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
                        正在按天写…
                      </>
                    ) : (
                      <>↻ 按这些照片重写每天</>
                    )}
                  </button>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1">
                  {Array.from({ length: dayCount }, (_, i) => i + 1).map((n) => {
                    const urls = media.filter((m) => (dayOf[m.url] ?? 1) === n);
                    return (
                      <div
                        key={n}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const url = e.dataTransfer.getData("text/plain");
                          if (url) setDayOf((d) => ({ ...d, [url]: n }));
                        }}
                        className="w-[168px] shrink-0 rounded-xl border border-white/40 dark:border-white/10 bg-white/30 dark:bg-white/5 p-2"
                      >
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 text-[9px] grid place-items-center">
                            {n}
                          </span>
                          <span className="text-[10.5px] text-slate-500 dark:text-slate-300">第 {n} 天</span>
                          <span className="ml-auto text-[9.5px] text-slate-400">{urls.length} 张</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          {urls.map((m) => (
                            <span
                              key={m.url}
                              draggable
                              onDragStart={(e) => e.dataTransfer.setData("text/plain", m.url)}
                              onClick={() =>
                                setDayOf((d) => ({ ...d, [m.url]: (n % dayCount) + 1 }))
                              }
                              className="relative block aspect-square rounded-md overflow-hidden border border-white/20 cursor-grab"
                              title="拖走，或点一下换到下一天"
                            >
                              {m.kind === "video" ? (
                                <span className="w-full h-full grid place-items-center bg-slate-700/50 text-[9px] text-slate-300">
                                  视频
                                </span>
                              ) : (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={m.url} alt="" className="w-full h-full object-cover" />
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setDayCount((c) => c + 1)}
                    className="w-[92px] shrink-0 rounded-xl border border-dashed border-slate-400/40 text-[10.5px] text-slate-400 hover:text-emerald-500"
                  >
                    ＋ 加一天
                  </button>
                </div>
              </div>

              {(stage === "split" ? [] : Array.from({ length: dayCount }, (_, i) => i + 1)).map((n) => {
                const meta = dayMeta[n] ?? EMPTY_DAY;
                const patch = (patchObj: Partial<DayMeta>) =>
                  setDayMeta((m) => ({ ...m, [n]: { ...meta, ...patchObj } }));
                const urls = media.filter((m) => (dayOf[m.url] ?? 1) === n);
                return (
                  <div
                    key={`card-${n}`}
                    className="glass-card rounded-2xl border-white/40 dark:border-white/10 px-4 py-3.5 md:px-5"
                  >
                    {/* 编号 · 标题 · 图 */}
                    <div className="flex items-start gap-3">
                      <span className="w-6 h-6 shrink-0 rounded-full bg-emerald-500 text-white text-[11px] grid place-items-center mt-0.5">
                        {n}
                      </span>
                      <input
                        value={meta.title}
                        onChange={(e) => patch({ title: e.target.value })}
                        placeholder={`第 ${n} 天 · 点这里写标题`}
                        className="flex-1 min-w-0 bg-transparent text-base md:text-lg font-bold text-slate-800 dark:text-slate-100 outline-none placeholder:font-normal placeholder:text-slate-400"
                        style={{ fontFamily: "'Noto Serif SC', serif" }}
                      />
                      <span className="flex items-center gap-1 shrink-0">
                        {urls.slice(0, 4).map((m) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={m.url}
                            src={m.url}
                            alt=""
                            className="w-10 h-8 rounded object-cover border border-white/25"
                          />
                        ))}
                        {urls.length > 4 && (
                          <span className="text-[10px] text-slate-400">+{urls.length - 4}</span>
                        )}
                      </span>
                    </div>

                    {/* 交通 · 花费 · 张数 */}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-500/10 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="shrink-0">🚇</span>
                        <input
                          value={meta.transport}
                          onChange={(e) => patch({ transport: e.target.value })}
                          placeholder="怎么去的"
                          className="w-24 bg-transparent outline-none text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
                        />
                      </label>
                      <label className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-500/10 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="shrink-0">💰</span>
                        <input
                          value={meta.cost}
                          onChange={(e) => patch({ cost: e.target.value })}
                          placeholder="这天花了多少"
                          className="w-28 bg-transparent outline-none text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
                        />
                      </label>
                      <span className="ml-auto text-[10.5px] text-slate-400">{urls.length} 张</span>
                    </div>

                    {/* 正文：自动撑高，写多长都摊开 */}
                    <AutoTextarea
                      value={meta.content}
                      onChange={(v) => patch({ content: v })}
                      placeholder="这天发生了什么 —— AI 已经写了初稿，直接改"
                    />
                  </div>
                );
              })}

              <div className="flex flex-wrap items-center gap-2 glass-card rounded-2xl border-white/40 dark:border-white/10 px-4 py-3">
                <button
                  onClick={() => (stage === "split" ? analyze(draft.memory_id) : saveAndGuide())}
                  disabled={stage === "saving"}
                  className="tech-btn flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-white text-xs font-medium disabled:opacity-70"
                >
                  {stage === "saving" ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
                      正在写成攻略
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      {stage === "split" ? "开始分析这几天 →" : "保存并写成攻略 →"}
                    </>
                  )}
                </button>
                <span className="text-[10.5px] text-slate-400">
                  某天不想写就留空，攻略里只显示照片
                </span>
                <button onClick={reset} className="ml-auto px-4 py-2 rounded-xl glass-button text-xs text-slate-500">
                  换一批
                </button>
              </div>
            </motion.div>
          )}

          {/* ---------- 写好了 ---------- */}
          {stage === "done" && draft && (
            <motion.div
              key="done"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="glass-card rounded-3xl border-white/40 dark:border-white/10 overflow-hidden"
            >
              <div className="relative h-52 md:h-64">
                {draft.cover && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={draft.cover} alt="" className="w-full h-full object-cover" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/45 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5 md:p-7">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-[10px] text-emerald-200 mb-2">
                    <Check className="w-3 h-3" /> 写好了
                  </span>
                  <h2
                    className="text-xl md:text-2xl font-bold text-white"
                    style={{ fontFamily: "'Noto Serif SC', serif" }}
                  >
                    {draft.title}
                  </h2>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-300">
                    <span className="flex items-center gap-1">
                      <RouteIcon className="w-3 h-3" /> 已经是一篇攻略
                    </span>
                    <span>{imageMedia.length} 张照片进了图集</span>
                    <span>{visibility === "public" ? "公开" : visibility === "private" ? "仅自己" : "好友可见"}</span>
                  </div>
                </div>
              </div>

              <div className="p-5 md:p-6 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => guideId && router.push(`/travel/${guideId}`)}
                  className="tech-btn flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-white text-xs font-medium"
                >
                  打开这篇攻略 <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] text-slate-400">马上自动打开…</span>
                <button
                  onClick={reset}
                  className="ml-auto flex items-center gap-1.5 px-4 py-2.5 rounded-xl glass-button text-xs text-slate-600 dark:text-slate-200"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> 再传一批
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="mt-6 text-center text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
          <ArrowRight className="w-3 h-3" />
          照片不会白传：它就是这篇攻略的图集，点开看大图
        </p>
      </div>
    </div>
  );
}
