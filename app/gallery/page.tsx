"use client";

import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import PolaroidGallery, { type Collection } from "@/components/shiguang/PolaroidGallery";
import { fetchMemories } from "@/app/api/shiguang";

/** 2026-11-01 → 2026年11月1日 */
function cnDate(raw: string): string {
  if (!raw) return "";
  const d = new Date(raw.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export default function GalleryPage() {
  const [items, setItems] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { items: mems } = await fetchMemories();
        if (!alive) return;
        const list: Collection[] = mems
          .filter((m) => m.cover)
          .map((m) => ({
            id: m.id,
            title: m.title || "一段未命名的记忆",
            cover: m.cover,
            date: cnDate(m.happened_at),
            count: m.media_count || 1,
            place: m.location_id ?? "",
          }))
          .sort((a, b) => (a.date < b.date ? 1 : -1));
        setItems(list);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    // 和全站一致：不铺自己的底色，让站点背景透上来
    <div className="min-h-[calc(100vh-4rem)] text-slate-100">
      <div className="mx-auto w-full max-w-6xl px-6 py-14 md:px-10 md:py-20">
        {/* 页头 */}
        <div className="mb-16 flex flex-wrap items-center gap-x-8 gap-y-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-white/25 text-slate-300">
            <Clock3 className="h-[18px] w-[18px]" />
          </span>
          <div className="flex items-end gap-4">
            <h1
              className="text-[34px] leading-none tracking-[0.18em] text-slate-100"
              style={{ fontFamily: "'Noto Serif SC', serif" }}
            >
              相册
            </h1>
            <span className="mb-1 text-[9.5px] tracking-[0.55em] text-slate-400">GALLERY</span>
          </div>
          <p className="text-[12px] leading-relaxed text-slate-400">
            把想留住的，把时间收进一张张胶片。
          </p>
          <div className="ml-auto hidden text-right text-[10px] leading-relaxed text-slate-400 sm:block">
            <p>You in</p>
            <p>拾光</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-emerald-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/20 py-24 text-center">
            <p className="text-[13px] text-slate-300">相册还是空的</p>
            <p className="mt-2 text-[11px] text-slate-400">
              传一批照片、写成一条记忆，它就会变成这里的一张相纸。
            </p>
          </div>
        ) : (
          <PolaroidGallery items={items} tone="dark" />
        )}
      </div>
    </div>
  );
}
