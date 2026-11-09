"""给 users 补 weather_city：首页天气卡的城市可以自己选

空着就按「常驻城市」显示，选了之后跟着账号走，换设备也还在。
跑一次即可；重复跑会跳过。
"""

from __future__ import annotations

import sys

from sqlalchemy import inspect, text

from db import engine


def main() -> None:
    with engine.begin() as conn:
        cols = {c["name"] for c in inspect(conn).get_columns("users")}
        if "weather_city" in cols:
            print("users.weather_city 已存在，跳过")
            return
        conn.execute(text("ALTER TABLE users ADD COLUMN weather_city VARCHAR(32) NULL"))
        print("+ users.weather_city")


if __name__ == "__main__":
    sys.exit(main())
