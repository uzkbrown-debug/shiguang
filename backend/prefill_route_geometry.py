"""把现有路线的「沿路折线」提前算好存库

跑一次就够：前端第一次打开路线时直接拿缓存，不用等高德。
之后新增 / 改站点的路线，打开时也会自动补算并回写。
"""

from __future__ import annotations

import sys
import time

from sqlalchemy import select
from sqlalchemy.orm import selectinload

import geo
from db import SessionLocal
from models import TravelRoute


def main() -> None:
    db = SessionLocal()
    ok = fail = skip = 0
    try:
        routes = db.scalars(
            select(TravelRoute).options(selectinload(TravelRoute.points)).order_by(TravelRoute.id)
        ).all()
        for r in routes:
            stops = [
                (p.latitude, p.longitude)
                for p in r.points
                if p.latitude is not None and p.longitude is not None
            ]
            if len(stops) < 2:
                skip += 1
                print(f"·   {r.title}  只有一个站，不用画线")
                continue
            signature = geo.signature_of(stops)
            if geo.load_cached(db, r.id, "driving", signature):
                skip += 1
                print(f"·   {r.title}  已有缓存")
                continue
            points, distance, source = geo.build_geometry(stops)
            if points:
                geo.save_cached(db, r.id, "driving", signature, points, distance, source)
                ok += 1
                print(f"OK  {r.title}  {len(points)} 点  {distance / 1000:.1f} km  {source}")
            else:
                fail += 1
                print(f"--  {r.title}  没有道路数据（境外 / 超出高德范围），前端退平滑曲线")
            time.sleep(0.3)
    finally:
        db.close()
    print(f"\n完成：{ok} 条已缓存，{skip} 条跳过，{fail} 条无道路数据")


if __name__ == "__main__":
    sys.exit(main())
