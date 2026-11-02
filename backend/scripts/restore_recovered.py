"""把 legacy_recovered/ 里捞回来的记忆写回数据库。

原则：
- 只「新增」，已存在的 id 一律跳过，不覆盖现在库里的任何行
- 图片文件不在的就只恢复记忆本身（cover 保留原值，前端会显示占位）
- 默认预演，加 --yes 才写库
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from db import SessionLocal  # noqa: E402
from ingest import UPLOAD_DIR  # noqa: E402
from models import Memory, MemoryMedia  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RECOVERED = ROOT / "legacy_recovered"
USER_ID = "usr_7a0dfb887c"

MODEL_FIELDS = {c.name for c in Memory.__table__.columns}


def main(argv: list[str]) -> int:
    apply = "--yes" in argv
    memories = json.loads((RECOVERED / "memories.json").read_text(encoding="utf-8"))
    media = json.loads((RECOVERED / "memory_media.json").read_text(encoding="utf-8"))

    mine = [
        m
        for m in memories
        if m.get("user_id") == USER_ID and (m.get("summary") or "").strip()
    ]
    if not mine:
        print("没有可恢复的记忆。")
        return 0

    db = SessionLocal()
    existing = {m.id for m in db.scalars(select(Memory).where(Memory.id.in_([m["id"] for m in mine])))}
    todo = [m for m in mine if m["id"] not in existing]

    media_by_memory: dict[str, list[dict]] = {}
    for row in media:
        media_by_memory.setdefault(row.get("memory_id", ""), []).append(row)

    print(f"可恢复 {len(mine)} 条，其中 {len(todo)} 条库里没有（其余已存在会跳过）：")
    for m in todo:
        files = media_by_memory.get(m["id"], [])
        have = [
            f["url"]
            for f in files
            if (UPLOAD_DIR / f["url"].split("/")[-1]).exists()
        ]
        print(f"  {m['id']}  {m.get('happened_at')}  {m.get('title')}")
        print(f"      正文 {len(m.get('summary') or '')} 字 · 媒体记录 {len(files)} 个 · 文件在 {len(have)} 个")

    if not apply:
        print("\n预演结束，加 --yes 才会写库。")
        return 0

    for m in todo:
        payload = {k: v for k, v in m.items() if k in MODEL_FIELDS}
        payload.pop("id", None)
        db.add(Memory(id=m["id"], **payload))
        for f in media_by_memory.get(m["id"], []):
            url = f.get("url") or ""
            if not url.startswith("/media/uploads/"):
                continue
            if not (UPLOAD_DIR / url.split("/")[-1]).exists():
                continue
            db.add(
                MemoryMedia(
                    memory_id=m["id"],
                    url=url,
                    caption=f.get("caption"),
                    sort=f.get("sort") or 0,
                    captured_at=f.get("captured_at"),
                )
            )
    db.commit()
    print(f"已恢复 {len(todo)} 条记忆。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
