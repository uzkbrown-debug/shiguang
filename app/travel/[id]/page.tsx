"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  MapPin,
  Wallet,
  CalendarDays,
  Bus,
  BedDouble,
  Lightbulb,
  Trash2,
  Pencil,
  X,
  Route as RouteIcon,
  Images,
  MessageSquare,
} from "lucide-react";
import FriendButton from "@/components/shiguang/FriendButton";
import GuideReactions from "@/components/shiguang/GuideReactions";
import PhotoDanmaku from "@/components/shiguang/PhotoDanmaku";
import DanmakuDock from "@/components/shiguang/DanmakuDock";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type DanmakuSettings } from "@/components/shiguang/DanmakuSettings";
import { useMediaComments } from "@/lib/mediaComments";
import {
  deleteGuide,
  fetchGuide,
  VISIBILITY_LABEL,
  type GuideFull,
} from "@/lib/travel";
import { fetchMe } from "@/lib/session";

export default function GuideDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [guide, setGuide] = useState<GuideFull | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // 照片弹幕：攻略的封面 / 每天配图 / 图集都能留话
  const mc = useMediaComments("guide", id);
  const [dm, setDm] = useState<DanmakuSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const t = setTimeout(() => setDm(loadSettings()), 0);
    return () => clearTimeout(t);
  }, []);

  const updateDm = (v: DanmakuSettings) => {
    setDm(v);
    saveSettings(v);
  };

  /** 返回来源页：从地图点进来就回地图，直接打开才回旅行广场 */
  const goBack = () => {
    const from = new URLSearchParams(window.location.search).get("from");
    if (from === "map") {
      router.push("/map");
      return;
    }
    if (window.history.length > 1) router.back();
    else router.push("/travel");
  };

  useEffect(() => {
    fetchMe().then((me) => setMyId(me?.id ?? null));
    fetchGuide(id)
      .then(setGuide)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="w-full py-24 flex justify-center">
        <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!guide) {
    return (
      <div className="w-full py-24 text-center">
        <p className="text-sm text-slate-500">这篇攻略不存在，或者没有对你开放。</p>
        <Link href="/travel" className="inline-block mt-4 text-xs text-emerald-500 hover:underline">
          回到旅行广场
        </Link>
      </div>
    );
  }

  const mine = myId && guide.user_id === myId;

  return (
    <div className="w-full pb-16 relative z-10">
      {zoom && (
        <div
          className="fixed inset-0 z-[300] bg-slate-950/95"
          onClick={() => setZoom(null)}
        >
          {/* 弹幕：整屏飘，飘到照片外面也行 */}
          <PhotoDanmaku settings={dm} items={mc.of(zoom)} />

          <div className="relative z-10 h-full flex flex-col items-center justify-center gap-3 pb-28 px-6 pointer-events-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={zoom} alt="" className="max-w-full max-h-[62vh] rounded-xl object-contain pointer-events-auto" />
            <div className="flex items-center gap-2 text-[11px] text-white/60">
              <MessageSquare className="h-3 w-3" />
              {mc.of(zoom).length} 条留言
            </div>
          </div>

          {/* 底部留言条：照片底下永远看得见 */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 bottom-0 z-20 px-4 pb-4 pt-12 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent"
          >
            <DanmakuDock
              items={mc.of(zoom)}
              draft={mc.drafts[zoom] ?? ""}
              onDraft={(v) => mc.setDraft(zoom, v)}
              onSend={() => void mc.sendText(zoom)}
              sending={mc.sending}
              recording={mc.recording}
              onToggleRec={() => (mc.recording ? mc.stopRec() : void mc.startRec(zoom))}
              onDelete={(id) => void mc.remove(id)}
              onPlayVoice={mc.playVoice}
              dm={dm}
              onDm={updateDm}
              recError={mc.recError}
            />
          </div>

          <button
            onClick={() => setZoom(null)}
            className="absolute top-6 right-6 z-20 p-2 rounded-lg bg-white/10 text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[300] bg-slate-950/70 flex items-center justify-center px-4">
          <div className="w-full max-w-sm rounded-2xl glass-card border-white/20 p-6">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">删除这篇攻略？</h3>
            <p className="mt-2 text-[11px] text-slate-500">删掉之后好友也看不到了，不能恢复。</p>
            <div className="mt-5 flex items-center gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 rounded-xl glass-button text-xs text-slate-600 dark:text-slate-200"
              >
                再想想
              </button>
              <button
                onClick={async () => {
                  await deleteGuide(guide.id);
                  router.push("/travel");
                }}
                className="px-4 py-2 rounded-xl bg-rose-500 text-white text-xs"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 封面 */}
      <div className="relative w-full h-[42vh] min-h-[260px] bg-slate-800">
        {guide.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={guide.cover} alt="" className="w-full h-full object-cover" />
        ) : null}
        {/* 封面上的弹幕 */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/50 to-slate-950/20" />
        {guide.cover ? <PhotoDanmaku compact settings={dm} items={mc.of(guide.cover)} /> : null}
        <div className="absolute inset-x-0 top-0 p-4 flex items-center gap-2">
          <button
            onClick={goBack}
            title="返回上一页"
            className="p-2 rounded-lg bg-slate-950/50 text-white hover:bg-slate-950/70 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="ml-auto flex items-center gap-2">
            {mine ? (
              <>
                <Link
                  href={`/travel/new?id=${guide.id}`}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-950/50 text-white text-xs"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  编辑
                </Link>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-950/50 text-white text-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  删除
                </button>
              </>
            ) : (
              <FriendButton userId={guide.user_id} size="sm" />
            )}
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-5 md:p-8 max-w-4xl mx-auto">
          <h1
            className="text-2xl md:text-4xl font-bold text-white drop-shadow"
            style={{ fontFamily: "'Noto Serif SC', serif" }}
          >
            {guide.title}
          </h1>
          {guide.subtitle && <p className="mt-2 text-sm text-slate-200">{guide.subtitle}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-300">
            <Link href={`/u/${guide.user_id}`} className="flex items-center gap-1.5 hover:text-white">
              {guide.owner_avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={guide.owner_avatar} alt="" className="w-5 h-5 rounded-full object-cover" />
              ) : (
                <span className="w-5 h-5 rounded-full bg-white/20" />
              )}
              {guide.owner_name ?? "某人"} 的攻略
            </Link>
            {guide.destination && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {guide.destination}
              </span>
            )}
            <span className="flex items-center gap-1">
              <CalendarDays className="w-3 h-3" />
              {guide.day_count} 天
            </span>
            {guide.budget && (
              <span className="flex items-center gap-1">
                <Wallet className="w-3 h-3" />
                {guide.budget}
              </span>
            )}
            {guide.best_season && <span>最佳月份 {guide.best_season}</span>}
            <span className="px-2 py-0.5 rounded-full bg-white/15">
              {VISIBILITY_LABEL[guide.visibility] ?? "好友可见"}
            </span>
          </div>
          {/* 赞 / 币：所有账号一起计数，投出去的币从自己余额里扣 */}
          <div className="mt-3 flex items-center gap-4 rounded-xl bg-slate-950/45 backdrop-blur px-3 py-1.5 w-fit">
            <GuideReactions
              guideId={guide.id}
              likes={guide.likes}
              coins={guide.coins}
              myLiked={guide.my_liked}
              myCoins={guide.my_coins}
            />          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {guide.summary && (
          <section className="glass-card rounded-2xl border-white/40 dark:border-white/10 p-5 mt-6">
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
              {guide.summary}
            </p>
          </section>
        )}

        {/* 分天行程 */}
        {guide.days.length > 0 && (
          <section className="mt-6">
            <h2
              className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4"
              style={{ fontFamily: "'Noto Serif SC', serif" }}
            >
              行程
            </h2>
            <div className="space-y-5">
              {guide.days.map((d, i) => (
                <div
                  key={d.id ?? i}
                  className="relative glass-card rounded-2xl border-white/40 dark:border-white/10 p-5 pl-12 overflow-hidden"
                >
                  <span className="absolute left-4 top-5 w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] flex items-center justify-center">
                    {i + 1}
                  </span>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{d.title}</h3>
                    {d.transport && (
                      <span className="flex items-center gap-1 text-[10px] text-slate-400">
                        <Bus className="w-3 h-3" />
                        {d.transport}
                      </span>
                    )}
                    {d.cost && (
                      <span className="flex items-center gap-1 text-[10px] text-amber-500">
                        <Wallet className="w-3 h-3" />
                        {d.cost}
                      </span>
                    )}
                  </div>

                  {d.image_url ? (
                    <div className="mt-3 flex flex-col sm:flex-row gap-4">
                      <div className="relative sm:w-1/2 shrink-0 rounded-xl overflow-hidden group">
                        <button
                          onClick={() => setZoom(d.image_url!)}
                          className="block w-full"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={d.image_url}
                            alt=""
                            className="w-full aspect-[4/3] object-cover group-hover:scale-[1.02] transition-transform"
                          />
                        </button>
                        <PhotoDanmaku compact settings={dm} items={mc.of(d.image_url)} />
                      </div>
                      <p className="flex-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                        {d.content}
                      </p>
                    </div>
                  ) : (
                    d.content && (
                      <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                        {d.content}
                      </p>
                    )
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 交通住宿 */}
        {(guide.transport_info || guide.stay_info) && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            {guide.transport_info && (
              <div className="glass-card rounded-2xl border-white/40 dark:border-white/10 p-5">
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100">
                  <Bus className="w-4 h-4 text-sky-500" />
                  交通
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                  {guide.transport_info}
                </p>
              </div>
            )}
            {guide.stay_info && (
              <div className="glass-card rounded-2xl border-white/40 dark:border-white/10 p-5">
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100">
                  <BedDouble className="w-4 h-4 text-violet-500" />
                  住宿
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                  {guide.stay_info}
                </p>
              </div>
            )}
          </section>
        )}

        {/* 关联路线 */}
        {guide.route && (
          <section className="glass-card rounded-2xl border-white/40 dark:border-white/10 p-5 mt-6">
            <div className="flex items-center gap-2">
              <RouteIcon className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">这条攻略走的路线</h3>
              <Link
                href={`/travel/route/${guide.route.id}`}
                className="ml-auto text-[11px] text-emerald-500 hover:underline"
              >
                在地图上看
              </Link>
            </div>
            <div className="mt-3 flex items-center gap-1.5 flex-wrap text-[11px] text-slate-500 dark:text-slate-400">
              {guide.route.points.map((p, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-slate-400">{p.transport || "→"}</span>}
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-300">
                    {p.name}
                  </span>
                </span>
              ))}
            </div>
          </section>
        )}

        {/* 图集 */}
        {guide.media.length > 0 && (
          <section className="mt-6">
            <h2 className="flex items-center gap-1.5 text-lg font-bold text-slate-800 dark:text-slate-100 mb-3">
              <Images className="w-4 h-4 text-emerald-500" />
              图集
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {guide.media.map((m, i) => (
                <div key={m.id ?? i} className="relative rounded-xl overflow-hidden group">
                  <button onClick={() => setZoom(m.url)} className="block w-full">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.url} alt="" className="w-full aspect-[4/3] object-cover group-hover:scale-[1.03] transition-transform" />
                  </button>
                  <PhotoDanmaku compact settings={dm} items={mc.of(m.url)} />
                  {m.caption && (
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 px-2 py-1 text-[10px] text-white bg-gradient-to-t from-slate-950/80 to-transparent text-left">
                      {m.caption}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {guide.tips && (
          <section className="glass-card rounded-2xl border-amber-400/30 p-5 mt-6">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              提醒
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
              {guide.tips}
            </p>
          </section>
        )}

        {!mine && (
          <div className="mt-8 flex items-center justify-center gap-3">
            <FriendButton userId={guide.user_id} />
            <Link
              href={`/u/${guide.user_id}`}
              className="px-4 py-2 rounded-xl glass-button text-xs text-slate-700 dark:text-slate-100"
            >
              看 TA 的全部足迹
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
