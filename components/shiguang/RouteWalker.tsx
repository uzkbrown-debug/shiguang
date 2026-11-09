"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

type Pos = [number, number];

/** 到站停顿 / 终点停留 / 整趟时长区间（毫秒） */
const STOP_MS = 700;
const END_MS = 1300;
const TRIP_MIN_MS = 9000;
const TRIP_MAX_MS = 26000;

/** 小人贴图：deepseek-dafeiyu-pet 的立绘（侧面走路 + 正面站姿），加载失败退回内置小蓝鲸 */
const SIDE_SRC = "/pets/dafeiyu-side.png";
const FRONT_SRC = "/pets/dafeiyu-front.png";

/** 兜底小人：一只圆滚滚的小蓝鲸，纯 SVG */
const PET_SVG = `
<svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
  <defs>
    <linearGradient id="sgPetBody" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7C9BFF"/>
      <stop offset="100%" stop-color="#3D5AFE"/>
    </linearGradient>
  </defs>
  <g class="pet-tail" style="transform-origin:50px 38px">
    <path d="M47 38c6-1 9-6 9-6s-1 6 3 7c-4 2-8 3-12 2z" fill="#5B78FF"/>
    <path d="M47 39c5 1 8 5 8 5s-3 1-4 4c-2-3-4-5-6-6z" fill="#7C9BFF"/>
  </g>
  <ellipse cx="30" cy="36" rx="21" ry="17" fill="url(#sgPetBody)"/>
  <ellipse cx="30" cy="43" rx="15" ry="9" fill="#F2F6FF" opacity="0.95"/>
  <circle cx="22" cy="32" r="2.6" fill="#0B1230"/>
  <circle cx="37" cy="32" r="2.6" fill="#0B1230"/>
  <circle cx="22.9" cy="31" r="0.9" fill="#fff"/>
  <circle cx="37.9" cy="31" r="0.9" fill="#fff"/>
  <ellipse cx="16" cy="38" rx="3.2" ry="2" fill="#FF9EC4" opacity="0.55"/>
  <ellipse cx="44" cy="38" rx="3.2" ry="2" fill="#FF9EC4" opacity="0.55"/>
  <path d="M27 40q3 2.6 6 0" stroke="#0B1230" stroke-width="1.3" fill="none" stroke-linecap="round" opacity="0.65"/>
  <path d="M11 30c-5-1-8-5-8-5s1 5-2 6c4 2 7 2 10 1z" fill="#4E6BFF"/>
  <circle cx="30" cy="18" r="2.4" fill="#DCE6FF" opacity="0.9"/>
  <circle cx="36" cy="14" r="1.6" fill="#DCE6FF" opacity="0.7"/>
</svg>`;

const WALK_FRAMES = 6;
const walkSrc = (i: number) => `/pets/walk/f${i}.png`;

/** 走路：6 张独立帧图轮流显示（用整张图切换，避免雪碧图定位在缩放时叠出残影） */
const SPRITE_HTML = `
<div class="sg-pet">
  <div class="pet-shadow"></div>
  <div class="pet-face">
    ${Array.from({ length: WALK_FRAMES })
      .map(
        (_, i) =>
          `<img class="pet-img pet-frame" data-frame="${i + 1}" src="${walkSrc(i + 1)}" alt="" draggable="false" style="display:${i === 0 ? "block" : "none"}" />`,
      )
      .join("")}
  </div>
  <img class="pet-img pet-front" src="${FRONT_SRC}" alt="" draggable="false" />
  <span class="pet-heart"></span>
  <div class="pet-tag"></div>
</div>`;

/** 没有雪碧图时的退路：静态侧面 + CSS 步态振荡 */
const STATIC_HTML = `
<div class="sg-pet">
  <div class="pet-shadow"></div>
  <div class="pet-face">
    <img class="pet-img pet-side" src="${SIDE_SRC}" alt="" draggable="false" />
  </div>
  <img class="pet-img pet-front" src="${FRONT_SRC}" alt="" draggable="false" />
  <span class="pet-heart"></span>
  <div class="pet-tag"></div>
</div>`;

