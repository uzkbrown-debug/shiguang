"use client";

import { useEffect } from "react";

// Next.js 开发工具浮层是官方组件，源码里没有中文。
// 这里在运行时把它的 Shadow DOM 文本替换成中文（仅开发环境生效）。
const DICT: Record<string, string> = {
  "Route Info": "路由信息",
  "Preferences": "偏好设置",
  "Bundler": "打包器",
  "Static Route": "静态路由",
  "Dynamic Route": "动态路由",
  "Route": "路由",
  "Static": "静态",
  "Dynamic": "动态",
  "Turbopack": "Turbopack",
  "Webpack": "Webpack",
  "Issues": "问题",
  "Build Activity": "构建活动",
  "Hide Dev Tools": "隐藏开发工具",
  "Hide": "隐藏",
  "Close": "关闭",
  "Error": "错误",
  "Warning": "警告",
  "Client": "客户端",
  "Server": "服务端",
};

function translate(root: ParentNode) {
  const walker = document.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node.nodeValue;
    if (text && text.trim()) {
      let next = text;
      for (const [en, zh] of Object.entries(DICT)) {
        if (next.includes(en)) next = next.split(en).join(zh);
      }
      if (next !== text) node.nodeValue = next;
    }
    node = walker.nextNode();
  }
}

export default function DevToolsTranslator() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const attached = new WeakSet<ShadowRoot>();

    const scan = () => {
      document.querySelectorAll("nextjs-portal").forEach((portal) => {
        const shadow = (portal as HTMLElement).shadowRoot;
        if (!shadow) return;
        translate(shadow);
        if (attached.has(shadow)) return;
        attached.add(shadow);
        new MutationObserver(() => translate(shadow)).observe(shadow, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      });
    };

    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(scan, 1500);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
