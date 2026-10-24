"""账号、好友、用户资料接口"""
import hmac
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from auth import (
    COOKIE_NAME,
    SESSION_DAYS,
    add_friendship,
    can_view,
    create_session,
    current_user,
    friend_ids,
    hash_password,
    make_user_id,
    new_salt,
    optional_user,
    verify_password,
)
from db import get_db
from models import (
    Friendship,
    FriendRequest,
    Location,
    Memory,
    TravelGuide,
    TravelRoute,
    User,
    UserSession,
)

router = APIRouter(prefix="/api", tags=["social"])


# ---------- 序列化 ----------

def stats_of(db: Session, user_id: str) -> dict:
    """只统计 TA 愿意给别人看的内容：自己的算全部自己的"""
    memory_count = db.scalar(
        select(func.count()).select_from(Memory).where(Memory.user_id == user_id)
    ) or 0
    route_count = db.scalar(
        select(func.count()).select_from(TravelRoute).where(TravelRoute.user_id == user_id)
    ) or 0
    guide_count = db.scalar(
        select(func.count()).select_from(TravelGuide).where(TravelGuide.user_id == user_id)
    ) or 0
    cities = db.scalars(
        select(Location.city)
        .join(Memory, Memory.location_id == Location.id)
        .where(Memory.user_id == user_id, Location.city.isnot(None))
        .distinct()
    ).all()
    return {
        "memory_count": memory_count,
        "route_count": route_count,
        "guide_count": guide_count,
        "city_count": len(cities),
        "cities": [c for c in cities if c][:8],
    }


def user_brief(db: Session, u: User, viewer: User | None = None) -> dict:
    data = {
        "id": u.id,
        "username": u.username,
        "nickname": u.nickname,
        "avatar": u.avatar,
        "bio": u.bio,
        "home_city": u.home_city,
        "is_me": bool(viewer and viewer.id == u.id),
    }
    if viewer and viewer.id != u.id:
        data["is_friend"] = u.id in friend_ids(db, viewer.id)
        pending = db.scalar(
            select(FriendRequest).where(
                FriendRequest.status == "pending",
                or_(
                    (FriendRequest.from_user_id == viewer.id) & (FriendRequest.to_user_id == u.id),
                    (FriendRequest.from_user_id == u.id) & (FriendRequest.to_user_id == viewer.id),
                ),
            )
        )
        data["pending"] = pending.status if pending else None
        data["request_from_me"] = bool(pending and pending.from_user_id == viewer.id)
    return data


def default_avatar(db: Session, user_id: str) -> str | None:
    row = db.scalar(
        select(Memory.cover)
        .where(Memory.user_id == user_id, Memory.cover.isnot(None))
        .order_by(Memory.happened_at.desc())
    )
    return row


# ---------- 登录注册 ----------

class RegisterBody(BaseModel):
    username: str
    password: str
    nickname: str | None = None
    home_city: str | None = None
    # 密保问题（找回密码用），二选一填也行
    security_question: str | None = None
    security_answer: str | None = None


class LoginBody(BaseModel):
    username: str
    password: str
    remember: bool = True


class ForgotBody(BaseModel):
    username: str


class ResetBody(BaseModel):
    username: str
    answer: str
    new_password: str


class SecurityBody(BaseModel):
    security_question: str
    security_answer: str


class ChangePasswordBody(BaseModel):
    old_password: str
    new_password: str


def _set_cookie(response: Response, token: str, days: int) -> None:
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=days * 24 * 3600,
        httponly=False,
        samesite="lax",
        path="/",
    )


