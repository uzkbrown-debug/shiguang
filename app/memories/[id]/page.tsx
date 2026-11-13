"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  MapPin,
  Trash2,
  X,
  Film,
  Images,
  Bus,
  BedDouble,
  Lightbulb,
  Wallet,
  CalendarDays,
  UserRound,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { fetchMemoryMedia, type MemoryMediaPage } from "@/app/api/shiguang";
import { emitDataChanged } from "@/lib/dataBus";
import StoryNarration from "@/components/shiguang/StoryNarration";
import MemoryVideoPlayer from "@/components/shiguang/MemoryVideoPlayer";
import MediaThumb from "@/components/shiguang/MediaThumb";
import PhotoDanmaku, { type PhotoComment } from "@/components/shiguang/PhotoDanmaku";
import DanmakuSettingsPanel, {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type DanmakuSettings,
} from "@/components/shiguang/DanmakuSettings";
import { Settings2 } from "lucide-react";
import { Mic, Send as SendIcon, Square, MessageSquare, Play, Trash } from "lucide-react";
import { openMic } from "@/lib/mic";

interface CostItem {
  label: string;
  amount?: number | null;
  note?: string | null;
}

interface MemoryFull {
  id: string;
  title: string;
  summary: string;
  content?: string | null;
  happened_at?: string | null;
  visibility?: string;
  location?: { name?: string; city?: string } | null;
  person_ids?: string[];
  tags?: string[];
  emotion?: string | null;
  costs?: CostItem[];
  transport_info?: string | null;
  stay_info?: string | null;
  tips?: string | null;
}

const VIS_TEXT: Record<string, string> = {
  private: "仅自己",
  friends: "好友可见",
  public: "公开",
};

