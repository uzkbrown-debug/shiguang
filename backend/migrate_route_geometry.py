"""建 route_geometry 表：路线沿真实道路的折线缓存

跑一次即可；重复跑会跳过。
"""

from __future__ import annotations

import sys

from sqlalchemy import inspect, text

from db import engine

DDL = """
CREATE TABLE IF NOT EXISTS route_geometry (
    route_id  VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
    mode      VARCHAR(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'driving',
    signature VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
    polyline  MEDIUMTEXT COLLATE utf8mb4_unicode_ci NULL,
    distance_m INT NULL,
    source    VARCHAR(16) COLLATE utf8mb4_unicode_ci NULL,
    updated_at DATETIME NULL,
    PRIMARY KEY (route_id, mode),
    CONSTRAINT fk_rg_route FOREIGN KEY (route_id)
        REFERENCES travel_routes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""


def main() -> None:
    with engine.begin() as conn:
        if "route_geometry" in inspect(conn).get_table_names():
            print("route_geometry 已存在，跳过")
            return
        conn.execute(text(DDL))
        print("+ route_geometry")


if __name__ == "__main__":
    sys.exit(main())
