"""清掉某个账号下的全部记忆（连同媒体文件与各处引用）。

用法：
    python scripts/purge_user_memories.py --user usr_xxx          # 预演
    python scripts/purge_user_memories.py --user usr_xxx --yes    # 真删
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select, update  # noqa: E402

from db import SessionLocal  # noqa: E402
from ingest import UPLOAD_DIR  # noqa: E402
from models import (  # noqa: E402
    Memory,
    MemoryMedia,
    MemoryPerson,
    MemoryVisit,
    RoutePoint,
    StoryScene,
)


def main(argv: list[str]) -> int:
    if "--user" not in argv:
        print("需要 --user <user_id>")
        return 2
    user_id = argv[argv.index("--user") + 1]
    apply = "--yes" in argv

    db = SessionLocal()
    rows = db.scalars(
        select(Memory).where(Memory.user_id == user_id).order_by(Memory.created_at)
    ).all()
    if not rows:
        print("这个账号没有记忆。")
        return 0

    print(f"{user_id} 下有 {len(rows)} 条记忆：")
    for m in rows:
        print(f"  - {m.id}  {m.ai_status:10s}  {(m.happened_at or '')[:10]}  {m.title}")
    if not apply:
        print("\n预演结束，加 --yes 才会真删。")
        return 0

    ids = [m.id for m in rows]
    removed = 0
    for row in db.scalars(select(MemoryMedia).where(MemoryMedia.memory_id.in_(ids))):
        if row.url.startswith("/media/uploads/"):
            path = UPLOAD_DIR / row.url.split("/")[-1]
            if path.exists():
                path.unlink(missing_ok=True)
                removed += 1

    db.query(MemoryMedia).filter(MemoryMedia.memory_id.in_(ids)).delete(synchronize_session=False)
    db.query(MemoryPerson).filter(MemoryPerson.memory_id.in_(ids)).delete(synchronize_session=False)
    db.query(MemoryVisit).filter(MemoryVisit.memory_id.in_(ids)).delete(synchronize_session=False)

    # 路线站点保留、只解引用
    db.execute(update(RoutePoint).where(RoutePoint.memory_id.in_(ids)).values(memory_id=None))

    # 故事分镜里摘掉这些 id
    for scene in db.scalars(select(StoryScene)):
        raw = scene.memory_ids or ""
        if not any(mid in raw for mid in ids):
            continue
        try:
            kept = [str(i) for i in json.loads(raw) if str(i) not in ids]
        except Exception:  # noqa: BLE001
            continue
        scene.memory_ids = json.dumps(kept, ensure_ascii=False) if kept else None

    db.query(Memory).filter(Memory.id.in_(ids)).delete(synchronize_session=False)
    db.commit()
    print(f"已删除 {len(ids)} 条记忆、{removed} 个媒体文件。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
