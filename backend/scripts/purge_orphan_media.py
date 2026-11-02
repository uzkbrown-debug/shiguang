"""删掉 uploads 里没有任何记忆引用的孤儿图片（删记忆时漏掉的、早期测试残留的）。"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from db import SessionLocal  # noqa: E402
from ingest import UPLOAD_DIR  # noqa: E402
from models import MemoryMedia  # noqa: E402


def main(apply: bool) -> int:
    db = SessionLocal()
    used = {
        r.url.split("/")[-1]
        for r in db.scalars(select(MemoryMedia))
        if r.url.startswith("/media/uploads/")
    }
    if not UPLOAD_DIR.exists():
        print("没有 uploads 目录")
        return 0

    orphans = [
        p
        for p in UPLOAD_DIR.iterdir()
        if p.is_file() and p.name not in used and not p.name.startswith("_frames_")
    ]
    total = sum(p.stat().st_size for p in orphans)
    print(f"引用中 {len(used)} 个 · 孤儿 {len(orphans)} 个 · 约 {total / 1024 / 1024:.1f} MB")
    if not apply:
        print("预演结束，加 --yes 才会真删。")
        return 0

    for p in orphans:
        p.unlink(missing_ok=True)
    print(f"已删除 {len(orphans)} 个孤儿文件。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main("--yes" in sys.argv))