@router.post("/auth/register")
def register(body: RegisterBody, response: Response, db: Session = Depends(get_db)):
    username = body.username.strip()
    if len(username) < 3:
        raise HTTPException(400, "用户名至少 3 个字符")
    if len(body.password) < 6:
        raise HTTPException(400, "密码至少 6 位")
    if db.scalar(select(User).where(User.username == username)):
        raise HTTPException(409, "这个用户名已经有人用了")

    salt = new_salt()
    answer_salt = new_salt() if body.security_answer else None
    user = User(
        id=make_user_id(),
        username=username,
        nickname=(body.nickname or username).strip()[:24],
        password_hash=hash_password(body.password, salt),
        salt=salt,
        home_city=(body.home_city or None),
        security_question=(body.security_question or "").strip()[:32] or None,
        answer_hash=hash_password(body.security_answer.strip(), answer_salt) if answer_salt else None,
        answer_salt=answer_salt,
    )
    db.add(user)
    db.commit()

    token = create_session(db, user)
    _set_cookie(response, token, SESSION_DAYS)
    return {"token": token, "user": user_brief(db, user, user)}


# ---------- 找回密码（密保问题） ----------

@router.post("/auth/forgot")
def forgot_password(body: ForgotBody, db: Session = Depends(get_db)):
    """按账号查出密保问题"""
    user = db.scalar(select(User).where(User.username == body.username.strip()))
    if not user:
        raise HTTPException(404, "没有这个账号")
    if not user.security_question:
        raise HTTPException(400, "这个账号没设过密保问题，暂时没法自助找回")
    return {"username": user.username, "question": user.security_question}


@router.post("/auth/reset")
def reset_password(body: ResetBody, db: Session = Depends(get_db)):
    """答对密保问题就能重设密码，同时把旧的登录态全部作废"""
    user = db.scalar(select(User).where(User.username == body.username.strip()))
    if not user:
        raise HTTPException(404, "没有这个账号")
    if not user.security_question or not user.answer_hash:
        raise HTTPException(400, "这个账号没设过密保问题")
    if len(body.new_password) < 6:
        raise HTTPException(400, "新密码至少 6 位")
    if not hmac.compare_digest(user.answer_hash, hash_password(body.answer.strip(), user.answer_salt or "")):
        raise HTTPException(400, "密保答案不对")

    salt = new_salt()
    user.password_hash = hash_password(body.new_password, salt)
    user.salt = salt
    db.query(UserSession).filter(UserSession.user_id == user.id).delete(synchronize_session=False)
    db.commit()
    return {"ok": True, "message": "密码已重设，用新密码登录"}


