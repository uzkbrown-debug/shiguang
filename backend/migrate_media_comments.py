"""把 media_comments 扩成通用的「照片留言」：记忆 / 攻略 / 路线 都能挂弹幕。

跑一次就行，重复跑会跳过已存在的列。
"""

from __future__ import annotations

import sys

from sqlalchemy import inspect, text

from db import engine


def col_names(conn) -> set[str]:
    return {c["name"] for c in inspect(conn).get_columns("media_comments")}


def main() -> None:
    with engine.begin() as conn:
        cols = col_names(conn)

        if "target_type" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE media_comments ADD COLUMN target_type VARCHAR(16) "
                    "NOT NULL DEFAULT 'memory'"
                )
            )
            print("+ target_type")
        if "target_id" not in cols:
            conn.execute(text("ALTER TABLE media_comments ADD COLUMN target_id VARCHAR(64) NULL"))
            print("+ target_id")
        if "ix_mc_target" not in {i["name"] for i in inspect(conn).get_indexes("media_comments")}:
            conn.execute(text("CREATE INDEX ix_mc_target ON media_comments (target_type, target_id)"))
            print("+ ix_mc_target")

        # memory_id 得能空着：攻略/路线的留言不属于任何记忆
        nullable = {c["name"]: c["nullable"] for c in inspect(conn).get_columns("media_comments")}
        if not nullable.get("memory_id", True):
            conn.execute(text("ALTER TABLE media_comments MODIFY memory_id VARCHAR(64) NULL"))
            print("~ memory_id 允许 NULL")

        # 老数据：全是记忆留言
        n = conn.execute(
            text(
                "UPDATE media_comments SET target_type='memory', target_id=memory_id "
                "WHERE target_id IS NULL"
            )
        ).rowcount
        if n:
            print(f"~ 回填 {n} 条老留言 → memory")

    with engine.connect() as conn:
        print("after:", [c["name"] for c in inspect(conn).get_columns("media_comments")])


if __name__ == "__main__":
    sys.exit(main())
