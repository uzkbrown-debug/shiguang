"use client";

import { useState } from "react";
import { Coins, Heart, Loader2 } from "lucide-react";
import { giveGuideCoin, toggleGuideLike } from "@/lib/travel";

/**
 * 攻略的赞 + 币（照哔哩哔哩那套）
 *
 * 点赞是开关；投币一篇最多 2 枚，从自己的余额里扣，扣掉的币记在作者这篇上。
 * 数字是全站一起算的：别人点了赞、投了币，你刷新就能看到同一份数。
 */
export default function GuideReactions({
  guideId,
  likes = 0,
  coins = 0,
  myLiked = false,
  myCoins = 0,
  compact = false,
  onChange,
  onBalance,
}: {
  guideId: string;
  likes?: number;
  coins?: number;
  myLiked?: boolean;
  myCoins?: number;
  /** 卡片里用紧凑版（只有图标和数字） */
  compact?: boolean;
  onChange?: (next: { likes: number; coins: number; my_liked: boolean; my_coins: number }) => void;
  /** 投币之后余额变了，页面上的「我有 N 枚」跟着更新 */
  onBalance?: (balance: number) => void;
}) {
  const [state, setState] = useState({ likes, coins, my_liked: myLiked, my_coins: myCoins });
  const [busy, setBusy] = useState<"" | "like" | "coin">("");
  const [menu, setMenu] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [err, setErr] = useState("");

  const apply = (r: { likes: number; coins: number; my_liked: boolean; my_coins: number; coin_balance: number }) => {
    const next = { likes: r.likes, coins: r.coins, my_liked: r.my_liked, my_coins: r.my_coins };
    setState(next);
    setBalance(r.coin_balance);
    onBalance?.(r.coin_balance);
    onChange?.(next);
  };

  const like = async () => {
    if (busy) return;
    setBusy("like");
    setErr("");
    try {
      apply(await toggleGuideLike(guideId));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "没点成");
    } finally {
      setBusy("");
    }
  };

  const coin = async (amount: number) => {
    if (busy) return;
    setMenu(false);
    setBusy("coin");
    setErr("");
    try {
      apply(await giveGuideCoin(guideId, amount));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "没投成");
    } finally {
      setBusy("");
    }
  };

  const full = state.my_coins >= 2;

  return (
    <div className={compact ? "relative flex items-center gap-3" : "relative flex items-center gap-3.5"}>
      {/* 赞 */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void like();
        }}
        title={state.my_liked ? "取消点赞" : "点个赞"}
        className={`flex items-center gap-1 transition-colors ${
          state.my_liked ? "text-rose-500" : "text-slate-400 hover:text-rose-500"
        } ${compact ? "text-[10.5px]" : "text-xs"}`}
      >
        {busy === "like" ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Heart className="w-3.5 h-3.5" fill={state.my_liked ? "currentColor" : "none"} />
        )}
        <span className="tabular-nums">{state.likes}</span>
      </button>

      {/* 币 */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (full) return;
          setMenu((v) => !v);
        }}
        title={full ? "这篇最多投 2 枚，你已经投满了" : "投个币"}
        className={`flex items-center gap-1 transition-colors ${
          state.my_coins > 0 ? "text-sky-500" : "text-slate-400 hover:text-sky-500"
        } ${compact ? "text-[10.5px]" : "text-xs"} ${full ? "opacity-70" : ""}`}
      >
        {busy === "coin" ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Coins className="w-3.5 h-3.5" />
        )}
        <span className="tabular-nums">{state.coins}</span>
        {state.my_coins > 0 && <span className="text-[9px] text-sky-400">+{state.my_coins}</span>}
      </button>

      {menu && (
        <>
          <span className="fixed inset-0 z-[60]" onClick={() => setMenu(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-[70] w-36 rounded-xl bg-slate-900/95 backdrop-blur border border-white/15 p-1.5 shadow-xl">
            {[1, 2].map((n) => {
              const room = 2 - state.my_coins;
              const disabled = n > room;
              return (
                <button
                  key={n}
                  disabled={disabled}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void coin(n);
                  }}
                  className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] text-left ${
                    disabled
                      ? "text-slate-600 cursor-not-allowed"
                      : "text-slate-200 hover:bg-white/10"
                  }`}
                >
                  <Coins className="w-3 h-3 text-amber-300" />
                  投 {n} 枚
                  {n > 1 && <span className="ml-auto text-[9px] text-slate-500">加满</span>}
                </button>
              );
            })}
            <p className="px-2 pt-1 pb-0.5 text-[9.5px] text-slate-500 border-t border-white/10 mt-1">
              {balance != null ? `我这儿还剩 ${balance} 枚` : "每天补 5 枚"}
            </p>
          </div>
        </>
      )}

      {err && <span className="text-[9.5px] text-rose-500">{err}</span>}
    </div>
  );
}
