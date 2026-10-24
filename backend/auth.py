"""账号与登录：密码散列、会话令牌、当前用户依赖、可见范围判定"""
import hashlib
import hmac
import os
import secrets
import uuid
from datetime import datetime, timedelta

from fastapi import Cookie, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from db import get_db
from models import Friendship, User, UserSession

COOKIE_NAME = "sg_auth"
SESSION_DAYS = 7
VISIBILITIES = ("private", "friends", "public")


def hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000).hex()


def new_salt() -> str:
    return secrets.token_hex(16)


def make_user_id() -> str:
    return "usr_" + uuid.uuid4().hex[:10]


def verify_password(user: User, password: str) -> bool:
    return hmac.compare_digest(user.password_hash, hash_password(password, user.salt))


def create_session(db: Session, user: User) -> str:
    token = secrets.token_urlsafe(32)
    db.add(
        UserSession(
            token=token,
            user_id=user.id,
            expires_at=datetime.now() + timedelta(days=SESSION_DAYS),
        )
    )
    db.commit()
    return token


def _token_from(sg_auth: str | None, authorization: str | None) -> str | None:
    if sg_auth:
        return sg_auth
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return None


def current_user(
    sg_auth: str | None = Cookie(default=None),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    """必须登录，否则 401"""
    token = _token_from(sg_auth, authorization)
    if not token:
        raise HTTPException(401, "请先登录")
    session = db.get(UserSession, token)
    if not session or session.expires_at < datetime.now():
        raise HTTPException(401, "登录已过期，请重新登录")
    user = db.get(User, session.user_id)
    if not user:
        raise HTTPException(401, "账号不存在")
    return user


def optional_user(
    sg_auth: str | None = Cookie(default=None),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User | None:
    """可选登录：没登录也能看公开内容"""
    token = _token_from(sg_auth, authorization)
    if not token:
        return None
    session = db.get(UserSession, token)
    if not session or session.expires_at < datetime.now():
        return None
    return db.get(User, session.user_id)


def friend_ids(db: Session, user_id: str) -> set[str]:
    rows = db.scalars(select(Friendship.friend_user_id).where(Friendship.user_id == user_id)).all()
    return set(rows)


def are_friends(db: Session, a: str, b: str) -> bool:
    return bool(
        db.scalar(select(Friendship.id).where(Friendship.user_id == a, Friendship.friend_user_id == b))
    )


def add_friendship(db: Session, a: str, b: str) -> None:
    for x, y in ((a, b), (b, a)):
        exists = db.scalar(
            select(Friendship.id).where(Friendship.user_id == x, Friendship.friend_user_id == y)
        )
        if not exists:
            db.add(Friendship(user_id=x, friend_user_id=y))
    db.commit()


def can_view(db: Session, viewer: User | None, owner_id: str, visibility: str | None) -> bool:
    """一条内容能不能被这个人看到"""
    vis = visibility or "friends"
    if viewer and viewer.id == owner_id:
        return True
    if vis == "public":
        return True
    if vis == "friends" and viewer and are_friends(db, viewer.id, owner_id):
        return True
    return False


def visible_owner_ids(db: Session, viewer: User | None, scope: str | None = "all") -> list[str]:
    """地图/列表用：这个范围下我能看到哪些人的数据
    scope = me | friends | all（我+好友） | world（全站，含陌生人，只放公开内容） | u:<user_id>
    """
    if not viewer:
        # 未登录只能看公开内容：用空列表 + 由调用方叠加 public 条件
        return []

    mine = [viewer.id]
    friends = sorted(friend_ids(db, viewer.id))

    if scope in ("world", "everyone", "discover"):
        everyone = db.scalars(select(User.id)).all()
        return sorted(set(everyone))

    if scope in (None, "", "all"):
        return mine + friends
    if scope == "me":
        return mine
    if scope == "friends":
        return friends
    if scope.startswith("u:"):
        target = scope[2:]
        if target == viewer.id or target in friends:
            return [target]
        return []
    return mine + friends


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def env_flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")
