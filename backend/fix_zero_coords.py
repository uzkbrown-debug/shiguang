"""把坐标为 0 或缺失的地点补上（新城市表补全后跑一次即可）"""
import city_coords
from db import SessionLocal, init_db
from models import Location, RoutePoint


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        rows = db.query(Location).all()
        fixed = 0
        for loc in rows:
            bad = loc.latitude in (None, 0) or loc.longitude in (None, 0)
            if not bad:
                continue
            coords = city_coords.lookup_coords(loc.city or loc.name or "")
            if not coords:
                print(f"[fix] 仍然查不到坐标：{loc.name}")
                continue
            loc.latitude, loc.longitude = coords
            # 路线上的同名点也一起修
            for point in db.query(RoutePoint).filter(RoutePoint.location_id == loc.id).all():
                point.latitude, point.longitude = coords
            fixed += 1
            print(f"[fix] {loc.name} → {coords}")
        db.commit()
        print(f"[fix] 共修正 {fixed} 个地点")
    finally:
        db.close()


if __name__ == "__main__":
    main()
