"use client";

/**
 * 麦克风：把「为什么录不了」说清楚
 *
 * 浏览器只在**安全上下文**（HTTPS 或 localhost）里给 navigator.mediaDevices。
 * 用 http://IP 打开时它是 undefined，原来那两处 `catch {}` 一吞，用户看到的就是
 * 「点了语音没反应」。这里统一判一遍，把原因翻成人话给界面显示。
 */

export function micReady(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.isSecureContext && navigator.mediaDevices?.getUserMedia,
  );
}

export function micHint(): string {
  if (typeof window === "undefined") return "";
  if (!window.isSecureContext) {
    const host = window.location.host;
    return `语音要 HTTPS 才能录音。现在是用 http:// 打开的，换成 https://${host} 再试。`;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return "这个浏览器不支持录音，换 Chrome / Edge 试试。";
  }
  return "";
}

/** 打开麦克风；拿不到就抛一句能直接显示给人看的话 */
export async function openMic(): Promise<MediaStream> {
  const hint = micHint();
  if (hint) throw new Error(hint);
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    const name = (err as { name?: string })?.name ?? "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw new Error("麦克风权限被拒绝了：点地址栏左边的小锁/麦克风图标，允许后再试。");
    }
    if (name === "NotFoundError") {
      throw new Error("没找到麦克风设备。");
    }
    throw new Error(`打不开麦克风（${name || "未知错误"}）`);
  }
}
