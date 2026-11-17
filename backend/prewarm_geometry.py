"""给所有路线预热地图折线缓存（route_geometry）

为什么需要：地图上的线来自 /api/routes/{id}/geometry。没缓存时每次都要问高德，
第一次打开会慢，高德抽风时还会画不出线。这里把每条线先算好存下来，
之后打开就是毫秒级，演示时不会卡。

用法：cd backend && python prewarm_geometry.py [--force]
"""

import sys
import time

from sqlalchemy import select
from sqlalchemy.orm import selectinload

import geo
from db import SessionLocal
from models import RouteGeometry, TravelRoute


def main() -> None:
    force = "--force" in sys.argv
    db = SessionLocal()
    done = skipped = failed = 0
    try:
        routes = db.scalars(
            select(TravelRoute).options(selectinload(TravelRoute.points)).order_by(TravelRoute.created_at)
        ).all()
        print(f"路线共 {len(routes)} 条")
        for route in routes:
            stops = [
                (p.latitude, p.longitude)
                for p in route.points
                if p.latitude is not None and p.longitude is not None
            ]
            if len(stops) < 2:
                skipped += 1
                continue
            signature = geo.signature_of(stops)
            if not force and geo.load_cached(db, route.id, "driving", signature):
                skipped += 1
                continue
            try:
                points, distance, source = geo.build_geometry(stops, "driving")
            except Exception as exc:  # noqa: BLE001
                print(f"  [失败] {route.title}: {exc}")
                failed += 1
                continue
            if not points:
                print(f"  [没算出来] {route.title}（{len(stops)} 站）")
                failed += 1
                continue
            geo.save_cached(db, route.id, "driving", signature, points, distance, source)
            db.commit()
            done += 1
            print(
                f"  [缓存] {route.title}　{len(stops)} 站　{len(points)} 点　"
                f"{round(distance / 1000)} km　{source}"
            )
            time.sleep(0.35)  # 别把高德问急
        total = db.query(RouteGeometry).count()
        print(f"\n新算 {done} 条，跳过 {skipped} 条，失败 {failed} 条；缓存表共 {total} 条")
    finally:
        db.close()


if __name__ == "__main__":
    main()
