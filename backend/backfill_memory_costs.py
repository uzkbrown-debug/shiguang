"""给还没有消费明细的记忆，从正文里把「XX 元/泰铢/日元」抽成消费表

    python backfill_memory_costs.py
"""
import json
import re

from db import SessionLocal, init_db
from models import Memory

# 「跷脚牛肉人均 40 元」「门票 80 元」「竹筏 168 元/人」这类
PATTERNS = [
    re.compile(r"([\u4e00-\u9fa5A-Za-z0-9·]{2,12}?)\s*(?:人均\s*)?(\d+(?:\.\d+)?)\s*(?:元|块)(?:/人)?"),
    re.compile(r"([\u4e00-\u9fa5A-Za-z0-9·]{2,12}?)\s*(\d+(?:\.\d+)?)\s*(?:日元|韩元|泰铢|欧|美元)"),
]
STOP_WORDS = {"大概", "约", "一共", "总共", "花了", "是", "了", "这", "那", "和", "跟", "再"}


def extract(text: str) -> list[dict]:
    seen: set[str] = set()
    items: list[dict] = []
    for body_line in text.split("\n"):
        for pattern in PATTERNS:
            for label, amount in pattern.findall(body_line):
                label = label.strip("，。、；：（）() ")
                if not label or label in STOP_WORDS or len(label) > 12:
                    continue
                key = f"{label}{amount}"
                if key in seen:
                    continue
                seen.add(key)
                items.append({"label": label, "amount": float(amount), "note": None})
        if len(items) >= 5:
            break
    return items[:5]


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        filled = 0
        for memory in db.query(Memory).all():
            existing = json.loads(memory.cost_json or "[]")
            if existing:
                continue
            items = extract(memory.content or memory.summary or "")
            if not items:
                continue
            memory.cost_json = json.dumps(items, ensure_ascii=False)
            filled += 1
        db.commit()
        print(f"[完成] 给 {filled} 条记忆补了消费明细（从正文里的价格抽出）")
    finally:
        db.close()


if __name__ == "__main__":
    main()
