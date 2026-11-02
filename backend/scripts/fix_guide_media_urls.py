"""攻略详情页「图集」用的是 guide_media，之前被映射成了 public/images 里的示例图。

文件补回来之后，把 guide_media.url 换回原始地址（按 guide_id + sort 对回）。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from db import SessionLocal  # noqa: E402
from ingest import UPLOAD_DIR  # noqa: E402
from models import GuideMedia  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RECOVERED = ROOT / "legacy_recovered"


def exists(url: str | None) -> bool:
    if not url:
        return False
    if not url.startswith("/media/uploads/"):
        return True
    return (UPLOAD_DIR / url.split("/")[-1]).exists()


def main(apply: bool) -> int:
    origin = {
        (g.get("guide_id"), g.get("sort")): g.get("url")
        for g in json.loads((RECOVERED / "guide_media.json").read_text(encoding="utf-8"))
    }
    db = SessionLocal()
    fixed = 0
    for row in db.scalars(select(GuideMedia)).all():
        want = origin.get((row.guide_id, row.sort))
        if not want or want == row.url or not exists(want):
            continue
        print(f"{row.guide_id}#{row.sort}: {row.url} → {want}")
        if apply:
            row.url = want
        fixed += 1

    if apply:
        db.commit()
        print(f"修好 {fixed} 张攻略图。")
    else:
        print(f"{fixed} 张待修（预演，加 --yes 才写库）。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main("--yes" in sys.argv))
