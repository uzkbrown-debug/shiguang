"""给数据库里缺坐标的地点补上经纬度，让地图页能定位。"""
from sqlalchemy import select

import city_coords
from db import SessionLocal
from models import Location


def main() -> None:
    db = SessionLocal()
    try:
        rows = db.scalars(select(Location)).all()
        fixed, skipped = [], []
        for loc in rows:
            if loc.latitude is not None and loc.longitude is not None:
                continue
            hit = city_coords.lookup_coords(loc.name) or city_coords.lookup_coords(loc.city or "")
            if hit:
                loc.latitude, loc.longitude = hit
                fixed.append(f"{loc.name} -> {hit[0]},{hit[1]}")
            else:
                skipped.append(loc.name)
        db.commit()
        print(f"总数 {len(rows)}，补全 {len(fixed)}，仍缺 {len(skipped)}")
        for line in fixed:
            print("  +", line)
        for name in skipped:
            print("  -", name, "(没查到坐标，可在上传页新建时手工填)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
