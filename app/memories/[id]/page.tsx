"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import StoryNarration from "@/components/shiguang/StoryNarration";
import MemoryVideoPlayer from "@/components/shiguang/MemoryVideoPlayer";

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
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let alive = true;
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
        setIndex(0);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [params.id]);

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
            onClick={() => router.back()}
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
              <span className="px-2 py-0.5 rounded-full bg-white/15">
                {VIS_TEXT[full.visibility] ?? "好友可见"}
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
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photos.map((photo, i) => (
              <button
                key={photo.id}
                onClick={() => {
                  setIndex(i);
                  if (photo.kind !== "video") setZoomed(true);
                }}
                className="relative rounded-xl overflow-hidden group aspect-[4/3] border border-white/40 dark:border-white/10"
              >
                {photo.kind === "video" ? (
                  <>
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video src={photo.url} muted preload="metadata" className="w-full h-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/35 text-white/90">
                      <Film className="w-5 h-5" />
                    </span>
                  </>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={photo.url}
                    alt={photo.caption}
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform"
                  />
                )}
                {photo.caption && (
                  <span className="absolute inset-x-0 bottom-0 px-2 py-1 text-[10px] text-white text-left bg-gradient-to-t from-slate-950/85 to-transparent truncate">
                    {photo.caption}
                  </span>
                )}
              </button>
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

            <div className="max-w-5xl w-full flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
              {photos[index]?.kind === "video" ? (
                <div className="w-full max-w-3xl">
                  <MemoryVideoPlayer src={photos[index].url} />
                </div>
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={photos[index]?.url}
                  alt=""
                  className="max-h-[78vh] max-w-full object-contain rounded-xl"
                />
              )}
              <div className="text-[11px] text-white/70">
                {index + 1} / {total}
                {photos[index]?.caption ? ` · ${photos[index].caption}` : ""}
              </div>
            </div>
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
