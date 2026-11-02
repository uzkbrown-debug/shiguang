"use client";

/** 每张卡片一个固定倾角，避免全部笔直显得死板 */
export const tilt = (i: number) => [-2.2, 1.6, -1.2, 2.4, -1.8, 1.1][i % 6];

export interface PolaroidCardProps {
  cover?: string | null;
  title: string;
  /** 2026年11月1日 */
  date?: string;
  /** 右下角胶囊上的字，比如「3 张」「3 天」 */
  badge?: string;
  index: number;
  /** 后面压着几张：1 = 单张相纸，2~3 = 一叠 */
  layers?: number;
  /** 相纸下面多一行小字 */
  footnote?: string;
  /** light = 浅色照片墙（相册页）；dark = 直接贴在深色页面上（旅行页） */
  tone?: "light" | "dark";
}

/** 一张宝丽来：白相纸 + 下宽边 + 两条胶带 + 张数胶囊 + 编号标题日期 */
export default function PolaroidCard({
  cover,
  title,
  date,
  badge,
  index,
  layers = 1,
  footnote,
  tone = "light",
}: PolaroidCardProps) {
  const angle = tilt(index);
  const behind = Math.min(2, Math.max(0, layers - 1));
  const dark = tone === "dark";

  return (
    <div className="group block">
      <div
        className="relative mx-auto w-full max-w-[320px] transition-transform duration-500 group-hover:-translate-y-1.5"
        style={{ transform: `rotate(${angle}deg)` }}
      >
        {/* 后面压着的相纸：露出错位的白边 */}
        {Array.from({ length: behind }).map((_, k) => (
          <div
            key={k}
            className="absolute inset-0 shadow-[0_6px_18px_rgba(15,23,42,0.10)]"
            style={{
              background: k === 0 ? (dark ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.45)") : dark ? "rgba(255,255,255,0.38)" : "rgba(255,255,255,0.7)",
              transform: `rotate(${angle * (k === 0 ? -1.5 : 0.7)}deg) translate(${k === 0 ? 7 : 3}px, ${k === 0 ? 5 : 2}px)`,
            }}
          />
        ))}

        <div
          className={`relative bg-white p-3 pb-14 ${
            dark ? "shadow-[0_18px_44px_rgba(2,6,23,0.55)]" : "shadow-[0_14px_36px_rgba(15,23,42,0.16)]"
          }`}
        >
          <div className="relative aspect-[4/3] overflow-hidden bg-slate-200">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cover}
                alt={title}
                draggable={false}
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[11px] text-slate-400">
                没有照片
              </div>
            )}
          </div>

          {/* 顶部两条半透明胶带，带撕纸的斜边 */}
          <span
            className="pointer-events-none absolute -top-3 left-5 h-6 w-16 bg-[#ded3bb]/75 shadow-sm"
            style={{ transform: "rotate(-7deg)", clipPath: "polygon(2% 0,98% 4%,100% 96%,0 100%)" }}
          />
          <span
            className="pointer-events-none absolute -top-3 right-5 h-6 w-14 bg-[#ded3bb]/65 shadow-sm"
            style={{ transform: "rotate(6deg)", clipPath: "polygon(0 3%,98% 0,100% 98%,2% 100%)" }}
          />

          {badge && (
            <span className="absolute bottom-3 right-3 rounded-full bg-[#123c47] px-2.5 py-[3px] text-[10px] tracking-wide text-white/95">
              {badge}
            </span>
          )}
        </div>
      </div>

      <div className="mt-6 text-center">
        <p className={`text-[9.5px] tracking-[0.42em] ${dark ? "text-slate-400/80" : "text-slate-400"}`}>
          COLLECTION {String(index + 1).padStart(2, "0")}
        </p>
        <h3
          className={`mt-2 line-clamp-2 text-[19px] leading-snug ${dark ? "text-slate-100" : "text-slate-800"}`}
          style={{ fontFamily: "'Noto Serif SC', serif" }}
        >
          {title}
        </h3>
        {date && (
          <p className={`mt-1.5 text-[11px] tracking-wide ${dark ? "text-slate-400" : "text-slate-400"}`}>{date}</p>
        )}
        {footnote && (
          <p className={`mt-1 text-[10.5px] ${dark ? "text-slate-500" : "text-slate-400/90"}`}>{footnote}</p>
        )}
        <span
          className={`mt-1 inline-block text-[11px] transition-colors ${
            dark ? "text-slate-600 group-hover:text-slate-300" : "text-slate-300 group-hover:text-slate-500"
          }`}
        >
          ⌄
        </span>
      </div>
    </div>
  );
}
