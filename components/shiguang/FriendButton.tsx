"use client";

// 加好友按钮：自己判断当前关系（陌生人 / 已申请 / 已是好友）
import { useCallback, useEffect, useState } from "react";
import { Check, Clock, Loader2, UserPlus, UserMinus } from "lucide-react";

interface Props {
  userId: string;
  size?: "sm" | "md";
  onChanged?: () => void;
}

interface State {
  is_friend?: boolean;
  pending?: string | null;
  request_from_me?: boolean;
  is_me?: boolean;
  nickname?: string;
}

export default function FriendButton({ userId, size = "md", onChanged }: Props) {
  const [state, setState] = useState<State>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/users/${userId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setState(d))
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.is_me) return null;

  const pad = size === "sm" ? "px-3 py-1.5 text-[11px]" : "px-4 py-2 text-xs";

  const act = async (fn: () => Promise<Response>) => {
    setBusy(true);
    try {
      await fn();
      load();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  if (state.is_friend) {
    return (
      <button
        onClick={() =>
          act(() => fetch(`/api/friends/${userId}`, { method: "DELETE" }))
        }
        disabled={busy}
        className={`flex items-center gap-1.5 rounded-xl glass-button text-slate-600 dark:text-slate-200 ${pad}`}
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserMinus className="w-3.5 h-3.5" />}
        已是好友
      </button>
    );
  }

  if (state.pending === "pending") {
    return (
      <span
        className={`flex items-center gap-1.5 rounded-xl bg-slate-500/10 text-slate-500 dark:text-slate-400 ${pad}`}
      >
        <Clock className="w-3.5 h-3.5" />
        {state.request_from_me ? "申请已发送" : "TA 申请了你，去好友页处理"}
      </span>
    );
  }

  return (
    <button
      onClick={() =>
        act(() =>
          fetch("/api/friends/requests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId }),
          }),
        )
      }
      disabled={busy}
      className={`flex items-center gap-1.5 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 transition-colors ${pad}`}
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : state.pending === "accepted" ? <Check className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
      加为好友
    </button>
  );
}