const SVG_HTML = `
<div class="sg-pet">
  <div class="pet-face"><div class="pet-bob">${PET_SVG}</div></div>
  <div class="pet-tag"></div>
</div>`;

interface Step {
  kind: "move" | "stop";
  /** 起止位置按「沿线的里程（米）」算，不按折线点序号 —— 沿路折线点数动辄几百上千，
      按点算会把小人卡在每一个转弯点上 */
  fromD?: number;
  toD?: number;
  atD?: number;
  /** 这是第几个站点（对应路线里的第几个 point），用来报到站 */
  stopIdx?: number;
  start: number;
  dur: number;
}

interface Plan {
  steps: Step[];
  total: number;
  start: Pos;
  /** 每个折线点的累计里程 */
  cum: number[];
  /** 折线总里程 */
  length: number;
}

export interface WalkStop {
  lat: number;
  lng: number;
  name?: string;
}

/** 折线上「第 d 米」是哪一点（线性插值） */
function pointAt(positions: Pos[], cum: number[], d: number): Pos {
  if (positions.length === 0) return [0, 0];
  if (d <= 0) return positions[0];
  if (d >= cum[cum.length - 1]) return positions[positions.length - 1];
  let lo = 0;
  let hi = cum.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const span = cum[hi] - cum[lo] || 1;
  const k = (d - cum[lo]) / span;
  const a = positions[lo];
  const b = positions[hi];
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
}

function buildPlan(positions: Pos[], stops?: WalkStop[] | null): Plan | null {
  if (positions.length < 2) return null;
  const cum: number[] = [0];
  for (let i = 1; i < positions.length; i++) {
    cum.push(cum[i - 1] + L.latLng(positions[i - 1]).distanceTo(L.latLng(positions[i])));
  }
  const length = cum[cum.length - 1] || 1;

  // 每个站点落在折线的第几米：找最近的那个点，山路的绕行也就对上了
  const stationD: { d: number; idx: number }[] = [];
  (stops ?? []).forEach((s, idx) => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < positions.length; i++) {
      const d = L.latLng(positions[i]).distanceTo(L.latLng(s.lat, s.lng));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (stationD.length && Math.abs(cum[best] - stationD[stationD.length - 1].d) < 200) return;
    stationD.push({ d: cum[best], idx });
  });
  stationD.sort((a, b) => a.d - b.d);

  const stopsAt: { d: number; idx: number | null }[] = [
    { d: 0, idx: stationD[0]?.d === 0 ? stationD[0].idx : null },
  ];
  stationD.forEach((s) => {
    if (s.d > 10) stopsAt.push({ d: s.d, idx: s.idx });
  });
  if (!stopsAt.length || stopsAt[stopsAt.length - 1].d < length - 10) {
    stopsAt.push({ d: length, idx: null });
  }

  // 远的段走得久：整趟控制在 9~26 秒（跟点数无关，只跟里程有关）
  const trip = Math.min(TRIP_MAX_MS, Math.max(TRIP_MIN_MS, length / 30));
  const steps: Step[] = [];
  let cursor = 0;
  for (let i = 1; i < stopsAt.length; i++) {
    const from = stopsAt[i - 1];
    const to = stopsAt[i];
    const dur = Math.max(240, (trip * (to.d - from.d)) / length);
    steps.push({ kind: "move", fromD: from.d, toD: to.d, start: cursor, dur });
    cursor += dur;
    const isLast = i === stopsAt.length - 1;
    const stopDur = isLast ? END_MS : STOP_MS;
    steps.push({ kind: "stop", atD: to.d, stopIdx: to.idx ?? undefined, start: cursor, dur: stopDur });
    cursor += stopDur;
  }
  return { steps, total: cursor, start: positions[0], cum, length };
}

