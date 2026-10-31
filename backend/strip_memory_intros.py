"""把上次机械加上的「先说数：…」「我的走法：…」开头删掉

那两行是填空式生成的，跟正文重复，读起来很怪。
正文保留（本来就是攻略口吻的一段话），细节不丢。

    python strip_memory_intros.py
"""
from db import SessionLocal, init_db
from models import Memory

DROP_PREFIXES = ("先说数：", "我的走法", "在哪：", "路线：", "提醒：")


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        changed = 0
        for memory in db.query(Memory).all():
            raw = (memory.content or "").strip()
            if not raw:
                continue
            kept = [
                line
                for line in raw.split("\n")
                if line.strip() and not line.strip().startswith(DROP_PREFIXES)
            ]
            clean = "\n".join(kept).strip()
            if not clean:
                clean = (memory.summary or "").strip()
            if clean != raw:
                memory.content = clean
                changed += 1
        db.commit()
        print(f"[完成] {changed} 条记忆去掉了机械开头")
    finally:
        db.close()


if __name__ == "__main__":
    main()
