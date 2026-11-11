"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PhotoComment } from "@/components/shiguang/PhotoDanmaku";
import { openMic } from "@/lib/mic";

/** 照片挂在什么上面：记忆 / 旅行攻略 / 旅行路线 */
export type MediaTarget = "memory" | "guide" | "route";

/**
 * 照片弹幕的数据层：一条内容下所有照片的留言一次拉回来，前端按 media_url 分组。
 * 记忆、攻略、路线共用一个接口，页面只换 targetType / targetId。
 */
export function useMediaComments(targetType: MediaTarget, targetId: string | undefined) {
  const [comments, setComments] = useState<PhotoComment[]>([]);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  // 录不了的原因（没 HTTPS / 没权限），交给界面显示，别静默失败
  const [recError, setRecError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recStartRef = useRef(0);
  const recTargetRef = useRef<string | null>(null);

  const reload = useCallback(() => {
    if (!targetId) return;
    fetch(`/api/media-comments?target_type=${targetType}&target_id=${encodeURIComponent(targetId)}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setComments(Array.isArray(list) ? list : []))
      .catch(() => setComments([]));
  }, [targetType, targetId]);

  useEffect(() => {
    const t = setTimeout(reload, 0);
    return () => clearTimeout(t);
  }, [reload]);

  const of = useCallback((url?: string | null) => comments.filter((c) => c.media_url === url), [comments]);

  const setDraft = useCallback((url: string, text: string) => {
    setDrafts((d) => ({ ...d, [url]: text }));
  }, []);

  const sendText = useCallback(
    async (url?: string | null) => {
      const text = (url ? drafts[url] ?? "" : "").trim();
      if (!url || !text || sending || !targetId) return;
      setSending(true);
      try {
        const fd = new FormData();
        fd.append("target_type", targetType);
        fd.append("target_id", targetId);
        fd.append("media_url", url);
        fd.append("kind", "text");
        fd.append("content", text);
        const r = await fetch("/api/media-comments", { method: "POST", body: fd });
        if (r.ok) {
          setDrafts((d) => ({ ...d, [url]: "" }));
          reload();
        }
      } finally {
        setSending(false);
      }
    },
    [drafts, sending, targetId, targetType, reload],
  );

  const sendVoice = useCallback(
    async (blob: Blob, durationMs: number, url?: string | null) => {
      if (!url || !blob.size || !targetId) return;
      setSending(true);
      try {
        const fd = new FormData();
        fd.append("target_type", targetType);
        fd.append("target_id", targetId);
        fd.append("media_url", url);
        fd.append("kind", "voice");
        fd.append("duration_ms", String(durationMs));
        fd.append("audio", blob, "voice.webm");
        const r = await fetch("/api/media-comments", { method: "POST", body: fd });
        if (r.ok) reload();
      } finally {
        setSending(false);
      }
    },
    [targetId, targetType, reload],
  );

  const startRec = useCallback(
    async (url?: string | null) => {
      if (recording || !url) return;
      recTargetRef.current = url;
      setRecError("");
      try {
        const stream = await openMic();
        const rec = new MediaRecorder(stream);
        chunksRef.current = [];
        rec.ondataavailable = (e) => {
          if (e.data.size) chunksRef.current.push(e.data);
        };
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
          void sendVoice(blob, Date.now() - recStartRef.current, recTargetRef.current);
        };
        // 事件处理器里取时间戳，不是渲染期
        recStartRef.current = Date.now();
        rec.start();
        recorderRef.current = rec;
        setRecording(true);
      } catch (err) {
        // 原来这里是空 catch，用户点了「语音」像没反应；现在把原因摆到界面上
        setRecError(err instanceof Error ? err.message : "打不开麦克风");
        setRecording(false);
      }
    },
    [recording, sendVoice],
  );

  const stopRec = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }, []);

  const remove = useCallback(async (id: string) => {
    const r = await fetch(`/api/comments/${id}`, { method: "DELETE" });
    if (r.ok) setComments((list) => list.filter((c) => c.id !== id));
  }, []);

  const playVoice = useCallback((url?: string | null) => {
    if (!url) return;
    const audio = new Audio(url);
    void audio.play().catch(() => {});
  }, []);

  return {
    comments,
    of,
    drafts,
    setDraft,
    sendText,
    sendVoice,
    sending,
    recording,
    recError,
    startRec,
    stopRec,
    remove,
    playVoice,
    reload,
  };
}

/** 2026-11-02 22:02:50 → 11月2日 22:02 */
export function whenText(raw?: string | null): string {
  if (!raw) return "";
  const d = new Date(raw.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}
