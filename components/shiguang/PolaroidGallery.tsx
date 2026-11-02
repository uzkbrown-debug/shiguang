"use client";

import Link from "next/link";
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
}

export default function PolaroidGallery({
  items,
  tone = "light",
}: {
  items: Collection[];
  tone?: "light" | "dark";
}) {
  return (
    <div className="grid grid-cols-1 gap-x-12 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item, i) => (
        <Link key={item.id} href={`/memories/${item.id}`}>
          <PolaroidCard
            cover={item.cover}
            title={item.title}
            date={item.date}
            badge={`${Math.max(1, item.count)} 张`}
            index={i}
            layers={item.count > 3 ? 3 : item.count}
            tone={tone}
          />
        </Link>
      ))}
    </div>
  );
}
