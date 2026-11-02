"use client";

import type { DragEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * 拖到页面正下方松手就烧掉这篇攻略。
 * 形态参考手机充电动效：贴着底边的一条蓝色能量带 + 起伏火舌 + 上升粒子 + 中心白亮。
 * 没有容器、没有边框：只有光和粒子。
 */

const TONGUES = [
  { left: "3%", w: 42, h: 30, o: 0.7 },
  { left: "10%", w: 38, h: 52, o: 0.85 },
  { left: "18%", w: 48, h: 80, o: 1 },
  { left: "27%", w: 40, h: 60, o: 0.95 },
  { left: "35%", w: 50, h: 96, o: 1 },
  { left: "45%", w: 44, h: 70, o: 1 },
  { left: "54%", w: 52, h: 56, o: 0.95 },
  { left: "63%", w: 42, h: 84, o: 1 },
  { left: "72%", w: 46, h: 50, o: 0.9 },
  { left: "80%", w: 38, h: 68, o: 0.85 },
  { left: "88%", w: 42, h: 32, o: 0.7 },
];

const EMBERS = [
  { left: "7%", bottom: 18, size: 2, delay: 0 },
  { left: "13%", bottom: 48, size: 2, delay: 0.35 },
  { left: "19%", bottom: 76, size: 3, delay: 0.7 },
  { left: "26%", bottom: 32, size: 2, delay: 1.05 },
  { left: "32%", bottom: 60, size: 2, delay: 0.2 },
  { left: "38%", bottom: 92, size: 2, delay: 0.55 },
  { left: "44%", bottom: 40, size: 3, delay: 0.9 },
  { left: "50%", bottom: 70, size: 2, delay: 1.25 },
  { left: "56%", bottom: 24, size: 2, delay: 0.45 },
  { left: "62%", bottom: 54, size: 2, delay: 0.8 },
  { left: "68%", bottom: 82, size: 3, delay: 1.15 },
  { left: "74%", bottom: 36, size: 2, delay: 0.3 },
  { left: "80%", bottom: 64, size: 2, delay: 0.65 },
  { left: "86%", bottom: 28, size: 2, delay: 1 },
  { left: "92%", bottom: 50, size: 2, delay: 0.15 },
];

function ChargingFlame({ active }: { active: boolean }) {
  const base = active ? 0.72 : 1.15;

  return (
    <div className="relative h-[215px] w-[390px]" aria-hidden>
      {/* 大范围辉光 */}
      <div
        className="absolute left-1/2 h-[185px] w-[470px] -translate-x-1/2 rounded-full transition-opacity duration-300"
        style={{
          bottom: -46,
          filter: "blur(46px)",
          opacity: active ? 1 : 0.8,
          background:
            "radial-gradient(ellipse at 50% 100%, rgba(56,189,248,0.9), rgba(37,99,235,0.32) 45%, transparent 72%)",
        }}
      />

      {/* 连续底带：把火舌之间的缝补上 */}
      <motion.div
        className="absolute bottom-0 left-[1%] right-[1%] h-12"
        style={{
          filter: "blur(9px)",
          background:
            "linear-gradient(90deg, transparent, rgba(56,189,248,0.5) 12%, rgba(125,211,252,0.85) 50%, rgba(56,189,248,0.5) 88%, transparent)",
        }}
        animate={{ opacity: active ? [0.85, 1, 0.85] : [0.6, 0.8, 0.6] }}
        transition={{ duration: base * 1.1, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* 起伏的火舌 */}
      {TONGUES.map((tongue, index) => (
        <motion.span
          key={index}
          className="absolute"
          style={{
            left: tongue.left,
            bottom: -3,
            width: tongue.w,
            height: tongue.h,
            opacity: tongue.o,
            filter: "blur(3.5px)",
            borderRadius: "50% 50% 45% 45% / 78% 78% 22% 22%",
            background:
              "linear-gradient(180deg, rgba(125,211,252,0) 0%, rgba(56,189,248,0.75) 45%, #bae6fd 80%, #ffffff 100%)",
            transformOrigin: "50% 100%",
          }}
          animate={{
            scaleY: active ? [1, 1.22, 0.94, 1] : [1, 1.12, 0.96, 1],
            opacity: active ? [tongue.o * 0.85, tongue.o, tongue.o * 0.85] : [tongue.o * 0.7, tongue.o, tongue.o * 0.7],
          }}
          transition={{
            duration: (base * 1.15 + (index % 4) * 0.22),
            delay: index * 0.085,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* 中心白亮 */}
      <motion.div
        className="absolute bottom-px left-1/2 h-12 w-[108px] -translate-x-1/2 rounded-full"
        style={{
          filter: "blur(13px)",
          background:
            "radial-gradient(ellipse at 50% 100%, #ffffff, rgba(224,242,254,0.92) 40%, transparent 72%)",
        }}
        animate={{ scale: active ? [1, 1.18, 1] : [1, 1.08, 1], opacity: active ? [0.9, 1, 0.9] : [0.75, 0.9, 0.75] }}
        transition={{ duration: base, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* 贴底的亮线 */}
      <div
        className="absolute bottom-0 left-[5%] right-[5%] h-[3px] rounded-full"
        style={{
          filter: "blur(1.6px)",
          background:
            "linear-gradient(90deg, transparent, rgba(186,230,253,0.45) 12%, #ffffff 50%, rgba(186,230,253,0.45) 88%, transparent)",
        }}
      />

      {/* 上升粒子 */}
      {EMBERS.map((ember, index) => (
        <motion.span
          key={`ember-${index}`}
          className="absolute rounded-full bg-sky-50"
          style={{ left: ember.left, bottom: ember.bottom, width: ember.size, height: ember.size }}
          animate={{
            y: [0, active ? -52 : -34, active ? -86 : -58],
            opacity: [0.95, 0.5, 0],
            scale: [1, 0.7, 0.3],
          }}
          transition={{
            duration: active ? base * 1.1 : base * 1.7,
            delay: ember.delay,
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );
}

export default function FlameTrashZone({
  visible,
  active,
  denied = false,
  label,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  visible: boolean;
  active: boolean;
  denied?: boolean;
  label?: string;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
}) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 56 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 56 }}
          transition={{ type: "spring", stiffness: 220, damping: 24 }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            onDragOver(event);
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            onDragOver(event);
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            onDragLeave(event);
          }}
          onDrop={onDrop}
          className="fixed bottom-0 left-1/2 z-[95] flex w-[420px] -translate-x-1/2 select-none flex-col items-center justify-end"
        >
          <motion.div
            animate={{
              scale: active ? 1.06 : 1,
              filter: denied ? "grayscale(0.55) brightness(0.9)" : "none",
            }}
            transition={{ type: "spring", stiffness: 240, damping: 22 }}
          >
            <ChargingFlame active={active} />
          </motion.div>

          <motion.span
            animate={{ opacity: active ? 1 : 0.85 }}
            className={`absolute bottom-[112px] left-1/2 -translate-x-1/2 whitespace-nowrap text-[12px] font-semibold tracking-wide transition-colors ${
              denied ? "text-slate-300" : active ? "text-white" : "text-cyan-50/90"
            }`}
            style={{ textShadow: denied ? "none" : "0 0 18px rgba(56,189,248,0.95)" }}
          >
            {label ??
              (denied
                ? "这不是你的攻略，删不掉"
                : active
                  ? "松手，烧掉这一篇"
                  : "拖到这里烧掉")}
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
