"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { emitDataChanged } from "@/lib/dataBus";
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
  Loader2,
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

type DayMeta = {
  title: string;
  notes: string;
  transport: string;
  cost: string;
  content: string;
  /** 这段正文是照着哪几张图写的；照片一变就和当前分组对不上，界面立刻提示重写 */
  srcKey?: string;
};
const EMPTY_DAY: DayMeta = { title: "", notes: "", transport: "", cost: "", content: "", srcKey: "" };

/** 一天的图片指纹：用于判断正文是不是过期了 */
const keyOf = (urls: string[]) => urls.filter(Boolean).join("|");

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
  // 默认「好友可见」：好友之间要能互相看到照片、互相留弹幕
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
  /** 拖动时高亮目标天：不然照片飞过去没反馈，看着很笨 */
  const [dropDay, setDropDay] = useState<number | null>(null);
  const [dropNew, setDropNew] = useState(false);
  /** 哪天没写出来、原因是什么：宁可空着也不拿别的内容充数 */
  const [dayFails, setDayFails] = useState<Record<number, string>>({});

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

  /** 拖完照片点这个：让 AI 按你分的天，各看各的照片，各写一段
   *  每天单独发一个请求：某天失败只影响那天，绝不连坐，也不拿别天的字顶上 */
  const [redoing, setRedoing] = useState(false);
  const redoDays = async (silent = false) => {
    if (!draft) return;
    if (!silent) setRedoing(true);
    setError("");
    const groups = Array.from({ length: dayCount }, (_, i) => i + 1).map((n) => ({
      urls: media.filter((m) => (dayOf[m.url] ?? 1) === n).map((m) => m.url),
      // 把用户在分天这一步写的主题/关键信息一起发过去：模型按这个写，而不是自己猜
      title: (dayMeta[n]?.title ?? "").trim(),
      notes: (dayMeta[n]?.notes ?? "").trim(),
    }));

    const fails: Record<number, string> = {};
    const results: Record<number, { title: string; transport: string; cost: string; content: string; srcKey: string }> =
      {};

    await Promise.all(
      groups.map(async (group, i) => {
        const n = i + 1;
        try {
          const res = await fetch(`/api/memories/${draft.memory_id}/analyze-days`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ days: [group] }),
          });
          if (!res.ok) throw new Error((await res.text()).slice(0, 120));
          const d = ((await res.json()).days ?? [])[0] ?? {};
          if (d.error) throw new Error(String(d.error));
          const content = (d.content ?? "").trim();
          if (!content) throw new Error("模型没有返回正文");
          const amount = (d.costs ?? [])
            .map((c: CostItem) => `${c.label ?? ""}${c.amount != null ? ` ${c.amount}` : ""}`.trim())
            .filter(Boolean)
            .join(" · ");
          results[n] = {
            title: (d.title ?? "").trim(),
            transport: (d.transport ?? "").trim(),
            cost: amount,
            content,
            srcKey: keyOf(d.urls ?? group.urls),
          };
        } catch (e) {
          fails[n] = `${(e as Error).message}`.replace(/^\{.*"detail":"?/, "").slice(0, 80);
        }
      }),
    );

    setDayMeta((prev) => {
      const next = { ...prev };
      for (let n = 1; n <= dayCount; n++) {
        const r = results[n];
        if (!r) continue; // 没写出来的天保持原样，不清空
        next[n] = {
          // 用户写的主题优先，模型不改标题
          title: r.title || (prev[n]?.title ?? "").trim(),
          notes: prev[n]?.notes ?? "",
          transport: r.transport,
          cost: r.cost,
          content: r.content,
          srcKey: r.srcKey,
        };
      }
      return next;
    });
    setDayFails(fails);
    if (!silent) setRedoing(false);
  };

  /** 只重写某一天：把这一天的标题当主题发过去，其它天不动 */
  const [redoingDay, setRedoingDay] = useState<number | null>(null);
  /** 正文生成完之后，照片分配就锁住：改了照片但正文不重写，内容一定对不上
   *  「分析中」也必须锁：那几十秒里一改分组，回来的正文就对不上照片了 */
  const splitLocked =
    stage === "analyzing" || stage === "confirm" || stage === "saving" || stage === "done";

  const redoOneDay = async (n: number) => {
    if (!draft || redoingDay) return;
    setRedoingDay(n);
    setError("");
    try {
      const group = {
        urls: media.filter((m) => (dayOf[m.url] ?? 1) === n).map((m) => m.url),
        title: (dayMeta[n]?.title ?? "").trim(),
        notes: (dayMeta[n]?.notes ?? "").trim(),
      };
      const res = await fetch(`/api/memories/${draft.memory_id}/analyze-days`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: [group] }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const d = (data.days ?? [])[0] ?? {};
      if (d.error) throw new Error(d.error);
      const amount = (d.costs ?? [])
        .map((c: { label?: string; amount?: number }) =>
          `${c.label ?? ""}${c.amount != null ? ` ${c.amount}` : ""}`.trim(),
        )
        .filter(Boolean)
        .join(" · ");
      setDayFails((prev) => {
        const next = { ...prev };
        delete next[n];
        return next;
      });
      setDayMeta((prev) => ({
        ...prev,
        // 标题保留用户写的，只替换正文/交通/花费
        [n]: {
          title: prev[n]?.title ?? "",
          notes: prev[n]?.notes ?? "",
          transport: (d.transport ?? "").trim() || prev[n]?.transport || "",
          cost: amount || prev[n]?.cost || "",
          content: (d.content ?? "").trim() || prev[n]?.content || "",
          srcKey: keyOf(d.urls ?? group.urls),
        },
      }));
    } catch (e) {
      const msg = `${(e as Error).message}`.slice(0, 80);
      setError(`第 ${n} 天重写失败：${msg}`);
      setDayFails((prev) => ({ ...prev, [n]: msg }));
    } finally {
      setRedoingDay(null);
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
      // 新记忆 + 新攻略入库：地图、时间轴、旅行页都要刷出来
      emitDataChanged({ kind: "memory", action: "created", id: draft.memory_id });
      emitDataChanged({ kind: "guide", action: "created", id: info.guide_id });
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
    setDayOf({});
    setDayCount(1);
    setDayMeta({});
    setDayFails({});
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
                  <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                    <p className="text-[11px] leading-relaxed text-emerald-700 dark:text-emerald-300">
                      {splitLocked
                        ? "照片分配已锁定：要换照片，点右上角「按这些照片重写每天」，正文会跟着重写。"
                        : "把照片拖到对应的天（点一下也能换到下一个天）；拖到最右边的「＋ 加一天」＝给这张图开新的一天。再给每天写一句主题，AI 会照着这些写，不会自己编。"}
                    </p>
                  </div>
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
                        onDragOverCapture={(e) => {
                          // 卡片里有输入框：拖到文字上也得能落下来，否则会出现「拖到一半卡住」
                          if (!splitLocked) e.preventDefault();
                        }}
                        onDragOver={(e) => {
                          if (splitLocked) return;
                          e.preventDefault();
                          if (dropDay !== n) setDropDay(n);
                        }}
                        onDragLeave={(e) => {
                          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                          setDropDay((cur) => (cur === n ? null : cur));
                        }}
                        onDrop={(e) => {
                          setDropDay(null);
                          if (splitLocked) return;
                          e.preventDefault();
                          e.stopPropagation();
                          const url = e.dataTransfer.getData("text/plain");
                          if (url) setDayOf((d) => ({ ...d, [url]: n }));
                        }}
                        className={`w-[210px] shrink-0 rounded-xl border p-2 transition-colors ${
                          dropDay === n && !splitLocked
                            ? "border-emerald-400/80 bg-emerald-500/10 ring-2 ring-emerald-400/40"
                            : "border-white/40 dark:border-white/10 bg-white/30 dark:bg-white/5"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 text-[9px] grid place-items-center">
                            {n}
                          </span>
                          <span className="text-[10.5px] text-slate-500 dark:text-slate-300">第 {n} 天</span>
                          <span className="ml-auto text-[9.5px] text-slate-400">{urls.length} 张</span>
                        </div>
                        {/* 先写主题和关键信息：AI 后面就按这个写，不会乱编 */}
                        <label className="mt-2 block">
                          <span className="flex items-center gap-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                            <span className="w-1 h-1 rounded-full bg-emerald-500" />
                            这天的主题
                          </span>
                          <input
                            value={dayMeta[n]?.title ?? ""}
                            onChange={(e) =>
                              setDayMeta((m) => ({ ...m, [n]: { ...(m[n] ?? EMPTY_DAY), title: e.target.value } }))
                            }
                            placeholder="例：坐飞机去北京见学姐"
                            className="mt-1 w-full px-2 py-1.5 rounded-lg bg-white/70 dark:bg-slate-900/50 border border-emerald-500/30 focus:border-emerald-500/70 text-[11px] font-medium text-slate-800 dark:text-slate-100 outline-none transition-colors placeholder:font-normal placeholder:text-slate-400/70"
                          />
                        </label>
                        {!(dayMeta[n]?.title ?? "").trim() && (
                          <p className="mt-1 text-[9.5px] text-amber-600 dark:text-amber-400">
                            不填的话，AI 只会照着照片描述
                          </p>
                        )}
                        <label className="mt-1.5 block">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            关键信息<span className="text-slate-400/70">（可不填）</span>
                          </span>
                          <input
                            value={dayMeta[n]?.notes ?? ""}
                            onChange={(e) =>
                              setDayMeta((m) => ({ ...m, [n]: { ...(m[n] ?? EMPTY_DAY), notes: e.target.value } }))
                            }
                            placeholder="航班 / 和谁 / 吃了什么"
                            className="mt-1 w-full px-2 py-1.5 rounded-lg bg-white/70 dark:bg-slate-900/50 border border-slate-400/25 focus:border-emerald-500/60 text-[11px] text-slate-700 dark:text-slate-200 outline-none transition-colors placeholder:text-slate-400/70"
                          />
                        </label>
                        {urls.length === 0 && !splitLocked && (
                          <p className="mt-1.5 rounded-lg border border-dashed border-emerald-400/40 py-3 text-center text-[9.5px] text-emerald-600/80 dark:text-emerald-300/80">
                            把照片拖到这里
                          </p>
                        )}
                        <div className="grid grid-cols-3 gap-1 mt-1.5">
                          {urls.map((m) => {
                            const idx = media.findIndex((x) => x.url === m.url) + 1;
                            return (
                              <span
                                key={m.url}
                                draggable={!splitLocked}
                                onDragStart={(e) => {
                                  if (splitLocked) return;
                                  e.dataTransfer.effectAllowed = "move";
                                  e.dataTransfer.setData("text/plain", m.url);
                                }}
                                onDragEnd={() => setDropDay(null)}
                                onClick={() => {
                                  if (splitLocked) return;
                                  setDayOf((d) => ({ ...d, [m.url]: (n % dayCount) + 1 }));
                                }}
                                className={`relative block aspect-square rounded-md overflow-hidden border border-white/20 ${
                                  splitLocked ? "cursor-default" : "cursor-grab"
                                }`}
                                title={
                                  splitLocked
                                    ? `第 ${n} 天 · ${idx > 0 ? `你上传的第 ${idx} 张 · ` : ""}照片已锁定`
                                    : `第 ${n} 天 · ${idx > 0 ? `你上传的第 ${idx} 张 · ` : ""}拖走或点一下换天`
                                }
                              >
                                {m.kind === "video" ? (
                                  <span className="w-full h-full grid place-items-center bg-slate-700/50 text-[9px] text-slate-300">
                                    视频
                                  </span>
                                ) : (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={m.url}
                                    alt=""
                                    draggable={false}
                                    className="w-full h-full object-cover pointer-events-none"
                                  />
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {!splitLocked && (
                    <button
                      type="button"
                      onClick={() => setDayCount((c) => c + 1)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (!dropNew) setDropNew(true);
                      }}
                      onDragLeave={() => setDropNew(false)}
                      onDrop={(e) => {
                        setDropNew(false);
                        e.preventDefault();
                        e.stopPropagation();
                        const url = e.dataTransfer.getData("text/plain");
                        if (!url) return;
                        // 拖到这儿就是「给这张图开新的一天」
                        const nextDay = dayCount + 1;
                        setDayCount(nextDay);
                        setDayOf((d) => ({ ...d, [url]: nextDay }));
                      }}
                      className={`w-[92px] shrink-0 rounded-xl border border-dashed text-[10.5px] transition-colors ${
                        dropNew
                          ? "border-emerald-400 bg-emerald-500/15 text-emerald-500 ring-2 ring-emerald-400/40"
                          : "border-slate-400/40 text-slate-400 hover:text-emerald-500"
                      }`}
                    >
                      {dropNew ? "放开＝新的一天" : "＋ 加一天"}
                    </button>
                  )}
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
                      <button
                        type="button"
                        onClick={() => void redoOneDay(n)}
                        disabled={redoingDay === n}
                        title="按你写的标题重写这一天（其它天不动）"
                        className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
                      >
                        {redoingDay === n ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3 h-3" />
                        )}
                        {redoingDay === n ? "重写中" : "按标题重写"}
                      </button>
                      <span className="shrink-0 text-[10px] text-slate-400">
                        {urls.length} 张图
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

                    {/* 图和文贴在同一块：这段字到底是照着哪张图写的，一眼就能核对 */}
                    <div className="mt-3 flex gap-3 items-start">
                      <div className="shrink-0 flex flex-col gap-1">
                        {urls.slice(0, 2).map((m) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={m.url}
                            src={m.url}
                            alt=""
                            className="w-[76px] h-[76px] rounded-lg object-cover border border-white/30 dark:border-white/10"
                          />
                        ))}
                        {urls.length > 2 && (
                          <span className="w-[76px] text-center text-[9.5px] text-slate-400">
                            +{urls.length - 2} 张
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        {dayFails[n] && (
                          <p className="mb-1 flex items-start gap-1 text-[10px] leading-relaxed text-rose-500">
                            <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                            这天没写出来：{dayFails[n]}
                          </p>
                        )}
                        {meta.srcKey && keyOf(urls.map((m) => m.url)) !== meta.srcKey && (
                          <p className="mb-1 flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                            <AlertCircle className="w-3 h-3 shrink-0" />
                            照片换过了，这段字还是按老照片写的 —— 点上面「按标题重写」
                          </p>
                        )}
                        {/* 正文：自动撑高，写多长都摊开 */}
                        <AutoTextarea
                          value={meta.content}
                          onChange={(v) => patch({ content: v })}
                          placeholder="这天发生了什么 —— AI 已经写了初稿，直接改"
                        />
                      </div>
                    </div>
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
