"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Loader2,
  MapPin,
  Wand2,
  Users,
  Lock,
  Globe,
} from "lucide-react";
import type { MapLine, MapPin as MapPinItem } from "@/components/shiguang/MemoryMap";
import {
  fetchRoute,
  lookupGeo,
  saveRoute,
  VISIBILITY_LABEL,
  type RoutePointItem,
} from "@/lib/travel";

const MemoryMap = dynamic(() => import("@/components/shiguang/MemoryMap"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-slate-950 rounded-xl" />,
});

interface DraftPoint {
  name: string;
  latitude: string;
  longitude: string;
  arrive_date: string;
  stay_days: number;
  transport: string;
  note: string;
  busy?: boolean;
}

const emptyPoint = (): DraftPoint => ({
  name: "",
  latitude: "",
  longitude: "",
  arrive_date: "",
  stay_days: 1,
  transport: "",
  note: "",
});

function RouteEditorInner() {
  const params = useSearchParams();
  const router = useRouter();
  const editId = params.get("id");

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState("friends");
  const [points, setPoints] = useState<DraftPoint[]>([emptyPoint()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editId) return;
    fetchRoute(editId).then((r) => {
      if (!r) return;
      setTitle(r.title);
      setSummary(r.summary ?? "");
      setStartDate(r.start_date ?? "");
      setEndDate(r.end_date ?? "");
      setTags(r.tags.join(" "));
      setVisibility(r.visibility);
      setPoints(
        r.points.map((p: RoutePointItem) => ({
          name: p.name,
          latitude: String(p.latitude),
          longitude: String(p.longitude),
          arrive_date: p.arrive_date ?? "",
          stay_days: p.stay_days,
          transport: p.transport ?? "",
          note: p.note ?? "",
        })),
      );
    });
  }, [editId]);

  const patch = (i: number, body: Partial<DraftPoint>) =>
    setPoints((prev) => prev.map((p, k) => (k === i ? { ...p, ...body } : p)));

  const fillCoords = async (i: number) => {
    const name = points[i].name.trim();
    if (!name) return;
    patch(i, { busy: true });
    const geo = await lookupGeo(name);
    patch(i, {
      busy: false,
      ...(geo
        ? { latitude: String(geo.latitude), longitude: String(geo.longitude), name: geo.name }
        : {}),
    });
    if (!geo) setError(`没查到「${name}」的坐标，手动填一下经纬度吧`);
  };

  const validPins: MapPinItem[] = points
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.latitude && p.longitude)
    .map(({ p, i }) => ({
      key: `p${i}`,
      lat: Number(p.latitude),
      lng: Number(p.longitude),
      color: "#facc15",
      cover: null,
      title: p.name || `第 ${i + 1} 站`,
      ownerName: "预览",
      size: 24,
    }));

  const lines: MapLine[] =
    validPins.length > 1
      ? [{ id: "draft", color: "#facc15", positions: validPins.map((p) => [p.lat, p.lng]), label: "路线预览" }]
      : [];

  const submit = async () => {
    const usable = points.filter((p) => p.name.trim() && p.latitude && p.longitude);
    if (!title.trim()) {
      setError("先给路线起个名字");
      return;
    }
    if (usable.length < 2) {
      setError("至少要有两个填好坐标的停留点");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await saveRoute(editId, {
        title: title.trim(),
        summary: summary.trim() || null,
        start_date: startDate || null,
        end_date: endDate || null,
        tags: tags.split(/[\s,，]+/).filter(Boolean),
        visibility,
        points: usable.map((p, i) => ({
          name: p.name.trim(),
          latitude: Number(p.latitude),
          longitude: Number(p.longitude),
          arrive_date: p.arrive_date || null,
          stay_days: p.stay_days || 1,
          transport: p.transport || null,
          note: p.note || null,
          sort: i,
        })),
      });
      router.push(`/travel/route/${saved.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
      setSaving(false);
    }
  };

  const field =
    "w-full px-3 py-2 rounded-xl bg-white/50 dark:bg-white/5 border border-white/50 dark:border-white/10 text-xs text-slate-700 dark:text-slate-100 outline-none focus:border-amber-400/60";

  return (
    <div className="w-full py-6 md:py-10 relative z-10">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 mb-5">
          <Link href="/travel" className="p-2 rounded-lg text-slate-400 hover:text-amber-500">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1
            className="text-xl md:text-2xl font-bold text-slate-800 dark:text-slate-100"
            style={{ fontFamily: "'Noto Serif SC', serif" }}
          >
            {editId ? "编辑路线" : "画一条路线"}
          </h1>
          <button
            onClick={submit}
            disabled={saving}
            className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-400 text-slate-900 text-xs font-medium hover:bg-amber-300 transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            保存路线
          </button>
        </div>

        {error && (
          <p className="mb-4 px-3 py-2 rounded-xl bg-rose-500/10 text-[11px] text-rose-500">{error}</p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="space-y-4">
            <section className="glass-card rounded-2xl border-white/40 dark:border-white/10 p-5 space-y-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="路线名字，比如：云南西北环线"
                className={field}
              />
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={2}
                placeholder="一句话说明这条线怎么走"
                className={`${field} resize-none`}
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={field}
                />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={field}
                />
              </div>
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="标签：自驾 雪山 湖（空格分隔）"
                className={field}
              />
              <div className="flex flex-wrap gap-2">
                {(["private", "friends", "public"] as const).map((v) => {
                  const Icon = v === "private" ? Lock : v === "friends" ? Users : Globe;
                  return (
                    <button
                      key={v}
                      onClick={() => setVisibility(v)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] transition-colors ${
                        visibility === v
                          ? "bg-amber-400 text-slate-900"
                          : "bg-slate-500/10 text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      {VISIBILITY_LABEL[v]}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="glass-card rounded-2xl border-white/40 dark:border-white/10 p-5 space-y-3">
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">停留点（按顺序连成线）</h2>
              {points.map((p, i) => (
                <div key={i} className="rounded-xl border border-white/40 dark:border-white/10 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 shrink-0 rounded-full bg-amber-400 text-slate-900 text-[10px] flex items-center justify-center">
                      {i + 1}
                    </span>
                    <input
                      value={p.name}
                      onChange={(e) => patch(i, { name: e.target.value })}
                      placeholder="城市 / 地点名"
                      className={field}
                    />
                    <button
                      onClick={() => fillCoords(i)}
                      title="按城市名自动补坐标"
                      className="p-2 rounded-lg text-amber-500 hover:bg-amber-500/10"
                    >
                      {p.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => setPoints((prev) => prev.filter((_, k) => k !== i))}
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={p.latitude}
                      onChange={(e) => patch(i, { latitude: e.target.value })}
                      placeholder="纬度 26.87"
                      className={field}
                    />
                    <input
                      value={p.longitude}
                      onChange={(e) => patch(i, { longitude: e.target.value })}
                      placeholder="经度 100.23"
                      className={field}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="date"
                      value={p.arrive_date}
                      onChange={(e) => patch(i, { arrive_date: e.target.value })}
                      className={field}
                    />
                    <input
                      type="number"
                      min={1}
                      value={p.stay_days}
                      onChange={(e) => patch(i, { stay_days: Number(e.target.value) })}
                      placeholder="待几天"
                      className={field}
                    />
                    <input
                      value={p.transport}
                      onChange={(e) => patch(i, { transport: e.target.value })}
                      placeholder="交通：自驾"
                      className={field}
                    />
                  </div>
                  <input
                    value={p.note}
                    onChange={(e) => patch(i, { note: e.target.value })}
                    placeholder="这一站的看点 / 提醒"
                    className={field}
                  />
                </div>
              ))}
              <button
                onClick={() => setPoints((prev) => [...prev, emptyPoint()])}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl glass-button text-xs text-slate-700 dark:text-slate-100"
              >
                <Plus className="w-3.5 h-3.5" />
                加一站
              </button>
            </section>
          </div>

          <div className="lg:sticky lg:top-24 h-fit">
            <div className="glass-card rounded-2xl border-white/40 dark:border-white/10 p-3">
              <div className="flex items-center gap-1.5 mb-2 px-1">
                <MapPin className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  预览：{validPins.length} 个点连线
                </span>
              </div>
              <div className="relative rounded-xl overflow-hidden" style={{ aspectRatio: "4 / 3" }}>
                {validPins.length ? (
                  <MemoryMap
                    pins={validPins}
                    lines={lines}
                    selectedId={null}
                    onSelect={() => {}}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-slate-900/60 text-[11px] text-slate-400">
                    填好坐标后这里会显示路线预览
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RouteEditorPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full py-24 flex justify-center">
          <div className="w-7 h-7 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <RouteEditorInner />
    </Suspense>
  );
}
