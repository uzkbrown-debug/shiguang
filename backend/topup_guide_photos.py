"""给演示攻略补图：某座城市在攻略里出现 N 天，就保证图集里有 N 张该城市的照片

    python topup_guide_photos.py

图片同样走 Wikimedia Commons → 360 图片 的降级链。
"""
import json
import re

from db import SessionLocal, init_db
from models import GuideMedia, TravelGuide
from seed_strangers import _save_image, commons_images, so_images

DAY_RE = re.compile(r"·\s*(.+)$")


def city_of(day_title: str) -> str:
    hit = DAY_RE.search(day_title or "")
    return hit.group(1).strip() if hit else ""


def caption_city(caption: str | None) -> str:
    return (caption or "").split("·")[0].strip()


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        guides = db.query(TravelGuide).all()
        added_total = 0
        for guide in guides:
            need: dict[str, int] = {}
            for day in guide.days_plan:
                city = city_of(day.title)
                if city:
                    need[city] = need.get(city, 0) + 1

            rows = db.query(GuideMedia).filter(GuideMedia.guide_id == guide.id).all()
            have: dict[str, int] = {}
            for row in rows:
                city = caption_city(row.caption)
                if city:
                    have[city] = have.get(city, 0) + 1

            missing = {c: n - have.get(c, 0) for c, n in need.items() if n > have.get(c, 0)}
            if not missing:
                continue

            print(f"→《{guide.title}》缺图：{missing}")
            sort_base = len(rows)
            for city, count in missing.items():
                datas = commons_images(f"{city} China scenery", count)
                if len(datas) < count:
                    datas += so_images(f"{city} 风景 景点", count - len(datas))
                for i, data in enumerate(datas[:count]):
                    db.add(
                        GuideMedia(
                            guide_id=guide.id,
                            url=_save_image(data),
                            caption=f"{city} · 随手拍",
                            sort=sort_base + added_total % 100 + i,
                        )
                    )
                    added_total += 1
            db.commit()
        print(f"[补图完成] 新增 {added_total} 张")
    finally:
        db.close()


if __name__ == "__main__":
    main()
