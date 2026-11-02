"""只读体检：地点表的重复项与引用情况（不改任何数据）

用法（在 backend 目录下）：
    python scripts/audit_locations.py

输出：
  1. 同一 (规范化名字, 规范化城市) 的重复地点，以及各自被多少条记忆引用
  2. city 字段和 name 不一致的可疑行
  3. 记了地点但坐标是 0 的行（地图上会落到几内亚湾）

想真正合并，先看这份报告确认「哪条是主记录」，再单独写迁移脚本 —— 不要直接删。
"""
import json
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import func, select  # noqa: E402

from db import SessionLocal  # noqa: E402
from models import Location, Memory  # noqa: E402

SUFFIX = ("市", "省", "自治区", "特别行政区", "地区", "盟", "县", "区")


def norm(value: str | None) -> str:
    text = (value or "").strip()
    for suffix in SUFFIX:
        if text.endswith(suffix) and len(text) > len(suffix):
            return text[: -len(suffix)]
    return text


def main() -> None:
    db = SessionLocal()
    try:
        locations = list(db.scalars(select(Location)))
        usage = dict(
            db.execute(select(Memory.location_id, func.count()).group_by(Memory.location_id)).all()
        )

        groups: dict[tuple[str, str], list[Location]] = defaultdict(list)
        for loc in locations:
            groups[(norm(loc.name), norm(loc.city) or norm(loc.name))].append(loc)

        dupes = {k: v for k, v in groups.items() if len(v) > 1}
        print(f"地点总数 {len(locations)}，规范化后 {len(groups)} 组，其中重复 {len(dupes)} 组\n")

        for (name, city), items in sorted(dupes.items(), key=lambda kv: -len(kv[1])):
            print(f"[重复] {name} / {city}")
            for loc in items:
                print(
                    f"    {loc.id:<24} name={loc.name!r:<16} city={loc.city!r:<12} "
                    f"记忆={usage.get(loc.id, 0)} 坐标=({loc.latitude},{loc.longitude})"
                )

        mismatched = [
            loc for loc in locations if norm(loc.city) and norm(loc.name) not in ("", norm(loc.city))
        ]
        print(f"\n[名字≠城市] {len(mismatched)} 行（多数是景点，属正常；只看有没有填错）")
        for loc in mismatched[:15]:
            print(f"    {loc.id:<24} {loc.name!r} city={loc.city!r} 记忆={usage.get(loc.id, 0)}")

        zero = [loc for loc in locations if not loc.latitude or not loc.longitude]
        print(f"\n[没坐标] {len(zero)} 行：", ", ".join(loc.name or loc.id for loc in zero[:12]))

        orphan = [loc.id for loc in locations if usage.get(loc.id, 0) == 0]
        print(f"\n[没有任何记忆引用] {len(orphan)} 行：", ", ".join(orphan[:12]))

        report = {
            "total": len(locations),
            "groups": len(groups),
            "duplicates": {
                f"{name}/{city}": [
                    {"id": loc.id, "name": loc.name, "city": loc.city, "memories": usage.get(loc.id, 0)}
                    for loc in items
                ]
                for (name, city), items in dupes.items()
            },
            "no_coords": [loc.id for loc in zero],
            "unused": orphan,
        }
        out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "audit_locations.json")
        with open(out, "w", encoding="utf-8") as fp:
            json.dump(report, fp, ensure_ascii=False, indent=1)
        print(f"\n报告已写入 {out}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
