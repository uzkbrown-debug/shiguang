"""统一记忆页的写法，对齐攻略模板（但要读着顺）

模板（沪苏杭 / 厦门那两篇）：
    先说数：几天几晚、几个人、多少钱
    正文：一段带数字的话（什么时候去、门票多少、几点人少、吃了什么花了多少）
    → 消费明细 / 交通 / 住宿 / 提醒

记忆是「一个点」，对应攻略里的「分天那一段」，所以：
    - 开头一行「先说数」= 日期 · 地点 · 花销合计（**不写张数**，那是噪音）
    - 然后就是正文；不再硬塞「我的走法」（攻略里那句是整趟行程级的，单点写它会和正文重复）

    python polish_memory_intros.py
"""
import json

from db import SessionLocal, init_db
from models import Location, Memory

DROP = ("先说数", "我的走法", "在哪", "路线：", "提醒：")


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        done = 0
        for memory in db.query(Memory).all():
            raw = (memory.content or memory.summary or "").strip()
            body = "\n".join(
                line for line in raw.split("\n") if line.strip() and not line.strip().startswith(DROP)
            ).strip()
            if not body:
                continue

            loc = db.get(Location, memory.location_id) if memory.location_id else None
            where = (loc.name if loc else "") or ""
            city = (loc.city if loc else "") or ""
            if where and city and where != city:
                place = f"{city} · {where}"
            else:
                place = where or city or "未知地点"

            try:
                costs = json.loads(memory.cost_json or "[]")
            except Exception:
                costs = []
            total = sum(c.get("amount") or 0 for c in costs if isinstance(c, dict))

            date = (memory.happened_at or "")[:10]
            head = f"{date}，{place}" if date else place
            if total:
                head += f"，花销 ¥{int(total)}"

            memory.content = f"先说数：{head}。\n{body}"
            done += 1
        db.commit()
        print(f"[完成] {done} 条记忆统一成「先说数 + 正文」")
    finally:
        db.close()


if __name__ == "__main__":
    main()
