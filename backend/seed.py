"""把前端演示数据导入 MySQL（幂等，可重复执行）"""
import json
from pathlib import Path

from db import SessionLocal, init_db
from models import Location, Memory, MemoryMedia, MemoryPerson, Person

BASE_DIR = Path(__file__).resolve().parent
SEED_FILE = BASE_DIR / "seed_data.json"


def run() -> None:
    if not SEED_FILE.exists():
        raise SystemExit(
            f"缺少 {SEED_FILE.name}，请先运行： node _tools/export-memories.mjs"
        )

    data = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    memories = data.get("memories", [])
    persons = data.get("persons", [])
    locations = data.get("locations", [])
    all_images = data.get("allImages", [])

    init_db()

    with SessionLocal() as db:
        # 地点
        for loc in locations:
            row = db.get(Location, loc["id"]) or Location(id=loc["id"])
            row.name = loc.get("name")
            row.city = loc.get("city")
            row.region = loc.get("region")
            row.country = loc.get("country")
            row.latitude = loc.get("latitude")
            row.longitude = loc.get("longitude")
            row.precision = loc.get("precision", "city")
            db.add(row)

        # 人物
        for p in persons:
            row = db.get(Person, p["id"]) or Person(id=p["id"])
            row.name = p.get("name")
            row.relation_label = p.get("relationLabel")
            row.avatar = p.get("avatar")
            row.aliases = json.dumps(p.get("aliases", []), ensure_ascii=False)
            db.add(row)

        db.commit()

        # 记忆 + 人物关联 + 图片
        for idx, m in enumerate(memories):
            row = db.get(Memory, m["id"]) or Memory(id=m["id"])
            row.title = m.get("title", "")
            row.summary = m.get("summary")
            row.content = m.get("content")
            row.happened_at = m.get("happenedAt")
            row.time_precision = m.get("timePrecision", "day")
            row.location_id = m.get("locationId")
            row.tags = json.dumps(m.get("tags", []), ensure_ascii=False)
            row.emotion = m.get("emotion")
            row.importance = m.get("importance", 3)
            row.source_type = m.get("sourceType", "photo")
            row.cover = m.get("cover")
            row.media_count = m.get("mediaCount", 0)
            row.ai_status = m.get("aiStatus", "confirmed")
            row.confidence = m.get("confidence", 0.8)
            row.ai_generated = bool(m.get("aiGenerated"))
            db.add(row)

            # 人物关联
            for pid in m.get("personIds", []):
                exists = (
                    db.query(MemoryPerson)
                    .filter(MemoryPerson.memory_id == m["id"], MemoryPerson.person_id == pid)
                    .first()
                )
                if not exists:
                    db.add(MemoryPerson(memory_id=m["id"], person_id=pid))

            # 图片：封面 + 从图库里轮换补齐，保证图片展示页有内容
            if all_images and not db.query(MemoryMedia).filter(MemoryMedia.memory_id == m["id"]).count():
                cover = m.get("cover")
                urls = [cover] if cover else []
                start = idx % len(all_images)
                for k in range(5):
                    candidate = all_images[(start + k) % len(all_images)]
                    if candidate not in urls:
                        urls.append(candidate)
                for sort, url in enumerate(urls):
                    db.add(
                        MemoryMedia(
                            memory_id=m["id"],
                            url=url,
                            caption=f"{m.get('title', '')} · {sort + 1}",
                            sort=sort,
                        )
                    )

        db.commit()

    with SessionLocal() as db:
        print(
            "导入完成：",
            f"记忆 {db.query(Memory).count()} 条 /",
            f"人物 {db.query(Person).count()} 位 /",
            f"地点 {db.query(Location).count()} 个 /",
            f"图片 {db.query(MemoryMedia).count()} 张",
        )


if __name__ == "__main__":
    run()
