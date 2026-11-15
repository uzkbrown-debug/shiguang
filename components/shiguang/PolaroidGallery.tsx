"use client";

import type { DragEvent } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import PolaroidCard from "@/components/shiguang/PolaroidCard";

export interface Collection {
  id: string;
  title: string;
  cover: string;
  /** 2026年11月1日 */
  date: string;
  /** 这一条里有多少张照片 */
  count: number;
  place?: string;
  /** 相纸下面那行小字：好友/公开的相册用来标是谁的 */
  owner?: string;
  /** 这条是谁的记忆（拖去火焰时判断能不能删） */
  ownerId?: string;
}

/** 相册页的拖拽删除：给上这几个回调，卡片就能拖到火焰里烧掉 */
export interface GalleryDrag {
  draggingId: string | null;
  burningId: string | null;
  canDrag: (item: Collection) => boolean;
  onDragStart: (item: Collection, event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}

export default function PolaroidGallery({
  items,
  tone = "light",
  drag,
}: {
  items: Collection[];
  tone?: "light" | "dark";
  drag?: GalleryDrag;
}) {
  return (
    <div className="grid grid-cols-1 gap-x-12 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item, i) => {
        const card = (
          <PolaroidCard
            cover={item.cover}
            title={item.title}
            date={item.date}
            badge={`${Math.max(1, item.count)} 张`}
            index={i}
            layers={item.count > 3 ? 3 : item.count}
            tone={tone}
            footnote={item.owner}
          />
        );

        if (!drag) {
          return (
            <Link key={item.id} href={`/memories/${item.id}`}>
              {card}
            </Link>
          );
        }

        return (
          <motion.div
            key={item.id}
            animate={{
              opacity: drag.burningId === item.id ? 0 : drag.draggingId === item.id ? 0.35 : 1,
              scale: drag.burningId === item.id ? 0.86 : 1,
            }}
            transition={{ duration: 0.26 }}
          >
            {/* 原生拖拽要挂在普通 div 上：motion.div 的 onDragStart 是它自己的手势 */}
            <div
              draggable
              onDragStart={(event) => drag.onDragStart(item, event)}
              onDragEnd={drag.onDragEnd}
              className="cursor-grab select-none active:cursor-grabbing"
              title={
                drag.canDrag(item)
                  ? "拖到页面下方的蓝色火焰里可删除"
                  : "别人的相册拖不进去（只能删自己的）"
              }
            >
              <Link href={`/memories/${item.id}`}>{card}</Link>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
