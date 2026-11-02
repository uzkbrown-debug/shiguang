"""把恢复回来的记忆的封面修好：封面文件不在的，改用这条记忆里第一张还在的图。"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from db import SessionLocal  # noqa: E402
from ingest import UPLOAD_DIR  # noqa: E402
from models import Memory, MemoryMedia  # noqa: E402


def exists(url: str | None) -> bool:
    if not url or not url.startswith("/media/uploads/"):
        return bool(url)
    return (UPLOAD_DIR / url.split("/")[-1]).exists()


def main(apply: bool) -> int:
    db = SessionLocal()
    fixed = 0
    for memory in db.scalars(select(Memory)).all():
        if exists(memory.cover):
            continue
        media = db.scalars(
            select(MemoryMedia).where(MemoryMedia.memory_id == memory.id).order_by(MemoryMedia.sort)
        ).all()
        pick = next((m.url for m in media if exists(m.url)), None)
        print(f"{memory.id}  封面 {memory.cover} 不在 → {pick or '（无可用图）'}")
        if apply:
            memory.cover = pick
            fixed += 1
    if apply:
        db.commit()
        print(f"修好 {fixed} 条。")
    else:
        print("预演结束，加 --yes 才会写库。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main("--yes" in sys.argv))