@router.patch("/auth/security")
def set_security(body: SecurityBody, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """登录状态下设置 / 修改密保问题"""
    question = body.security_question.strip()[:32]
    answer = body.security_answer.strip()
    if not question or not answer:
        raise HTTPException(400, "问题和答案都要填")
    salt = new_salt()
    user.security_question = question
    user.answer_salt = salt
    user.answer_hash = hash_password(answer, salt)
    db.commit()
    return {"ok": True, "question": user.security_question}


@router.post("/auth/change-password")
def change_password(
    body: ChangePasswordBody, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    if not verify_password(user, body.old_password):
        raise HTTPException(400, "原密码不对")
    if len(body.new_password) < 6:
        raise HTTPException(400, "新密码至少 6 位")
    salt = new_salt()
    user.password_hash = hash_password(body.new_password, salt)
    user.salt = salt
    db.commit()
    return {"ok": True}


@router.post("/auth/login")
def login(body: LoginBody, response: Response, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == body.username.strip()))
    if not user or not verify_password(user, body.password):
        raise HTTPException(401, "账号或密码不正确")
    token = create_session(db, user)
    _set_cookie(response, token, SESSION_DAYS if body.remember else 1)
    return {"token": token, "user": user_brief(db, user, user)}


@router.post("/auth/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/auth/me")
def me(db: Session = Depends(get_db), user: User = Depends(current_user)):
    pending_in = db.scalar(
        select(func.count())
        .select_from(FriendRequest)
        .where(FriendRequest.to_user_id == user.id, FriendRequest.status == "pending")
    ) or 0
    data = user_brief(db, user, user)
    data["stats"] = stats_of(db, user.id)
    data["friend_count"] = len(friend_ids(db, user.id))
    data["pending_requests"] = pending_in
    if not data.get("avatar"):
        data["avatar"] = default_avatar(db, user.id)
    return data


class ProfileBody(BaseModel):
    nickname: str | None = None
    bio: str | None = None
    avatar: str | None = None
    home_city: str | None = None


@router.patch("/auth/me")
def update_me(body: ProfileBody, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if body.nickname:
        user.nickname = body.nickname.strip()[:24]
    if body.bio is not None:
        user.bio = body.bio.strip()[:500] or None
    if body.avatar is not None:
        user.avatar = body.avatar or None
    if body.home_city is not None:
        user.home_city = body.home_city.strip()[:32] or None
    db.commit()
    return user_brief(db, user, user)


# ---------- 找人 / 加好友 ----------

@router.get("/users/search")
def search_users(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    viewer: User | None = Depends(optional_user),
):
    like = f"%{q.strip()}%"
    rows = db.scalars(
        select(User).where(or_(User.username.like(like), User.nickname.like(like))).limit(20)
    ).all()
    return [user_brief(db, u, viewer) for u in rows]


@router.get("/users/{user_id}")
def get_user(user_id: str, db: Session = Depends(get_db), viewer: User | None = Depends(optional_user)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "没有这个人")
    if viewer and viewer.id != user_id and not (u.id in friend_ids(db, viewer.id)):
        # 不是好友：只看得到公开内容
        pass
    data = user_brief(db, u, viewer)
    data["stats"] = stats_of(db, u.id)
    if not data.get("avatar"):
        data["avatar"] = default_avatar(db, u.id)
    return data


@router.get("/friends")
def list_friends(db: Session = Depends(get_db), user: User = Depends(current_user)):
    # QQ 式：备注名优先显示
    remarks = {
        row.friend_user_id: row.remark
        for row in db.scalars(select(Friendship).where(Friendship.user_id == user.id)).all()
    }
    ids = sorted(friend_ids(db, user.id))
    out = []
    for fid in ids:
        u = db.get(User, fid)
        if not u:
            continue
        item = user_brief(db, u, user)
        item["stats"] = stats_of(db, fid)
        item["remark"] = remarks.get(fid)
        item["display_name"] = remarks.get(fid) or u.nickname
        if not item.get("avatar"):
            item["avatar"] = default_avatar(db, fid)
        out.append(item)
    return out


class FriendApply(BaseModel):
    user_id: str | None = None
    username: str | None = None
    message: str | None = None


@router.post("/friends/requests")
def apply_friend(body: FriendApply, db: Session = Depends(get_db), user: User = Depends(current_user)):
    target = db.get(User, body.user_id) if body.user_id else None
    if not target and body.username:
        target = db.scalar(select(User).where(User.username == body.username.strip()))
    if not target:
        raise HTTPException(404, "没找到这个人")
    if target.id == user.id:
        raise HTTPException(400, "不能加自己")
    if target.id in friend_ids(db, user.id):
        raise HTTPException(400, "你们已经是好友了")

    existing = db.scalar(
        select(FriendRequest).where(
            FriendRequest.status == "pending",
            or_(
                (FriendRequest.from_user_id == user.id) & (FriendRequest.to_user_id == target.id),
                (FriendRequest.from_user_id == target.id) & (FriendRequest.to_user_id == user.id),
            ),
        )
    )
    if existing:
        if existing.from_user_id == target.id:
            # 对方已经申请过了 → 直接同意
            existing.status = "accepted"
            add_friendship(db, user.id, target.id)
            db.commit()
            return {"status": "accepted", "friend": user_brief(db, target, user)}
        return {"status": "pending", "request_id": existing.id}

    req = FriendRequest(
        id="fr_" + uuid.uuid4().hex[:10],
        from_user_id=user.id,
        to_user_id=target.id,
        message=(body.message or "").strip()[:120] or None,
    )
    db.add(req)
    db.commit()
    return {"status": "pending", "request_id": req.id}


@router.get("/friends/requests")
def list_requests(db: Session = Depends(get_db), user: User = Depends(current_user)):
    incoming = db.scalars(
        select(FriendRequest).where(
            FriendRequest.to_user_id == user.id, FriendRequest.status == "pending"
        )
    ).all()
    outgoing = db.scalars(
        select(FriendRequest).where(
            FriendRequest.from_user_id == user.id, FriendRequest.status == "pending"
        )
    ).all()

    def pack(r: FriendRequest, other_id: str) -> dict:
        other = db.get(User, other_id)
        return {
            "id": r.id,
            "message": r.message,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "user": user_brief(db, other, user) if other else None,
        }

    return {
        "incoming": [pack(r, r.from_user_id) for r in incoming],
        "outgoing": [pack(r, r.to_user_id) for r in outgoing],
    }


def _handle_request(db: Session, user: User, request_id: str, accept: bool) -> dict:
    req = db.get(FriendRequest, request_id)
    if not req or req.to_user_id != user.id:
        raise HTTPException(404, "申请不存在")
    if req.status != "pending":
        raise HTTPException(400, "这条申请已经处理过了")
    req.status = "accepted" if accept else "rejected"
    from datetime import datetime

    req.handled_at = datetime.now()
    if accept:
        add_friendship(db, user.id, req.from_user_id)
    db.commit()
    return {"status": req.status}


@router.post("/friends/requests/{request_id}/accept")
def accept_request(request_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return _handle_request(db, user, request_id, True)


@router.post("/friends/requests/{request_id}/reject")
def reject_request(request_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return _handle_request(db, user, request_id, False)


@router.delete("/friends/{friend_id}")
def remove_friend(friend_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    db.query(Friendship).filter(
        or_(
            (Friendship.user_id == user.id) & (Friendship.friend_user_id == friend_id),
            (Friendship.user_id == friend_id) & (Friendship.friend_user_id == user.id),
        )
    ).delete(synchronize_session=False)
    db.commit()
    return {"deleted": friend_id}


@router.get("/users/{user_id}/circle")
def user_circle(
    user_id: str,
    scope: str = "me",
    year: str | None = None,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(optional_user),
):
    """好友主页：TA 的足迹概览（只算我能看到的）"""
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "没有这个人")
    is_friend = bool(viewer and (viewer.id == user_id or user_id in friend_ids(db, viewer.id)))
    mems = db.scalars(select(Memory).where(Memory.user_id == user_id)).all()
    if year:
        mems = [m for m in mems if (m.happened_at or "").startswith(year)]
    visible = [m for m in mems if can_view(db, viewer, user_id, getattr(m, "visibility", None))]
    cities = db.scalars(
        select(Location.city)
        .join(Memory, Memory.location_id == Location.id)
        .where(Memory.user_id == user_id, Location.city.isnot(None))
        .distinct()
    ).all()
    return {
        "user": user_brief(db, u, viewer),
        "is_friend": is_friend,
        "counts": {
            "memories": len(visible),
            "hidden": len(mems) - len(visible),
            "cities": len([c for c in cities if c]),
        },
        "cities": [c for c in cities if c],
        "memories": [
            {
                "id": m.id,
                "title": m.title,
                "summary": m.summary,
                "happened_at": m.happened_at,
                "cover": m.cover,
                "location_id": m.location_id,
                "media_count": m.media_count,
                "visibility": getattr(m, "visibility", "friends"),
            }
            for m in sorted(visible, key=lambda x: x.happened_at or "", reverse=True)[:60]
        ],
    }


class RemarkBody(BaseModel):
    remark: str | None = None


@router.patch("/friends/{friend_id}/remark")
def set_remark(
    friend_id: str, body: RemarkBody, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    """QQ 式备注名：只改我这边看到的称呼"""
    rows = db.scalars(
        select(Friendship).where(
            Friendship.user_id == user.id, Friendship.friend_user_id == friend_id
        )
    ).all()
    if not rows:
        raise HTTPException(404, "对方不是你的好友")
    remark = (body.remark or "").strip()[:32] or None
    for row in rows:
        row.remark = remark
    db.commit()
    return {"friend_id": friend_id, "remark": remark}
