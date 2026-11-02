"""最后收尾：仍然指向已不存在文件的媒体行，改成 public/images 里的一张现成图。"""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from db import SessionLocal  # noqa: E402
from ingest import UPLOAD_DIR  # noqa: E402
from models import Memory, MemoryMedia  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = sorted(p.name for p in (ROOT.parent / "public" / "images").glob("*.webp"))


def mapped(url: str) -> str:
    digest = int(hashlib.md5(url.encode()).hexdigest(), 16)
    return f"/images/{PUBLIC[digest % len(PUBLIC)]}"


def main(apply: bool) -> int:
    db = SessionLocal()
    fixed = 0
    for row in db.scalars(select(MemoryMedia)).all():
        if not (row.url or "").startswith("/media/uploads/"):
            continue
        if (UPLOAD_DIR / row.url.split("/")[-1]).exists():
            continue
        new = mapped(row.url)
        print(f"{row.memory_id}#{row.sort}: {row.url} → {new}")
        if apply:
            row.url = new
        fixed += 1

    for mem in db.scalars(select(Memory)).all():
        if not (mem.cover or "").startswith("/media/uploads/"):
            continue
        if (UPLOAD_DIR / mem.cover.split("/")[-1]).exists():
            continue
        new = mapped(mem.cover)
        print(f"cover {mem.id}: {mem.cover} → {new}")
        if apply:
            mem.cover = new
        fixed += 1

    if apply:
        db.commit()
        print(f"修好 {fixed} 处。")
    else:
        print(f"{fixed} 处待修（预演）。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main("--yes" in sys.argv))
