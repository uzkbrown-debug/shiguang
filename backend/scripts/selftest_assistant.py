"""小拾 AI 自检：地点识别 + 去过判定 + 证据→攻略映射（不需要 pytest，不写库）

用法（在 backend 目录下）：
    python scripts/selftest_assistant.py

任何一项不符合就退出码 1，方便接进演示前的检查清单。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select  # noqa: E402

import routes_assistant as ra  # noqa: E402
from db import SessionLocal  # noqa: E402
from models import Location, User  # noqa: E402

FAILED: list[str] = []


def check(name: str, got, expect) -> None:
    ok = got == expect
    print(("  ok   " if ok else "  FAIL ") + f"{name}: {got!r}" + ("" if ok else f"（期望 {expect!r}）"))
    if not ok:
        FAILED.append(name)


def main() -> int:
    db = SessionLocal()
    try:
        me = db.get(User, "usr_c28e462a0e")
        if me is None:
            print("找不到演示账号 usr_c28e462a0e，跳过个人相关断言")
            return 0

        print("1) 地点识别")
        for question, expect in [
            ("我去过厦门吗", "厦门"),
            ("鼓浪屿怎么去", "鼓浪屿"),
            ("拉萨值得去吗", "拉萨"),
        ]:
            loc = ra._detect_place(question, db)
            check(question, loc.name if loc else None, expect)

        print("2) 去过没 / 谁去过")
        xiamen = db.scalars(select(Location).where(Location.name == "厦门")).first()
        lhasa = db.scalars(select(Location).where(Location.name == "拉萨")).first()
        gulangyu = db.scalars(select(Location).where(Location.name == "鼓浪屿")).first()

        xm = ra._place_check(db, me, xiamen)
        check("厦门 visited", xm["visited"], True)
        check("厦门 有别人去过", bool(xm["others"]), True)
        check("厦门 别人卡片可点开", all(o.get("guideId") or o.get("memoryId") for o in xm["others"]), True)

        ls = ra._place_check(db, me, lhasa)
        check("拉萨 visited", ls["visited"], False)
        check("拉萨 列出谁去过", bool(ls["others"]), True)

        gy = ra._place_check(db, me, gulangyu)
        check("鼓浪屿 visited", gy["visited"], True)
        check("鼓浪屿 计数按地点而不是整城", gy["visitCount"] <= gy["cityVisitCount"], True)

        print("3) 去过哪些地方")
        places = ra._my_places(db, me)
        check("足迹非空", bool(places), True)
        check("足迹按最近去过排序", places == sorted(places, key=lambda p: (p["last"] or "", p["count"]), reverse=True), True)

        print("4) 证据记忆 → 攻略")
        guide_map = ra._guide_map(db, ["mem_20180714_01", "mem_20180716_01"])
        check("厦门记忆指向同一篇攻略", len(set(guide_map.values())), 1)

        print()
        if FAILED:
            print(f"失败 {len(FAILED)} 项：" + "、".join(FAILED))
            return 1
        print("全部通过")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