export default function MemoryGalleryPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<MemoryMediaPage | null>(null);
  const [full, setFull] = useState<MemoryFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savingVis, setSavingVis] = useState<string | null>(null);
  // 照片留言：按 media_url 分组，点开大图时以弹幕滚过
  const [comments, setComments] = useState<PhotoComment[]>([]);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  // 语音点不开的原因（http 打开没有麦克风 API / 权限被拒），有值就直接显示
  const [recError, setRecError] = useState("");
  // 弹幕设置（速度 / 透明度 / 字号 / 开关），存本地
  const [dm, setDm] = useState<DanmakuSettings>(DEFAULT_SETTINGS);
  const [dmOpen, setDmOpen] = useState(false);
  // 每张照片各自的输入草稿
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // 留言列表抽屉：谁在这张照片上留过话，一眼看全
  const [dmListOpen, setDmListOpen] = useState(false);
  const [deletingComment, setDeletingComment] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recStartRef = useRef(0);
  const recTargetRef = useRef<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let alive = true;
    // 放到下一个 tick：避免在 effect 体里同步 setState（React 19 的规则）
    const timer = setTimeout(() => {
      setLoading(true);
      Promise.all([
        fetchMemoryMedia(params.id),
        fetch(`/api/memories/${params.id}`, { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ])
        .then(([media, detail]) => {
          if (!alive) return;
          setData(media);
          setFull(detail as MemoryFull | null);
          // 从地图点进来时带 ?photo=<url>：直接翻到那张照片并打开大图（弹幕就在那儿）
          const wanted =
            typeof window === "undefined"
              ? null
              : new URLSearchParams(window.location.search).get("photo");
          const hit = wanted ? (media?.photos ?? []).findIndex((p) => p.url === wanted) : -1;
          setIndex(hit >= 0 ? hit : 0);
          if (hit >= 0 && media?.photos?.[hit]?.kind !== "video") setZoomed(true);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [params.id]);

  /** 拉这条记忆下所有照片的留言 */
  const loadComments = useCallback(() => {
    fetch(`/api/memories/${params.id}/comments`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setComments(Array.isArray(list) ? list : []))
      .catch(() => setComments([]));
  }, [params.id]);

  useEffect(() => {
    const t = setTimeout(loadComments, 0);
    const s0 = setTimeout(() => setDm(loadSettings()), 0);
    return () => {
      clearTimeout(t);
      clearTimeout(s0);
    };
  }, [loadComments]);

  const updateDm = (v: DanmakuSettings) => {
    setDm(v);
    saveSettings(v);
  };

  /** 发文字留言（按照片 url） */
  const sendTextFor = async (url?: string | null) => {
    const text = (url ? drafts[url] ?? "" : "").trim();
    if (!url || !text || sending) return;
    setSending(true);
    try {
      const fd = new FormData();
      fd.append("media_url", url);
      fd.append("kind", "text");
      fd.append("content", text);
      const r = await fetch(`/api/memories/${params.id}/comments`, { method: "POST", body: fd });
      if (r.ok) {
        setDrafts((d) => ({ ...d, [url]: "" }));
        loadComments();
      }
    } finally {
      setSending(false);
    }
  };

  /** 语音留言：录完直接发 */
  const sendVoice = async (blob: Blob, durationMs: number, urlOverride?: string) => {
    const url = urlOverride ?? photos[index]?.url;
    if (!url || !blob.size) return;
    setSending(true);
    try {
      const fd = new FormData();
      fd.append("media_url", url);
      fd.append("kind", "voice");
      fd.append("duration_ms", String(durationMs));
      fd.append("audio", blob, "voice.webm");
      const r = await fetch(`/api/memories/${params.id}/comments`, { method: "POST", body: fd });
      if (r.ok) loadComments();
    } finally {
      setSending(false);
    }
  };

  const startRec = async (urlOverride?: string) => {
    if (recording) return;
    recTargetRef.current = urlOverride ?? photos[index]?.url ?? null;
    setRecError("");
    try {
      const stream = await openMic();
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        void sendVoice(blob, Date.now() - recStartRef.current, recTargetRef.current ?? undefined);
      };
      // 事件处理器里取时间戳，不是渲染期
      // eslint-disable-next-line react-hooks/purity
      recStartRef.current = Date.now();
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch (err) {
      setRecError(err instanceof Error ? err.message : "打不开麦克风");
      setRecording(false);
    }
  };

  const stopRec = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  /** 删一条留言：自己的、或者自己照片下的别人的 */
  const removeComment = async (id: string) => {
    if (deletingComment) return;
    setDeletingComment(id);
    try {
      const r = await fetch(`/api/comments/${id}`, { method: "DELETE" });
      if (r.ok) {
        setComments((list) => list.filter((c) => c.id !== id));
      }
    } finally {
      setDeletingComment(null);
    }
  };

  /** 播一条语音留言 */
  const playVoice = (url?: string | null) => {
    if (!url) return;
    const audio = new Audio(url);
    void audio.play().catch(() => {});
  };

  /** 2026-11-02 22:02:50 → 11月2日 22:02 */
  const whenText = (raw?: string | null) => {
    if (!raw) return "";
    const d = new Date(raw.replace(" ", "T"));
    if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  /** 从地图点进来的，返回就回地图；别的一律回上一页 */
  const goBack = () => {
    const from = new URLSearchParams(window.location.search).get("from");
    if (from === "map") {
      router.push("/map");
      return;
    }
    if (window.history.length > 1) router.back();
    else router.push("/timeline");
  };

  /** 改可见性：仅自己 / 好友 / 公开，改完立刻生效 */
  const changeVisibility = async (value: "private" | "friends" | "public") => {
    if (!full || savingVis) return;
    setSavingVis(value);
    try {
      const res = await fetch(`/api/memories/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: value }),
      });
      if (!res.ok) throw new Error(await res.text());
      setFull({ ...full, visibility: value });
    } catch {
      /* 失败就保持原样 */
    } finally {
      setSavingVis(null);
    }
  };

  const total = data?.photos.length ?? 0;
  const photos = data?.photos ?? [];

  const go = useCallback(
    (delta: number) => {
      if (!total) return;
      setIndex((i) => (i + delta + total) % total);
    },
    [total],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") {
        if (zoomed) setZoomed(false);
        else router.back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, router, zoomed]);

  const remove = async () => {
    if (!data) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/memories/${data.memory_id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      // 地图、时间轴、旅行页一起刷新
      emitDataChanged({ kind: "memory", action: "deleted", id: data.memory_id });
      router.push("/timeline");
    } catch (e) {
      alert(`删除失败：${(e as Error).message}`);
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const costs = full?.costs ?? [];
  const costTotal = useMemo(
    () => costs.reduce((sum, c) => sum + (typeof c.amount === "number" ? c.amount : 0), 0),
    [costs],
  );
  const peopleCount = (full?.person_ids?.length ?? 0) + 1; // 同行的人 + 我
  const perPerson = costTotal > 0 ? Math.round(costTotal / peopleCount) : 0;

  const cover = photos.find((p) => p.kind !== "video")?.url ?? photos[0]?.url;
  const dateText = (full?.happened_at || data?.happened_at || "").slice(0, 10);
  const body = (full?.content || data?.content || data?.summary || "").trim();
  const summary = (data?.summary || "").trim();
  const personNames = data?.person_names ?? [];

  if (loading) {
    return (
      <div className="w-full py-24 flex justify-center">
        <div className="w-7 h-7 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="w-full py-24 text-center">
        <p className="text-sm text-slate-500">这条记忆不存在了。</p>
        <button
          onClick={() => router.push("/timeline")}
          className="mt-4 text-xs text-sky-500 hover:underline"
        >
          回到时间长河
        </button>
      </div>
    );
  }

  return (
    <div className="w-full pb-16 relative z-10">
      {/* 大图 + 标题 */}
      <div className="relative w-full h-[38vh] min-h-[240px] bg-slate-800">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="w-full h-full object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/45 to-slate-950/20" />

        <div className="absolute inset-x-0 top-0 p-4 flex items-center gap-2">
          <button
            onClick={goBack}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-950/50 text-white text-xs hover:bg-slate-950/70 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> 返回
          </button>
          <div className="ml-auto flex items-center gap-2">
            {total > 1 && (
              <button
                onClick={() => setZoomed(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-950/50 text-white text-xs hover:bg-slate-950/70 transition-colors"
              >
                <Images className="w-3.5 h-3.5" /> 看全部 {total} 张
              </button>
            )}
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-950/50 text-white text-xs hover:bg-rose-500/70 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> 删除
            </button>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 p-5 md:p-8 max-w-4xl mx-auto">
          <h1
            className="text-2xl md:text-4xl font-bold text-white drop-shadow"
            style={{ fontFamily: "'Noto Serif SC', serif" }}
          >
            {full?.title ?? data.title}
          </h1>
          {summary && !body.includes(summary.split("\n")[0].trim()) && (
            <p className="mt-2 text-sm text-slate-200 line-clamp-2">{summary}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-300">
            {dateText && (
              <span className="flex items-center gap-1">
                <CalendarDays className="w-3 h-3" />
                {dateText}
              </span>
            )}
            {(data.location_name || full?.location?.name) && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {data.location_name || full?.location?.name}
              </span>
            )}
            {personNames.length > 0 && (
              <span className="flex items-center gap-1">
                <UserRound className="w-3 h-3" />
                同行：{personNames.join("、")}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Images className="w-3 h-3" />
              {total} 张
            </span>
            {full?.visibility && (
              <span className="flex items-center gap-0.5 rounded-full bg-white/10 px-1 py-0.5">
                {(["private", "friends", "public"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => void changeVisibility(v)}
                    disabled={savingVis === v || full.visibility === v}
                    title={
                      v === "private"
                        ? "只有我自己看得到"
                        : v === "friends"
                          ? "我和我的好友看得到"
                          : "所有人都看得到"
                    }
                    className={`rounded-full px-2 py-0.5 text-[10.5px] transition-colors ${
                      full.visibility === v
                        ? "bg-white text-slate-900"
                        : "text-slate-200 hover:bg-white/20"
                    } disabled:opacity-70`}
                  >
                    {savingVis === v ? "…" : VIS_TEXT[v]}
                  </button>
                ))}
              </span>
            )}
            {costTotal > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-100">
                合计 ¥{costTotal.toLocaleString()}
                {peopleCount > 1 ? ` · 人均 ¥${perPerson.toLocaleString()}` : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* 先说数（正文） */}
        {body && (
          <section className="glass-card rounded-2xl border-white/40 dark:border-white/10 p-5 mt-6">
            <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
              {body}
            </p>
          </section>
        )}

        {/* 图文 */}
        <section className="mt-6">
          <h2
            className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-3"
            style={{ fontFamily: "'Noto Serif SC', serif" }}
          >
            照片
            <span className="ml-2 text-[11px] font-normal text-slate-400">点开可以放大、左右翻</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {photos.map((photo, i) => (
              <div key={photo.id} className="space-y-2">
                {/* 照片本身：弹幕滚在上面 */}
                <div className="relative rounded-xl overflow-hidden group aspect-[4/3] border border-white/40 dark:border-white/10">
                  <button
                    onClick={() => {
                      // 视频也要能点开：点开后是站内播放器（原来视频点了没反应）
                      setIndex(i);
                      setZoomed(true);
                    }}
                    className="block w-full h-full"
                  >
                    <MediaThumb
                      src={photo.url}
                      poster={photo.poster}
                      kind={photo.kind}
                      alt={photo.caption}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform"
                    />
                  </button>

                  <PhotoDanmaku
                    compact
                    settings={dm}
                    items={comments.filter((c) => c.media_url === photo.url)}
                  />

                  {photo.caption && (
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 px-2 py-1 text-[10px] text-white text-left bg-gradient-to-t from-slate-950/85 to-transparent truncate">
                      {photo.caption}
                    </span>
                  )}
                </div>

              </div>
            ))}
          </div>
        </section>

        {/* 消费情况 */}
        {costs.length > 0 && (
          <section className="mt-6">
            <h2 className="flex items-center gap-1.5 text-lg font-bold text-slate-800 dark:text-slate-100 mb-3">
              <Wallet className="w-4 h-4 text-amber-500" />
              消费情况
            </h2>
            <div className="glass-card rounded-2xl border-white/40 dark:border-white/10 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[11px] text-slate-400 border-b border-white/20">
                    <th className="text-left font-normal px-4 py-2.5">项目</th>
                    <th className="text-right font-normal px-4 py-2.5 w-24">金额</th>
                    <th className="text-left font-normal px-4 py-2.5 hidden sm:table-cell">备注</th>
                  </tr>
                </thead>
                <tbody>
                  {costs.map((c, i) => (
                    <tr key={`${c.label}-${i}`} className="border-b border-white/10 last:border-0">
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200">{c.label}</td>
                      <td className="px-4 py-2.5 text-right text-amber-600 dark:text-amber-300">
                        {typeof c.amount === "number" ? `¥${c.amount.toLocaleString()}` : "—"}
                      </td>
                      <td className="px-4 py-2.5 hidden sm:table-cell text-slate-400">{c.note ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-amber-400/10">
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-100 font-medium">
                      合计{costTotal > 0 ? `（${peopleCount} 人）` : ""}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-amber-600 dark:text-amber-300">
                      {costTotal > 0 ? `¥${costTotal.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-[11px] text-slate-500 dark:text-slate-400">
                      {perPerson > 0 ? `人均 ¥${perPerson.toLocaleString()}` : ""}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        )}

        {/* 交通 / 住宿 */}
        {(full?.transport_info || full?.stay_info) && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            {full?.transport_info && (
              <div className="glass-card rounded-2xl border-white/40 dark:border-white/10 p-5">
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100">
                  <Bus className="w-4 h-4 text-sky-500" />
                  怎么去的
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                  {full.transport_info}
                </p>
              </div>
            )}
            {full?.stay_info && (
              <div className="glass-card rounded-2xl border-white/40 dark:border-white/10 p-5">
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100">
                  <BedDouble className="w-4 h-4 text-violet-500" />
                  住哪儿
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                  {full.stay_info}
                </p>
              </div>
            )}
          </section>
        )}

        {/* 提醒 */}
        {full?.tips && (
          <section className="glass-card rounded-2xl border-amber-400/30 p-5 mt-6">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              提醒
            </h3>
            <div className="mt-2 space-y-1.5">
              {full.tips
                .split("\n")
                .map((t) => t.trim())
                .filter(Boolean)
                .map((t, i) => (
                  <p key={i} className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    {t.startsWith("①") || t.startsWith("②") || t.startsWith("③") || /^\d/.test(t) ? t : `· ${t}`}
                  </p>
                ))}
            </div>
          </section>
        )}

        {/* 标签 + 配音 */}
        {(full?.tags?.length ?? 0) > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {full!.tags!.map((tag) => (
              <span
                key={tag}
                className="px-2.5 py-1 rounded-full bg-violet-500/10 text-violet-500 text-[11px]"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        <section className="mt-6">
          <StoryNarration memoryId={data.memory_id} />
        </section>
      </div>

      {/* 全屏看图 */}
      <AnimatePresence>
        {zoomed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setZoomed(false)}
            className="fixed inset-0 z-[120] bg-slate-950/95 flex items-center justify-center p-4"
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setZoomed(false);
              }}
              className="absolute top-5 right-5 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
            >
              <X className="w-5 h-5" />
            </button>

            {total > 1 && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    go(-1);
                  }}
                  className="absolute left-3 md:left-8 p-3 rounded-full bg-white/10 text-white hover:bg-white/20"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    go(1);
                  }}
                  className="absolute right-3 md:right-8 p-3 rounded-full bg-white/10 text-white hover:bg-white/20"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}

            <div className="max-w-5xl w-full flex flex-col items-center gap-3 pb-28" onClick={(e) => e.stopPropagation()}>
              {photos[index]?.kind === "video" ? (
                <div className="w-full max-w-3xl">
                  <MemoryVideoPlayer src={photos[index].url} poster={photos[index].poster ?? undefined} />
                </div>
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={photos[index]?.url}
                  alt=""
                  className="max-h-[64vh] max-w-full object-contain rounded-xl"
                />
              )}

              <div className="text-[11px] text-white/70">
                {index + 1} / {total}
                {photos[index]?.caption ? ` · ${photos[index].caption}` : ""}
              </div>

            </div>

          {/* 弹幕：覆盖整屏，从右边飘进来，可以飘到照片外面 */}
          {photos[index]?.kind !== "video" && (
            <PhotoDanmaku
              settings={dm}
              items={comments.filter((c) => c.media_url === photos[index]?.url)}
            />
          )}

          {/* 底部固定留言条：照片底下永远看得见 */}
          {photos[index]?.kind !== "video" && photos[index]?.url && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-x-0 bottom-0 z-10 px-4 pb-4 pt-12 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent"
            >
              <div className="max-w-2xl mx-auto">
                {/* 留言列表：好友留的弹幕在这里一条条看得见，也能删掉自己的 */}
                {dmListOpen && (
                  <div className="mb-2 max-h-[38vh] overflow-y-auto rounded-2xl border border-white/15 bg-slate-950/85 backdrop-blur-xl p-1.5 shadow-2xl">
                    {comments.filter((c) => c.media_url === photos[index]?.url).length === 0 ? (
                      <p className="px-3 py-4 text-center text-[11.5px] text-white/45">
                        还没有人留言，说第一句吧。
                      </p>
                    ) : (
                      comments
                        .filter((c) => c.media_url === photos[index]?.url)
                        .map((c) => (
                          <div
                            key={c.id}
                            className="flex items-start gap-2 rounded-xl px-2.5 py-2 hover:bg-white/[0.06]"
                          >
                            {c.avatar ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={c.avatar}
                                alt=""
                                className="mt-0.5 h-7 w-7 shrink-0 rounded-full object-cover"
                              />
                            ) : (
                              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/15 text-[10px] text-white/80">
                                {(c.nickname ?? "某").slice(0, 1)}
                              </span>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 text-[10.5px] text-white/50">
                                <span className="truncate text-white/80">{c.nickname ?? "某人"}</span>
                                {c.is_mine && (
                                  <span className="rounded bg-sky-500/25 px-1 py-px text-[9px] text-sky-200">
                                    我
                                  </span>
                                )}
                                <span className="ml-auto shrink-0 tabular-nums">
                                  {whenText(c.created_at)}
                                </span>
                              </div>
                              {c.kind === "voice" ? (
                                <button
                                  onClick={() => playVoice(c.audio_url)}
                                  className="mt-1 inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-[11.5px] text-white/85 hover:bg-white/20"
                                >
                                  <Play className="h-3 w-3" />
                                  语音 {Math.round((c.duration_ms ?? 0) / 1000)}&quot;
                                </button>
                              ) : (
                                <p className="mt-0.5 break-words text-[12.5px] leading-relaxed text-white/90">
                                  {c.content}
                                </p>
                              )}
                            </div>
                            {c.can_delete && (
                              <button
                                onClick={() => void removeComment(c.id)}
                                disabled={deletingComment === c.id}
                                title="删掉这条留言"
                                className="mt-1 shrink-0 rounded-lg p-1 text-white/35 hover:bg-rose-500/20 hover:text-rose-300 disabled:opacity-40"
                              >
                                <Trash className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        ))
                    )}
                  </div>
                )}

                {recError && (
                  <p className="mb-2 flex items-start gap-1.5 rounded-xl border border-amber-400/30 bg-amber-500/15 px-3 py-2 text-[11px] leading-relaxed text-amber-100">
                    <Mic className="mt-0.5 h-3 w-3 shrink-0" />
                    {recError}
                  </p>
                )}

                <div className="flex items-center gap-2">
                <input
                  value={drafts[photos[index]!.url] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [photos[index]!.url]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) void sendTextFor(photos[index]?.url);
                  }}
                  placeholder="给这张照片留一句话，它会变成弹幕…"
                  maxLength={140}
                  className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-white/10 border border-white/20 text-[12.5px] text-white placeholder:text-white/40 outline-none focus:border-sky-400/60"
                />
                <button
                  onClick={() => void sendTextFor(photos[index]?.url)}
                  disabled={sending || !(drafts[photos[index]!.url] ?? "").trim()}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-sky-500 text-white text-[12px] font-medium disabled:opacity-40"
                >
                  <SendIcon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">发送</span>
                </button>
                <button
                  onClick={() => (recording ? stopRec() : void startRec())}
                  disabled={sending}
                  title={recording ? "点一下结束并发送语音" : "录一段语音弹幕"}
                  className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-[12px] font-medium disabled:opacity-40 ${
                    recording ? "bg-rose-500 text-white animate-pulse" : "bg-white/10 border border-white/20 text-white/80"
                  }`}
                >
                  {recording ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{recording ? "结束" : "语音"}</span>
                </button>
                <button
                  onClick={() => setDmListOpen((v) => !v)}
                  title="看看这张照片上的留言"
                  className={`relative flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-[12px] font-medium ${
                    dmListOpen ? "bg-sky-500/25 text-sky-200 border border-sky-400/40" : "bg-white/10 border border-white/20 text-white/80"
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  {comments.filter((c) => c.media_url === photos[index]?.url).length}
                </button>
                <div className="relative">
                  <button
                    onClick={() => setDmOpen((v) => !v)}
                    title="弹幕设置"
                    className={`grid place-items-center w-10 h-10 rounded-xl ${
                      dmOpen ? "bg-sky-500/25 text-sky-300" : "bg-white/10 border border-white/20 text-white/70"
                    }`}
                  >
                    <Settings2 className="w-4 h-4" />
                  </button>
                  {dmOpen && (
                    <DanmakuSettingsPanel value={dm} onChange={updateDm} onClose={() => setDmOpen(false)} />
                  )}
                </div>
                </div>
              </div>
            </div>
          )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 删除确认 */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[130] bg-slate-950/70 flex items-center justify-center px-4"
          >
            <div className="w-full max-w-sm rounded-2xl glass-card border-white/20 p-6">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">删除这条记忆？</h3>
              <p className="mt-2 text-[11px] text-slate-500">照片文件也会一起清掉，不能恢复。</p>
              <div className="mt-5 flex items-center gap-2 justify-end">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-4 py-2 rounded-xl glass-button text-xs text-slate-600 dark:text-slate-200"
                >
                  再想想
                </button>
                <button
                  onClick={remove}
                  disabled={deleting}
                  className="px-4 py-2 rounded-xl bg-rose-500 text-white text-xs disabled:opacity-60"
                >
                  {deleting ? "删除中…" : "确认删除"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
