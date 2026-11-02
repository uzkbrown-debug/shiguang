"""图片文件补回来之后，把当初被迫映射成 /images/*.webp 的地址换回真实的 /media/uploads/...

只改「原始地址的文件现在确实存在」的记录，其它保持不动。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from db import SessionLocal  # noqa: E402
from ingest import UPLOAD_DIR  # noqa: E402
from models import GuideDay, GuideMedia, Memory, MemoryMedia, TravelGuide  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RECOVERED = ROOT / "legacy_recovered"


def exists(url: str | None) -> bool:
    if not url or not url.startswith("/media/uploads/"):
        return False
    return (UPLOAD_DIR / url.split("/")[-1]).exists()


def load(name: str) -> list[dict]:
    path = RECOVERED / f"{name}.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else []


def main(apply: bool) -> int:
    db = SessionLocal()
    changes = 0

    # 记忆封面
    origin = {m["id"]: m.get("cover") for m in load("memories")}
    for mem in db.scalars(select(Memory)).all():
        want = origin.get(mem.id)
        if want and exists(want) and mem.cover != want:
            print(f"memory {mem.id}: {mem.cover} → {want}")
            if apply:
                mem.cover = want
            changes += 1

    # 记忆媒体：按 (memory_id, sort) 对回原始 url
    orig_media = {(m.get("memory_id"), m.get("sort")): m.get("url") for m in load("memory_media")}
    for row in db.scalars(select(MemoryMedia)).all():
        want = orig_media.get((row.memory_id, row.sort))
        if want and want != row.url and exists(want):
            print(f"media  {row.memory_id}#{row.sort}: {row.url} → {want}")
            if apply:
                row.url = want
            changes += 1

    # 攻略封面 / 攻略分天图 / 攻略图集
    guide_origin = {g["id"]: g.get("cover") for g in load("travel_guides")}
    for g in db.scalars(select(TravelGuide)).all():
        want = guide_origin.get(g.id)
        if want and exists(want) and g.cover != want:
            print(f"guide  {g.id}: {g.cover} → {want}")
            if apply:
                g.cover = want
            changes += 1

    day_origin = {d["id"]: d.get("image_url") for d in load("guide_days")}
    for d in db.scalars(select(GuideDay)).all():
        want = day_origin.get(d.id)
        if want and exists(want) and d.image_url != want:
            print(f"gday   {d.id}: {d.image_url} → {want}")
            if apply:
                d.image_url = want
            changes += 1

    if apply:
        db.commit()
        print(f"共修正 {changes} 处。")
    else:
        print(f"共 {changes} 处待修正（预演，加 --yes 才写库）。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main("--yes" in sys.argv))
