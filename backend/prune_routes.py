"""把已有路线按「一趟行程」的规则收拾一遍（可重复执行，先备份）

规则与写入时一致：
  - 同一地方（< 3 km）的重复站点删掉
  - 和上一站直线距离 > MAX_HOP_KM（1600 km）的，视为另一趟，不硬连（删掉该站）
不删路线本身，也不动攻略。

用法：cd backend && python prune_routes.py [--dry]
"""

import sys

from sqlalchemy import select
from sqlalchemy.orm import selectinload

import geo
from db import SessionLocal
from models import RouteGeometry, RoutePoint, TravelRoute

MAX_HOP_KM = 1600
DUP_KM = 3


def main() -> None:
    dry = "--dry" in sys.argv
    db = SessionLocal()
    removed_total = 0
    touched = 0
    try:
        routes = db.scalars(
            select(TravelRoute).options(selectinload(TravelRoute.points)).order_by(TravelRoute.created_at)
        ).all()
        for route in routes:
            pts = [p for p in route.points if p.latitude is not None and p.longitude is not None]
            if len(pts) < 2:
                continue
            keep: list[RoutePoint] = [pts[0]]
            drop: list[RoutePoint] = []
            for point in pts[1:]:
                here = (point.latitude, point.longitude)
                if any(geo.haversine(here, (k.latitude, k.longitude)) < DUP_KM * 1000 for k in keep):
                    drop.append(point)
                    continue
                last = keep[-1]
                if geo.haversine(here, (last.latitude, last.longitude)) > MAX_HOP_KM * 1000:
                    drop.append(point)
                    continue
                keep.append(point)
            if not drop:
                continue
            touched += 1
            removed_total += len(drop)
            print(
                f"[{'预演' if dry else '处理'}] {route.title}："
                f"{len(pts)} 站 → {len(keep)} 站，去掉 "
                + "、".join(p.name for p in drop)
            )
            if dry:
                continue
            for point in drop:
                db.delete(point)
            for i, point in enumerate(keep):
                point.sort = i
            db.execute(
                RouteGeometry.__table__.delete().where(RouteGeometry.route_id == route.id)
            )
        if not dry:
            db.commit()
        print(f"\n{'将' if dry else '已'}处理 {touched} 条路线，{'将' if dry else '共'}去掉 {removed_total} 个站点")
    finally:
        db.close()


if __name__ == "__main__":
    main()
