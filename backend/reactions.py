"""攻略的点赞 / 投币

规则照哔哩哔哩那套简化：
- 点赞是开关，一个人对一篇只有一次；
- 投币一篇最多 2 枚，币从自己余额里扣，扣掉的币跑到作者的攻略上；
- 每人每天自动补 5 枚（上限 100），打开页面时顺手结算，不用定时任务；
- 计数是**全站一起算**的：谁点赞、谁投币，所有人看到的是同一个数。
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from models import GuideReaction, TravelGuide, User

DAILY_COINS = 5
COIN_CAP = 100
MAX_COINS_PER_GUIDE = 2


def ensure_daily_coins(db: Session, user: User) -> int:
    """跨天了就给用户补币，返回当前余额"""
    today = date.today().isoformat()
    if (user.coin_day or "") != today:
        granted = DAILY_COINS if user.coin_day else 0  # 头一次不给，注册时已经有初始币
        user.coin_day = today
        if granted:
            user.coin_balance = min(COIN_CAP, (user.coin_balance or 0) + granted)
        db.commit()
    return user.coin_balance or 0


def stats_for(
    db: Session, guide_ids: list[str], viewer_id: str | None
) -> dict[str, dict]:
    """一次性把一批攻略的赞 / 币统计算出来"""
    if not guide_ids:
        return {}
    out: dict[str, dict] = {
        gid: {"likes": 0, "coins": 0, "my_liked": False, "my_coins": 0} for gid in guide_ids
    }
    rows = db.execute(
        select(
            GuideReaction.guide_id,
            func.sum(GuideReaction.liked),
            func.sum(GuideReaction.coins),
        )
        .where(GuideReaction.guide_id.in_(guide_ids))
        .group_by(GuideReaction.guide_id)
    ).all()
    for gid, likes, coins in rows:
        if gid in out:
            out[gid]["likes"] = int(likes or 0)
            out[gid]["coins"] = int(coins or 0)

    if viewer_id:
        mine = db.scalars(
            select(GuideReaction).where(
                GuideReaction.guide_id.in_(guide_ids), GuideReaction.user_id == viewer_id
            )
        ).all()
        for row in mine:
            if row.guide_id in out:
                out[row.guide_id]["my_liked"] = bool(row.liked)
                out[row.guide_id]["my_coins"] = int(row.coins or 0)
    return out


def attach_stats(db: Session, items: list[dict], viewer_id: str | None) -> list[dict]:
    """给一串攻略 payload 挂上 likes / coins / my_liked / my_coins"""
    stats = stats_for(db, [it["id"] for it in items], viewer_id)
    for it in items:
        it.update(stats.get(it["id"], {"likes": 0, "coins": 0, "my_liked": False, "my_coins": 0}))
    return items


def _row(db: Session, guide_id: str, user_id: str) -> GuideReaction | None:
    return db.scalar(
        select(GuideReaction).where(
            GuideReaction.guide_id == guide_id, GuideReaction.user_id == user_id
        )
    )


def _result(db: Session, guide_id: str, viewer: User) -> dict:
    stat = stats_for(db, [guide_id], viewer.id).get(guide_id, {})
    return {
        "guide_id": guide_id,
        "likes": stat.get("likes", 0),
        "coins": stat.get("coins", 0),
        "my_liked": stat.get("my_liked", False),
        "my_coins": stat.get("my_coins", 0),
        "coin_balance": viewer.coin_balance or 0,
    }


def toggle_like(db: Session, guide: TravelGuide, user: User) -> dict:
    row = _row(db, guide.id, user.id)
    if row is None:
        row = GuideReaction(
            id="gr_" + uuid.uuid4().hex[:12], guide_id=guide.id, user_id=user.id, liked=1, coins=0
        )
        db.add(row)
    else:
        row.liked = 0 if row.liked else 1
    db.commit()
    return _result(db, guide.id, user)


def give_coins(db: Session, guide: TravelGuide, user: User, amount: int = 1) -> dict:
    """投币：这一次投 amount 枚，但一篇攻略一个人总共最多 2 枚"""
    amount = max(1, min(MAX_COINS_PER_GUIDE, int(amount or 1)))
    ensure_daily_coins(db, user)
    row = _row(db, guide.id, user.id)
    gave = int(row.coins or 0) if row else 0
    room = MAX_COINS_PER_GUIDE - gave
    if room <= 0:
        raise ValueError(f"这篇最多投 {MAX_COINS_PER_GUIDE} 枚，你已经投满了")
    amount = min(amount, room)
    if (user.coin_balance or 0) < amount:
        raise ValueError("硬币不够了，明天再来（每天补 5 枚）")

    if row is None:
        row = GuideReaction(
            id="gr_" + uuid.uuid4().hex[:12], guide_id=guide.id, user_id=user.id, liked=0, coins=0
        )
        db.add(row)
    row.coins = gave + amount
    user.coin_balance = (user.coin_balance or 0) - amount
    db.commit()
    return _result(db, guide.id, user)
