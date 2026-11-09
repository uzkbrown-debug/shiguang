"""攻略的点赞 / 投币：建表 + 给 users 补硬币余额

- guide_reactions：一个账号对一篇攻略只有一行，记着「赞没赞」「一共投了几枚」
- users.coin_balance / coin_day：自己的硬币余额，以及上次领每日硬币是哪天

跑一次即可，重复跑会跳过。
"""

from __future__ import annotations

import sys

from sqlalchemy import inspect, text

from db import engine

DDL = """
CREATE TABLE IF NOT EXISTS guide_reactions (
    id         VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
    guide_id   VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
    user_id    VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
    liked      INT NOT NULL DEFAULT 0,
    coins      INT NOT NULL DEFAULT 0,
    created_at DATETIME NULL,
    updated_at DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_guide_reaction (guide_id, user_id),
    KEY ix_gr_guide (guide_id),
    KEY ix_gr_user (user_id),
    CONSTRAINT fk_gr_guide FOREIGN KEY (guide_id)
        REFERENCES travel_guides (id) ON DELETE CASCADE,
    CONSTRAINT fk_gr_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""


def main() -> None:
    with engine.begin() as conn:
        tables = inspect(conn).get_table_names()
        if "guide_reactions" in tables:
            print("guide_reactions 已存在，跳过")
        else:
            conn.execute(text(DDL))
            print("+ guide_reactions")

        cols = {c["name"] for c in inspect(conn).get_columns("users")}
        if "coin_balance" not in cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN coin_balance INT NOT NULL DEFAULT 0"))
            print("+ users.coin_balance")
        if "coin_day" not in cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN coin_day VARCHAR(10) NULL"))
            print("+ users.coin_day")

        # 老账号先给点积蓄，不然第一次投币就是 0
        filled = conn.execute(
            text("UPDATE users SET coin_balance = 20 WHERE coin_balance = 0 AND coin_day IS NULL")
        ).rowcount
        if filled:
            print(f"给 {filled} 个账号发了 20 枚初始硬币")


if __name__ == "__main__":
    sys.exit(main())
