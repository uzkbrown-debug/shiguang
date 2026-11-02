"""给 media_comments 补 owner_id：弹幕要跟「内容的主人」绑定。

同一张图（同一个上传文件、url 相同）可能被好几个用户各自用过，
只按 url 聚合会把别人的弹幕串过来，所以聚合时必须再限定同一个人。

跑一次即可，重复跑会跳过已存在的列。
"""

from __future__ import annotations

import sys

from sqlalchemy import inspect, select, text

from db import SessionLocal, engine
from models import MediaComment, Memory, TravelGuide, TravelRoute


def owner_of(db, target_type: str, target_id: str) -> str | None:
    if target_type == "memory":
        row = db.get(Memory, target_id)
    elif target_type == "guide":
        row = db.get(TravelGuide, target_id)
    elif target_type == "route":
        row = db.get(TravelRoute, target_id)
    else:
        row = None
    return row.user_id if row else None


def main() -> None:
    with engine.begin() as conn:
        cols = {c["name"] for c in inspect(conn).get_columns("media_comments")}
        if "owner_id" not in cols:
            conn.execute(text("ALTER TABLE media_comments ADD COLUMN owner_id VARCHAR(64) NULL"))
            conn.execute(text("CREATE INDEX ix_mc_owner ON media_comments (owner_id)"))
            print("+ owner_id / ix_mc_owner")

    db = SessionLocal()
    filled = 0
    missing = 0
    try:
        rows = db.scalars(select(MediaComment)).all()
        for r in rows:
            if r.owner_id:
                continue
            owner = owner_of(db, r.target_type or "memory", r.target_id or r.memory_id or "")
            if owner:
                r.owner_id = owner
                filled += 1
            else:
                missing += 1
        db.commit()
    finally:
        db.close()
    print(f"回填 {filled} 条；找不到归属 {missing} 条（来源内容可能已删除）")


if __name__ == "__main__":
    sys.exit(main())
