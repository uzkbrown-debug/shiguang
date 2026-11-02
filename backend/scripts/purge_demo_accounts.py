"""清理早期演示/测试账号及其全部数据。

这些账号是 2026-10-16 建库时造的假人（每人 3 条记忆），它们让世界地图上
出现一堆陌生人，也让「好友」里混进不属于真实用户的人。

用法：
    python scripts/purge_demo_accounts.py            # 只打印将要删除的内容
    python scripts/purge_demo_accounts.py --yes      # 真的删
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from db import SessionLocal  # noqa: E402
from ingest import UPLOAD_DIR  # noqa: E402
from models import (  # noqa: E402
    Friendship,
    FriendRequest,
    GuideDay,
    GuideMedia,
    Memory,
    MemoryMedia,
    MemoryPerson,
    MemoryVisit,
    RoutePoint,
    Story,
    StoryScene,
    TravelGuide,
    TravelRoute,
    User,
    UserSession,
)

DEMO_USERNAMES = {
    "xiaomei",
    "ayuan",
    "wander_lin",
    "chen_ontheroad",
    "mika_travels",
    "laohei",
    "xiaoyu_sea",
    "old_camera",
    "yuki_jp",
    "sky_gao",
    "tina_food",
    "peng_peng",
    "zhou_mountain",
    "anna_world",
}


def main(apply: bool) -> int:
    db = SessionLocal()
    users = db.scalars(select(User).where(User.username.in_(DEMO_USERNAMES))).all()
    if not users:
        print("没有匹配到演示账号，什么都没做。")
        return 0

    ids = [u.id for u in users]
    print(f"匹配到 {len(ids)} 个演示账号：")
    for u in users:
        print(f"  - {u.username:16s} {u.nickname or '':10s} {u.id}")

    mems = db.scalars(select(Memory).where(Memory.user_id.in_(ids))).all()
    guides = db.scalars(select(TravelGuide).where(TravelGuide.user_id.in_(ids))).all()
    routes = db.scalars(select(TravelRoute).where(TravelRoute.user_id.in_(ids))).all()
    stories = db.scalars(select(Story).where(Story.user_id.in_(ids))).all()
    print(f"将删除：记忆 {len(mems)} · 攻略 {len(guides)} · 路线 {len(routes)} · 故事 {len(stories)}")

    if not apply:
        print("\n这是预演。加 --yes 才会真的删。")
        return 0

    mem_ids = [m.id for m in mems]
    guide_ids = [g.id for g in guides]
    route_ids = [r.id for r in routes]
    story_ids = [s.id for s in stories]

    removed_files = 0
    if mem_ids:
        for row in db.scalars(select(MemoryMedia).where(MemoryMedia.memory_id.in_(mem_ids))):
            if row.url.startswith("/media/uploads/"):
                path = UPLOAD_DIR / row.url.split("/")[-1]
                if path.exists():
                    path.unlink(missing_ok=True)
                    removed_files += 1
        db.query(MemoryMedia).filter(MemoryMedia.memory_id.in_(mem_ids)).delete(synchronize_session=False)
        db.query(MemoryPerson).filter(MemoryPerson.memory_id.in_(mem_ids)).delete(synchronize_session=False)
        db.query(MemoryVisit).filter(MemoryVisit.memory_id.in_(mem_ids)).delete(synchronize_session=False)
        db.query(Memory).filter(Memory.id.in_(mem_ids)).delete(synchronize_session=False)

    if guide_ids:
        db.query(GuideMedia).filter(GuideMedia.guide_id.in_(guide_ids)).delete(synchronize_session=False)
        db.query(GuideDay).filter(GuideDay.guide_id.in_(guide_ids)).delete(synchronize_session=False)
        db.query(TravelGuide).filter(TravelGuide.id.in_(guide_ids)).delete(synchronize_session=False)

    if route_ids:
        db.query(RoutePoint).filter(RoutePoint.route_id.in_(route_ids)).delete(synchronize_session=False)
        db.query(TravelRoute).filter(TravelRoute.id.in_(route_ids)).delete(synchronize_session=False)

    if story_ids:
        db.query(StoryScene).filter(StoryScene.story_id.in_(story_ids)).delete(synchronize_session=False)
        db.query(Story).filter(Story.id.in_(story_ids)).delete(synchronize_session=False)

    db.query(MemoryVisit).filter(MemoryVisit.user_id.in_(ids)).delete(synchronize_session=False)
    db.query(Friendship).filter(
        Friendship.user_id.in_(ids) | Friendship.friend_user_id.in_(ids)
    ).delete(synchronize_session=False)
    db.query(FriendRequest).filter(
        FriendRequest.from_user_id.in_(ids) | FriendRequest.to_user_id.in_(ids)
    ).delete(synchronize_session=False)
    db.query(UserSession).filter(UserSession.user_id.in_(ids)).delete(synchronize_session=False)
    db.query(User).filter(User.id.in_(ids)).delete(synchronize_session=False)
    db.commit()

    print(f"已删除 {len(ids)} 个演示账号、{len(mem_ids)} 条记忆、{removed_files} 个媒体文件。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main("--yes" in sys.argv))
