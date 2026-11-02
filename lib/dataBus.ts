"use client";

import { useEffect } from "react";

/**
 * 一处改动，处处刷新：记忆/攻略/路线 增删后广播一个事件，
 * 地图、时间轴、旅行页各自监听并重新拉数据。
 * 不引入状态库，够用且不会互相打架。
 */
export const DATA_CHANGED = "shiguang:data-changed";

export type DataChange = {
  kind: "memory" | "guide" | "route";
  action: "created" | "deleted";
  id?: string;
};

export function emitDataChanged(change: DataChange) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<DataChange>(DATA_CHANGED, { detail: change }));
}

/** 订阅数据变化；handler 记得用 useCallback 包一下，避免反复绑定 */
export function useDataChanged(handler: (change: DataChange) => void) {
  useEffect(() => {
    const listener = (event: Event) => {
      handler((event as CustomEvent<DataChange>).detail);
    };
    window.addEventListener(DATA_CHANGED, listener as EventListener);
    return () => window.removeEventListener(DATA_CHANGED, listener as EventListener);
  }, [handler]);
}
