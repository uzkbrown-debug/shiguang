"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Inbox,
  Sparkles,
  Trash2,
  RefreshCw,
  Palette,
  AlertCircle,
  ArrowRight,
  ImageIcon,
  FileText,
} from "lucide-react";
import { STYLES, STYLE_DESC, loadStyle, saveStyle } from "@/components/shiguang/writingStyles";

interface PendingItem {
  id: string;
  title: string;
  cover: string | null;
  filename: string | null;
  source_type: string;
  created_at: string | null;
  happened_at: string | null;
  size: number | null;
}

export default function PendingPage() {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [style, setStyle] = useState("diary");
  const [running, setRunning] = useState<string | null>(null);
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  const [doneCount, setDoneCount] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    setStyle(loadStyle());
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pending-memories", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setItems(data.items ?? []);
      setError("");
    } catch (e) {
      setError(`读取待分析列表失败：${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pickStyle = (key: string) => {
    setStyle(key);
    saveStyle(key);
  };

  const analyzeOne = async (id: string, useStyle: string) => {
    const res = await fetch(
      `/api/memories/${id}/analyze?style=${encodeURIComponent(useStyle)}`,
      { method: "POST" },
    );
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  };

  const removeOne = async (id: string) => {
    try {
      const res = await fetch(`/api/memories/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      setItems((prev) => prev.filter((it) => it.id !== id));
    } catch (e) {
      setError(`删除失败：${(e as Error).message}`);
    }
  };

  const runOne = async (id: string) => {
    setRunning(id);
    setError("");
    try {
      await analyzeOne(id, style);
      setItems((prev) => prev.filter((it) => it.id !== id));
      setDoneCount((n) => n + 1);
    } catch (e) {
      setError(`分析失败：${(e as Error).message}`);
    } finally {
      setRunning(null);
    }
  };

  const runAll = async () => {
    if (!items.length || batch) return;
    const queue = [...items];
    setError("");
    setBatch({ done: 0, total: queue.length });
    for (let i = 0; i < queue.length; i++) {
      try {
        await analyzeOne(queue[i].id, style);
        setItems((prev) => prev.filter((it) => it.id !== queue[i].id));
        setDoneCount((n) => n + 1);
      } catch (e) {
        setError(`第 ${i + 1} 条失败：${(e as Error).message}（已停止，剩余 ${queue.length - i} 条）`);
        break;
      }
      setBatch({ done: i + 1, total: queue.length });
      await new Promise((r) => setTimeout(r, 800));
    }
    setBatch(null);
  };

  const styleBar = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
        <Palette className="w-3.5 h-3.5" /> 分析风格
      </span>
      {STYLES.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => pickStyle(s.key)}
          title={STYLE_DESC[s.key]}
          className={`px-2.5 py-1 rounded-full text-[11px] transition-colors ${
            style === s.key
              ? "bg-sky-500 text-white"
              : "bg-slate-500/10 text-slate-500 dark:text-slate-400 hover:bg-slate-500/20"
          }`}
        >
          {s.label}
          <span className="ml-1 text-[10px] opacity-70">{s.hint}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="w-full py-6 md:py-10 relative z-10">
      <header className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mb-5">
        <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-1.5">
          <Inbox className="w-5 h-5 md:w-7 md:h-7 text-sky-500" />
          <h1
            className="text-xl md:text-3xl font-bold text-slate-800 dark:text-slate-100"
            style={{ fontFamily: "'Noto Serif SC', serif" }}
          >
            待分析
          </h1>
          <span className="px-2.5 py-1 rounded-full bg-slate-500/10 text-[11px] text-slate-500 dark:text-slate-400">
            {items.length} 条待处理
          </span>
          <button
            onClick={load}
            title="刷新"
            className="ml-auto p-2 rounded-lg text-slate-400 hover:text-sky-500 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm md:text-base text-slate-500 dark:text-slate-400 ml-7 md:ml-10">
          这些记录已经入库，但还没跑 AI 分析 · 想省额度就先放着，需要时再逐条或批量处理
        </p>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-4 flex items-start gap-2 px-4 py-3 rounded-xl bg-rose-500/10 text-rose-500 text-xs">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {doneCount > 0 && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs">
            <Sparkles className="w-4 h-4" />
            已完成 {doneCount} 条分析
            <Link href="/timeline" className="ml-auto flex items-center gap-1 hover:underline">
              去时间长河查看 <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        )}

        <div className="glass-card rounded-2xl border-white/40 dark:border-white/10 px-4 py-3 flex flex-wrap items-center gap-3 mb-5">
          {styleBar}
          <div className="ml-auto flex items-center gap-2">
            {batch && (
              <span className="text-[11px] text-slate-400 tabular-nums">
                批量分析中 {batch.done} / {batch.total}
              </span>
            )}
            <button
              onClick={runAll}
              disabled={!items.length || !!batch}
              className="tech-btn flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-xs font-medium disabled:opacity-60"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {batch ? "分析中…" : `全部分析（${items.length} 条）`}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-24 flex justify-center">
            <div className="w-7 h-7 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="glass-card rounded-2xl border-white/40 dark:border-white/10 py-16 text-center">
            <Inbox className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-400">没有待分析的记录了</p>
            <Link
              href="/upload"
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl glass-button text-xs text-slate-700 dark:text-slate-100"
            >
              去添加记忆 <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence>
              {items.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  className="glass-card rounded-2xl border-white/40 dark:border-white/10 overflow-hidden p-0"
                >
                  <div className="relative h-40 bg-slate-500/10 flex items-center justify-center">
                    {item.cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.cover} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <FileText className="w-8 h-8 text-slate-400" />
                    )}
                    <span className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/85 text-white text-[10px]">
                      <ImageIcon className="w-3 h-3" />
                      待分析
                    </span>
                  </div>

                  <div className="p-4">
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                      {item.title}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400 space-y-0.5">
                      {item.filename && <div className="truncate">文件：{item.filename}</div>}
                      {item.size != null && <div>{Math.round(item.size / 1024)} KB</div>}
                      {item.happened_at && <div>时间：{item.happened_at.slice(0, 16).replace("T", " ")}</div>}
                    </div>

                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => runOne(item.id)}
                        disabled={!!running || !!batch}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-sky-500 text-white text-[11px] disabled:opacity-60"
                      >
                        {running === item.id ? (
                          <>
                            <span className="w-3 h-3 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
                            分析中
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3 h-3" /> 分析这条
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => removeOne(item.id)}
                        disabled={!!running || !!batch}
                        title="删除这条记录"
                        className="px-3 py-2 rounded-lg glass-button text-[11px] text-rose-500 disabled:opacity-60"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        <p className="mt-6 text-center text-[11px] text-slate-400">
          每条分析约 3–5 秒 · 批量处理会逐条进行，中途可以停下
        </p>
      </div>
    </div>
  );
}