/**
 * 路线小人：沿折线的节点匀速走，到站停一下，走完回起点重来。
 *
 * 两个要点：
 * 1) 每帧只调 marker.setLatLng()，不 setState —— 否则整张地图跟着 React 重渲染；
 * 2) 依赖用「坐标串」而不是数组引用 —— 父组件每次渲染都会新建数组，
 *    直接拿数组当依赖会把 marker 反复重建、动画每次归零。
 */
export default function RouteWalker({
  positions,
  stopNames,
  stops,
  playing,
  onStop,
}: {
  positions: Pos[];
  stopNames?: string[];
  /** 站点的真实坐标：折线密到几百个点时，靠它才知道「哪几处才算到站」 */
  stops?: WalkStop[];
  playing: boolean;
  onStop?: (index: number) => void;
}) {
  const map = useMap();
  const markerRef = useRef<L.Marker | null>(null);
  const elapsedRef = useRef(0);
  const playingRef = useRef(playing);
  const onStopRef = useRef(onStop);
  const positionsRef = useRef(positions);
  const stopsRef = useRef(stopNames);
  const stopsPosRef = useRef(stops);
  const lastStopRef = useRef<number | null>(null);

  // 每帧要用到最新值，但 render 期间不能写 ref —— 放到渲染之后同步
  useEffect(() => {
    positionsRef.current = positions;
    stopsRef.current = stopNames;
    stopsPosRef.current = stops;
    onStopRef.current = onStop;
  });

  /** walk = 有走路帧；static = 只有静图；svg = 内置小蓝鲸 */
  const [petKind, setPetKind] = useState<"walk" | "static" | "svg" | null>(null);

  useEffect(() => {
    let alive = true;
    const probe = (src: string) =>
      new Promise<boolean>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = src;
      });
    (async () => {
      if (await probe(walkSrc(1))) {
        if (alive) setPetKind("walk");
        return;
      }
      if (await probe(SIDE_SRC)) {
        if (alive) setPetKind("static");
        return;
      }
      if (alive) setPetKind("svg");
    })();
    return () => {
      alive = false;
    };
  }, []);

  const posKey = useMemo(() => positions.map((p) => p.join(",")).join("|"), [positions]);
  const stopsKey = useMemo(
    () => (stops ?? []).map((s) => `${s.lat},${s.lng}`).join("|"),
    [stops],
  );
  const plan = useMemo(
    () => buildPlan(positions, stops),
    // 只认坐标串：父组件每次渲染都给新数组，拿数组当依赖会让动画一直归零
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [posKey, stopsKey],
  );

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  // 建 marker（只在贴图或路线结构变化时重建）
  useEffect(() => {
    if (!plan || petKind === null) return;
    const icon = L.divIcon({
      className: "sg-pet-icon",
      html: petKind === "walk" ? SPRITE_HTML : petKind === "static" ? STATIC_HTML : SVG_HTML,
      iconSize: [56, 78],
      iconAnchor: [28, 74],
    });
    // 保险：热更新或切换路线时，地图上可能残留上一只，先清干净，避免出现"残影"
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker && layer.options.icon?.options?.className?.includes("sg-pet-icon")) {
        layer.remove();
      }
    });
    const marker = L.marker(plan.start, { icon, interactive: true, zIndexOffset: 1200 }).addTo(map);
    // 点一下冒爱心（桌宠式的可爱反馈）
    marker.on("click", () => {
      const node = marker.getElement() as HTMLElement | null;
      if (!node) return;
      node.classList.remove("loved");
      void node.offsetWidth;
      node.classList.add("loved");
      window.setTimeout(() => node.classList.remove("loved"), 1200);
    });
    markerRef.current = marker;
    const el0 = marker.getElement();
    if (el0) {
      (el0 as HTMLElement).dataset.state = "stop";
      (el0 as HTMLElement).dataset.playing = playingRef.current ? "1" : "0";
    }
    // 别正好站在起点站点图标上（会叠成一团），先往前挪一点点
    elapsedRef.current = (plan.steps[0]?.dur ?? 0) * 0.06;
    lastStopRef.current = null;
    // 站着的时候隔一会儿自己动一下，别像贴纸
    const idle = window.setInterval(() => {
      const node = marker.getElement() as HTMLElement | null;
      if (!node || node.dataset.state !== "stop" || node.dataset.pose) return;
      node.dataset.pose = "hop";
      window.setTimeout(() => {
        if (node.dataset.pose === "hop") node.dataset.pose = "";
      }, 620);
    }, 7200);

    return () => {
      window.clearInterval(idle);
      marker.remove();
      markerRef.current = null;
    };
  }, [petKind, plan, map]);

  // 每帧推进
  useEffect(() => {
    if (!plan) return;
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(120, now - last);
      last = now;

      const marker = markerRef.current;
      const el = marker?.getElement() as HTMLElement | undefined;
      if (marker && el) {
        if (playingRef.current) {
          elapsedRef.current = (elapsedRef.current + dt) % plan.total;
        }
        const t = elapsedRef.current;
        const step = plan.steps.find((s) => t >= s.start && t < s.start + s.dur) ?? plan.steps[0];
        const pts = positionsRef.current;

        // 同一时刻只显示一个形象：走 = 6 帧轮播里的一帧，站 = 正面图
        // 全部用 style 直接压，不依赖 CSS 覆盖顺序
        const frames = el.querySelectorAll<HTMLElement>(".pet-frame");
        const frontEl = el.querySelector<HTMLElement>(".pet-front");
        const sideEl = el.querySelector<HTMLElement>(".pet-side");
        const moving = step.kind === "move";
        if (frontEl) frontEl.style.display = moving ? "none" : "block";
        if (sideEl) sideEl.style.display = "none";
        if (frames.length) {
          const idx = moving ? Math.floor((t / 130) % WALK_FRAMES) + 1 : 0;
          frames.forEach((f) => {
            f.style.display = moving && Number(f.dataset.frame) === idx ? "block" : "none";
          });
        }

        if (step.kind === "move") {
          const k = Math.min(1, (t - step.start) / step.dur);
          const d = (step.fromD ?? 0) + ((step.toD ?? 0) - (step.fromD ?? 0)) * k;
          const here = pointAt(pts, plan.cum, d);
          marker.setLatLng(here);
          // 比一下「刚走过的 300 米」往哪边偏，决定立绘朝左还是朝右
          const ahead = pointAt(pts, plan.cum, Math.min(plan.length, d + 300));
          const face = el.querySelector<HTMLElement>(".pet-face");
          if (face) face.style.transform = `scaleX(${ahead[1] >= here[1] ? -1 : 1})`;
          const tag = el.querySelector<HTMLElement>(".pet-tag");
          if (tag) tag.style.opacity = "0";
          el.dataset.state = "move";
        } else {
          const at = pointAt(pts, plan.cum, step.atD ?? 0);
          marker.setLatLng(at);
          const tag = el.querySelector<HTMLElement>(".pet-tag");
          if (tag) {
            tag.textContent =
              (step.stopIdx !== undefined ? stopsRef.current?.[step.stopIdx] : undefined) ?? "到了";
            tag.style.opacity = "1";
          }
          el.dataset.state = "stop";
          if (lastStopRef.current !== step.stopIdx) {
            lastStopRef.current = step.stopIdx ?? null;
            if (step.stopIdx !== undefined) onStopRef.current?.(step.stopIdx);
            // 到站开心蹦一下
            el.dataset.pose = "hop";
            window.setTimeout(() => {
              if (el.dataset.pose === "hop") el.dataset.pose = "";
            }, 620);
          }
        }

        // 播放状态写进 DOM：暂停时小人也停住
        el.dataset.playing = playingRef.current ? "1" : "0";

      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [plan]);

  return null;
}
