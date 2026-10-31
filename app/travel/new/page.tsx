"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Trash2,
  ArrowLeft,
  Save,
  ImagePlus,
  Loader2,
  Users,
  Lock,
  Globe,
  Route as RouteIcon,
} from "lucide-react";
import {
  fetchGuide,
  fetchRoutes,
  saveGuide,
  uploadImages,
  VISIBILITY_HINT,
  VISIBILITY_LABEL,
  type GuideDayItem,
  type TravelRouteItem,
} from "@/lib/travel";

interface MediaItem {
  url: string;
  caption?: string | null;
}

function EditorInner() {
  const params = useSearchParams();
  const router = useRouter();
  const editId = params.get("id");

  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [destination, setDestination] = useState("");
  const [budget, setBudget] = useState("");
  const [season, setSeason] = useState("");
  const [transport, setTransport] = useState("");
  const [stay, setStay] = useState("");
  const [summary, setSummary] = useState("");
  const [tips, setTips] = useState("");
  const [visibility, setVisibility] = useState("friends");
  const [routeId, setRouteId] = useState("");
  const [days, setDays] = useState<GuideDayItem[]>([
    { sort: 0, title: "第 1 天", content: "", transport: "", cost: "" },
  ]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [cover, setCover] = useState("");
  const [myRoutes, setMyRoutes] = useState<TravelRouteItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchRoutes({ scope: "me" }).then((r) => setMyRoutes(r ?? []));
  }, []);

  useEffect(() => {
    if (!editId) return;
    fetchGuide(editId).then((g) => {
      if (!g) return;
      setTitle(g.title);
      setSubtitle(g.subtitle ?? "");
      setDestination(g.destination ?? "");
      setBudget(g.budget ?? "");
      setSeason(g.best_season ?? "");
      setTransport(g.transport_info ?? "");
      setStay(g.stay_info ?? "");
      setSummary(g.summary ?? "");
      setTips(g.tips ?? "");
      setVisibility(g.visibility);
      setRouteId(g.route_id ?? "");
      setDays(g.days.length ? g.days : [{ sort: 0, title: "第 1 天" }]);
      setMedia(g.media.map((m) => ({ url: m.url, caption: m.caption })));
      setCover(g.cover ?? "");
    });
  }, [editId]);

  const dayCount = useMemo(() => days.filter((d) => d.title.trim()).length || days.length, [days]);

  /** 给某一天配图（图片攻略） */
  const patchDayImage = (i: number, url: string | null) =>
    setDays((prev) => prev.map((d, k) => (k === i ? { ...d, image_url: url } : d)));

  const onPickFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setError("");
    try {
      const urls = await uploadImages(Array.from(files), visibility);
      const added = urls.map((url) => ({ url }));
      setMedia((prev) => [...prev, ...added]);
      if (!cover && added[0]) setCover(added[0].url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "图片上传失败");
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!title.trim()) {
      setError("先给攻略起个标题");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = {
        title: title.trim(),
        subtitle: subtitle.trim() || null,
        cover: cover || null,
        destination: destination.trim() || null,
        budget: budget.trim() || null,
        best_season: season.trim() || null,
        transport_info: transport.trim() || null,
        stay_info: stay.trim() || null,
        summary: summary.trim() || null,
        tips: tips.trim() || null,
        route_id: routeId || null,
        visibility,
        status: "published",
        days: days.map((d, i) => ({
          title: d.title?.trim() || `第 ${i + 1} 天`,
          content: d.content ?? "",
          transport: d.transport ?? "",
          cost: d.cost ?? "",
          sort: i,
        })),
        media: media.map((m, i) => ({ url: m.url, caption: m.caption ?? null, sort: i })),
      };
      const saved = await saveGuide(editId, body);
      router.push(`/travel/${saved.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
      setSaving(false);
    }
  };

  const field =
    "w-full px-3 py-2 rounded-xl bg-white/50 dark:bg-white/5 border border-white/50 dark:border-white/10 text-xs text-slate-700 dark:text-slate-100 outline-none focus:border-emerald-400/60";
  const label = "text-[11px] text-slate-500 dark:text-slate-400";

  return (
    <div className="w-full py-6 md:py-10 relative z-10">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 mb-5">
          <Link href="/travel" className="p-2 rounded-lg text-slate-400 hover:text-emerald-500">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1
            className="text-xl md:text-2xl font-bold text-slate-800 dark:text-slate-100"
            style={{ fontFamily: "'Noto Serif SC', serif" }}
          >
            {editId ? "编辑攻略" : "写一篇攻略"}
          </h1>
          <button
            onClick={submit}
            disabled={saving}
            className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 text-white text-xs hover:bg-emerald-600 transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            保存并发布
          </button>
        </div>

        {error && (
          <p className="mb-4 px-3 py-2 rounded-xl bg-rose-500/10 text-[11px] text-rose-500">{error}</p>
        )}

        <section className="glass-card rounded-2xl border-white/40 dark:border-white/10 p-5 space-y-4">
          <div>
            <span className={label}>标题</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="比如：云南六天，先大理后丽江"
              className={`mt-1.5 ${field}`}
            />
          </div>
          <div>
            <span className={label}>一句话副标题</span>
            <input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="别把丽江放前面，会缺氧"
              className={`mt-1.5 ${field}`}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <span className={label}>目的地</span>
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="昆明 · 大理 · 丽江"
                className={`mt-1.5 ${field}`}
              />
            </div>
            <div>
              <span className={label}>人均花费</span>
              <input
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="3200 元"
                className={`mt-1.5 ${field}`}
              />
            </div>
            <div>
              <span className={label}>最佳季节</span>
              <input
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                placeholder="3—4 月"
                className={`mt-1.5 ${field}`}
              />
            </div>
          </div>

          <div>
            <span className={label}>可见范围（{dayCount} 天行程）</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {(["private", "friends", "public"] as const).map((v) => {
                const Icon = v === "private" ? Lock : v === "friends" ? Users : Globe;
                return (
                  <button
                    key={v}
                    onClick={() => setVisibility(v)}
                    title={VISIBILITY_HINT[v]}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] transition-colors ${
                      visibility === v
                        ? "bg-emerald-500 text-white"
                        : "bg-slate-500/10 text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {VISIBILITY_LABEL[v]}
                  </button>
                );
              })}
              <select
                value={routeId}
                onChange={(e) => setRouteId(e.target.value)}
                className="ml-auto px-3 py-1.5 rounded-xl bg-white/50 dark:bg-white/5 border border-white/50 dark:border-white/10 text-[11px] text-slate-600 dark:text-slate-200 outline-none"
              >
                <option value="">不关联路线</option>
                {myRoutes.map((r) => (
                  <option key={r.id} value={r.id}>
                    关联路线：{r.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="glass-card rounded-2xl border-white/40 dark:border-white/10 p-5 mt-4 space-y-3">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">分天行程</h2>
          {days.map((d, i) => (
            <div
              key={i}
              className="rounded-xl border border-white/40 dark:border-white/10 p-3 space-y-2 bg-white/30 dark:bg-white/[0.03]"
            >
              <div className="flex items-center gap-2">
                <input
                  value={d.title ?? ""}
                  onChange={(e) =>
                    setDays((prev) => prev.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))
                  }
                  placeholder={`第 ${i + 1} 天`}
                  className={`flex-1 ${field}`}
                />
                <button
                  onClick={() => setDays((prev) => prev.filter((_, k) => k !== i))}
                  className="p-2 rounded-lg text-slate-400 hover:text-rose-500"
                  title="删掉这天"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <textarea
                value={d.content ?? ""}
                onChange={(e) =>
                  setDays((prev) => prev.map((x, k) => (k === i ? { ...x, content: e.target.value } : x)))
                }
                rows={5}
                placeholder={"这天怎么走、车次、门票、吃了什么、花了多少，都可以写。\n比如：早上 8:20 从昆明站坐 C 字头到丽江，2 小时 40 分，二等座 144 元。"}
                className={`${field} resize-none`}
              />

              {/* 每天配图（图片攻略） */}
              <div className="flex items-start gap-2">
                {d.image_url ? (
                  <div className="relative w-28 h-20 rounded-xl overflow-hidden shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={d.image_url} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => setDays((prev) => prev.map((x, k) => (k === i ? { ...x, image_url: null } : x)))}
                      className="absolute top-1 right-1 p-0.5 rounded bg-slate-950/70 text-white"
                      title="去掉这天的配图"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <label className="w-28 h-20 rounded-xl border border-dashed border-white/30 flex flex-col items-center justify-center gap-1 text-[10px] text-slate-400 cursor-pointer shrink-0">
                    <ImagePlus className="w-4 h-4" />
                    这天配图
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const files = e.target.files;
                        if (!files?.length) return;
                        setUploading(true);
                        try {
                          const urls = await uploadImages([files[0]], visibility);
                          if (urls[0]) {
                            patchDayImage(i, urls[0]);
                            setMedia((prev) => [...prev, { url: urls[0] }]);
                          }
                        } catch {
                          setError("配图上传失败");
                        } finally {
                          setUploading(false);
                        }
                      }}
                    />
                  </label>
                )}
                {media.length > 0 && (
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-slate-400 mb-1">或从图集里点一张</p>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {media.slice(0, 12).map((m, k) => (
                        <button
                          key={`${m.url}-${k}`}
                          onClick={() => patchDayImage(i, m.url)}
                          className={`shrink-0 w-12 h-12 rounded-lg overflow-hidden border ${
                            d.image_url === m.url ? "border-emerald-400" : "border-white/20"
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={m.url} alt="" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={d.transport ?? ""}
                  onChange={(e) =>
                    setDays((prev) => prev.map((x, k) => (k === i ? { ...x, transport: e.target.value } : x)))
                  }
                  placeholder="交通：自驾 / 高铁"
                  className={field}
                />
                <input
                  value={d.cost ?? ""}
                  onChange={(e) =>
                    setDays((prev) => prev.map((x, k) => (k === i ? { ...x, cost: e.target.value } : x)))
                  }
                  placeholder="花费：约 900 元"
                  className={field}
                />
              </div>
            </div>
          ))}
          <button
            onClick={() =>
              setDays((prev) => [
                ...prev,
                { sort: prev.length, title: `第 ${prev.length + 1} 天`, content: "", transport: "", cost: "" },
              ])
            }
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl glass-button text-xs text-slate-700 dark:text-slate-100"
          >
            <Plus className="w-3.5 h-3.5" />
            加一天
          </button>
        </section>

        <section className="glass-card rounded-2xl border-white/40 dark:border-white/10 p-5 mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">交通与住宿</h2>
          </div>
          <textarea
            value={transport}
            onChange={(e) => setTransport(e.target.value)}
            rows={2}
            placeholder="怎么去、在哪换乘、租车还是高铁"
            className={`${field} resize-none`}
          />
          <textarea
            value={stay}
            onChange={(e) => setStay(e.target.value)}
            rows={2}
            placeholder="住哪个区最方便"
            className={`${field} resize-none`}
          />
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
            placeholder="前言：这次旅行大概是什么样"
            className={`${field} resize-none`}
          />
          <textarea
            value={tips}
            onChange={(e) => setTips(e.target.value)}
            rows={2}
            placeholder="避坑与提醒"
            className={`${field} resize-none`}
          />
        </section>

        <section className="glass-card rounded-2xl border-white/40 dark:border-white/10 p-5 mt-4">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">图集</h2>
            <label className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl glass-button text-xs text-slate-700 dark:text-slate-100 cursor-pointer">
              {uploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ImagePlus className="w-3.5 h-3.5" />
              )}
              上传照片
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => onPickFiles(e.target.files)}
              />
            </label>
          </div>
          {media.length === 0 ? (
            <p className="text-[11px] text-slate-400">可以一次选很多张，第一张会当封面。</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {media.map((m, i) => (
                <div key={`${m.url}-${i}`} className="relative group rounded-xl overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt="" className="w-full aspect-square object-cover" />
                  <div className="absolute inset-x-0 bottom-0 p-1 flex items-center gap-1 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setCover(m.url)}
                      className={`flex-1 text-[10px] rounded px-1 py-0.5 ${
                        cover === m.url ? "bg-amber-400 text-slate-900" : "bg-white/20 text-white"
                      }`}
                    >
                      {cover === m.url ? "封面" : "设为封面"}
                    </button>
                    <button
                      onClick={() => setMedia((prev) => prev.filter((_, k) => k !== i))}
                      className="p-1 rounded bg-white/20 text-white"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="flex items-center gap-2 mt-5">
          <RouteIcon className="w-3.5 h-3.5 text-amber-500" />
          <p className="text-[11px] text-slate-400">
            想让攻略在地图上连成线，先去
            <Link href="/travel/route/new" className="text-emerald-500 hover:underline mx-1">
              画一条路线
            </Link>
            ，再回来关联。
          </p>
        </div>
      </div>
    </div>
  );
}

export default function NewGuidePage() {
  return (
    <Suspense
      fallback={
        <div className="w-full py-24 flex justify-center">
          <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <EditorInner />
    </Suspense>
  );
}
