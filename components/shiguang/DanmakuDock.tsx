"use client";

import { useState } from "react";
import { MessageSquare, Mic, Play, Send as SendIcon, Settings2, Square, Trash } from "lucide-react";
import type { PhotoComment } from "@/components/shiguang/PhotoDanmaku";
import DanmakuSettingsPanel, { type DanmakuSettings } from "@/components/shiguang/DanmakuSettings";
import { whenText } from "@/lib/mediaComments";

/**
 * 照片底下的留言条：输入 / 语音 / 留言列表 / 弹幕设置。
 * 记忆、攻略、路线三个页面共用，只靠 props 传当前照片的留言。
 */
export default function DanmakuDock({
  items,
  draft,
  onDraft,
  onSend,
  sending,
  recording,
  onToggleRec,
  onDelete,
  dm,
  onDm,
  placeholder = "给这张照片留一句话，它会变成弹幕…",
  onPlayVoice,
  recError,
}: {
  items: PhotoComment[];
  draft: string;
  onDraft: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  recording: boolean;
  onToggleRec: () => void;
  onDelete: (id: string) => void;
  dm: DanmakuSettings;
  onDm: (v: DanmakuSettings) => void;
  placeholder?: string;
  onPlayVoice?: (url?: string | null) => void;
  /** 语音点不开的原因（没 HTTPS / 没权限），有值就显示在输入框上方 */
  recError?: string;
}) {
  const [listOpen, setListOpen] = useState(false);
  const [dmOpen, setDmOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  return (
    <div className="max-w-2xl mx-auto">
      {listOpen && (
        <div className="mb-2 max-h-[38vh] overflow-y-auto rounded-2xl border border-white/15 bg-slate-950/85 backdrop-blur-xl p-1.5 shadow-2xl">
          {items.length === 0 ? (
            <p className="px-3 py-4 text-center text-[11.5px] text-white/45">还没有人留言，说第一句吧。</p>
          ) : (
            items.map((c) => (
              <div key={c.id} className="flex items-start gap-2 rounded-xl px-2.5 py-2 hover:bg-white/[0.06]">
                {c.avatar ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={c.avatar} alt="" className="mt-0.5 h-7 w-7 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/15 text-[10px] text-white/80">
                    {(c.nickname ?? "某").slice(0, 1)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[10.5px] text-white/50">
                    <span className="truncate text-white/80">{c.nickname ?? "某人"}</span>
                    {c.is_mine && (
                      <span className="rounded bg-sky-500/25 px-1 py-px text-[9px] text-sky-200">我</span>
                    )}
                    <span className="ml-auto shrink-0 tabular-nums">{whenText(c.created_at)}</span>
                  </div>
                  {c.kind === "voice" ? (
                    <button
                      onClick={() => onPlayVoice?.(c.audio_url)}
                      className="mt-1 inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-[11.5px] text-white/85 hover:bg-white/20"
                    >
                      <Play className="h-3 w-3" />
                      语音 {Math.round((c.duration_ms ?? 0) / 1000)}&quot;
                    </button>
                  ) : (
                    <p className="mt-0.5 break-words text-[12.5px] leading-relaxed text-white/90">{c.content}</p>
                  )}
                </div>
                {c.can_delete && (
                  <button
                    onClick={() => {
                      setDeleting(c.id);
                      onDelete(c.id);
                    }}
                    disabled={deleting === c.id}
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

      {recError && !listOpen && (
        <p className="mb-2 flex items-start gap-1.5 rounded-xl border border-amber-400/30 bg-amber-500/15 px-3 py-2 text-[11px] leading-relaxed text-amber-100">
          <Mic className="mt-0.5 h-3 w-3 shrink-0" />
          {recError}
        </p>
      )}

      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) onSend();
          }}
          placeholder={placeholder}
          maxLength={140}
          className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-white/10 border border-white/20 text-[12.5px] text-white placeholder:text-white/40 outline-none focus:border-sky-400/60"
        />
        <button
          onClick={onSend}
          disabled={sending || !draft.trim()}
          className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-sky-500 text-white text-[12px] font-medium disabled:opacity-40"
        >
          <SendIcon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">发送</span>
        </button>
        <button
          onClick={onToggleRec}
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
          onClick={() => setListOpen((v) => !v)}
          title="看看这张照片上的留言"
          className={`relative flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-[12px] font-medium ${
            listOpen
              ? "bg-sky-500/25 text-sky-200 border border-sky-400/40"
              : "bg-white/10 border border-white/20 text-white/80"
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          {items.length}
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
          {dmOpen && <DanmakuSettingsPanel value={dm} onChange={onDm} onClose={() => setDmOpen(false)} />}
        </div>
      </div>
    </div>
  );
}
