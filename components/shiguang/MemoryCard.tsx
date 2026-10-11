"use client";

import { motion } from "framer-motion";
import { MapPin, Users, Sparkles, ImageIcon } from "lucide-react";
import {
  locationById,
  personById,
  yearOf,
  type ShiguangMemory,
} from "@/data/shiguang";

const emotionColor: Record<string, string> = {
  温暖: "text-amber-500",
  不舍: "text-rose-400",
  开心: "text-emerald-500",
  平静: "text-sky-500",
  疲惫: "text-slate-400",
  感慨: "text-violet-400",
};

export default function MemoryCard({
  memory,
  onClick,
  compact = false,
}: {
  memory: ShiguangMemory;
  onClick?: () => void;
  compact?: boolean;
}) {
  const date = new Date(memory.happenedAt);
  const dateText = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(
    date.getDate(),
  ).padStart(2, "0")}`;
  const people = memory.personIds
    .map((id) => personById(id)?.name)
    .filter((n): n is string => Boolean(n) && n !== "我");

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.25 }}
      onClick={onClick}
      className="group glass-card overflow-hidden cursor-pointer rounded-2xl border-white/40 dark:border-white/10 p-0"
    >
      <div className="relative overflow-hidden" style={{ height: compact ? 96 : 140 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={memory.cover}
          alt={memory.title}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-white">
          <span className="text-[11px] font-medium tracking-wide drop-shadow">{dateText}</span>
          <span className="flex items-center gap-1 text-[10px] text-white/80">
            <ImageIcon className="w-3 h-3" />
            {memory.mediaCount}
          </span>
        </div>
        {memory.aiGenerated && (
          <span className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-md text-white/90 text-[10px] border border-white/20">
            <Sparkles className="w-3 h-3" />
            AI 摘要
          </span>
        )}
        {memory.aiStatus === "pending" && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-amber-500/80 text-white text-[10px]">
            待分析
          </span>
        )}
      </div>

      <div className={compact ? "p-3" : "p-4"}>
        <h3
          className={`font-bold text-slate-800 dark:text-slate-100 group-hover:text-sky-500 transition-colors leading-snug ${
            compact ? "text-sm" : "text-base"
          }`}
          style={{ fontFamily: "'Noto Serif SC', serif" }}
        >
          {memory.title}
        </h3>
        {!compact && (
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
            {memory.summary}
          </p>
        )}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {locationById(memory.locationId)?.name ?? "未知地点"}
          </span>
          {people.length > 0 && (
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {people.join("、")}
            </span>
          )}
          {memory.emotion && (
            <span className={emotionColor[memory.emotion] ?? "text-sky-500"}>· {memory.emotion}</span>
          )}
          <span className="ml-auto text-[10px] text-slate-400">{yearOf(memory)}</span>
        </div>
      </div>
    </motion.div>
  );
}
