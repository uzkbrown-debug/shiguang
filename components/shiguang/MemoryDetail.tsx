"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MapPin, Calendar, Users, Sparkles, Pencil, HelpCircle, Trash2, Check } from "lucide-react";
import { locationById, personById, type ShiguangMemory } from "@/data/shiguang";

export default function MemoryDetail({
  memory,
  onClose,
}: {
  memory: ShiguangMemory | null;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(memory?.title ?? "");
  const [summary, setSummary] = useState(memory?.summary ?? "");
  const [hint, setHint] = useState<string | null>(null);

  if (!memory) return null;
  const date = new Date(memory.happenedAt);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.25 }}
          onClick={(e) => e.stopPropagation()}
          className="glass-card w-full max-w-3xl max-h-[86vh] overflow-y-auto rounded-2xl p-0 border-white/40 dark:border-white/10"
        >
          <div className="relative h-56 md:h-72">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={memory.cover} alt={memory.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
            <button
              onClick={onClose}
              className="absolute top-3 right-3 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="absolute bottom-4 left-5 right-5 text-white">
              <div className="flex items-center gap-2 text-[11px] text-white/80 mb-1.5">
                <Calendar className="w-3 h-3" />
                {memory.happenedAt.slice(0, 10)} · {memory.timePrecision === "exact" ? "精确到分钟" : "精确到日"}
                {memory.confidence < 0.8 && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/80 text-[10px]">时间不确定</span>
                )}
              </div>
              <h2 className="text-xl md:text-2xl font-bold" style={{ fontFamily: "'Noto Serif SC', serif" }}>
                {memory.title}
              </h2>
            </div>
          </div>

          <div className="p-5 md:p-6">
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300 mb-4">
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400">
                <MapPin className="w-3 h-3" />
                {locationById(memory.locationId)?.name ?? "未知"}
                <span className="opacity-60">（市区级）</span>
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-500/10">
                <Users className="w-3 h-3" />
                {memory.personIds.map((id) => personById(id)?.name).filter(Boolean).join("、")}
              </span>
              {memory.tags.map((t) => (
                <span key={t} className="px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-500 dark:text-violet-400">
                  #{t}
                </span>
              ))}
            </div>

            {editing ? (
              <div className="space-y-3">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="glass-input w-full text-sm text-slate-800 dark:text-slate-100"
                />
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={4}
                  className="glass-input w-full text-sm text-slate-800 dark:text-slate-100 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditing(false);
                      setHint("已保存你的修改，AI 的推断不再作为事实显示。");
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-500 text-white text-sm hover:bg-sky-600 transition-colors"
                  >
                    <Check className="w-4 h-4" /> 保存修改
                  </button>
                  <button
                    onClick={() => {
                      setTitle(memory.title);
                      setSummary(memory.summary);
                      setEditing(false);
                    }}
                    className="px-4 py-2 rounded-xl glass-button text-sm text-slate-600 dark:text-slate-300"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{summary}</p>
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-loose whitespace-pre-line">
                  {memory.content}
                </p>
              </>
            )}

            {memory.aiGenerated && (
              <p className="mt-4 flex items-center gap-2 text-[11px] text-slate-400">
                <Sparkles className="w-3 h-3" />
                标题与摘要由 AI 依据原图与文本生成（置信度 {(memory.confidence * 100).toFixed(0)}%），可修改或删除。
              </p>
            )}

            {hint && (
              <p className="mt-3 text-[11px] text-emerald-500">{hint}</p>
            )}

            <div className="mt-5 flex flex-wrap gap-2 pt-4 border-t border-slate-200/60 dark:border-white/10">
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl glass-button text-xs text-slate-700 dark:text-slate-200"
              >
                <Pencil className="w-3.5 h-3.5" /> 修改
              </button>
              <button
                onClick={() => setHint("已标记为不确定，该推断会以灰色显示，不影响你的原文。")}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl glass-button text-xs text-slate-700 dark:text-slate-200"
              >
                <HelpCircle className="w-3.5 h-3.5" /> 标记不确定
              </button>
              <button
                onClick={() => setHint("演示模式：删除操作需要后端确认，这里只展示入口。")}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl glass-button text-xs text-rose-500"
              >
                <Trash2 className="w-3.5 h-3.5" /> 删除
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
