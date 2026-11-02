"""照片留言：点开大图时以弹幕滚过的那些话（文字或语音）。

照片可能挂在三种东西上：
- memory：一条记忆里的照片（记忆详情页）
- guide：一篇旅行攻略里的封面 / 每天配图 / 图集
- route：一条路线的封面

弹幕是好友之间的互动层：
- 能看见这张照片的人（本人 / 好友 / 公开）都能看弹幕、留弹幕；
- 好友关系单独放行：即使内容设成「仅自己」，好友也能在这张照片下留弹幕、看到弹幕，
  这样两个人互相留言才通得起来。
"""

from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from auth import are_friends, can_view, current_user, friend_ids, optional_user
from db import get_db
from ingest import MEDIA_DIR
from models import MediaComment, Memory, MemoryMedia, TravelGuide, TravelRoute, User

router = APIRouter(prefix="/api", tags=["comments"])

VOICE_DIR = MEDIA_DIR / "voice"
VOICE_DIR.mkdir(parents=True, exist_ok=True)
MAX_VOICE_BYTES = 8 * 1024 * 1024

TARGETS = {
    "memory": Memory,
    "guide": TravelGuide,
    "route": TravelRoute,
}


def _brief(
    c: MediaComment,
    users: dict[str, User],
    viewer: User | None = None,
    owner_id: str | None = None,
) -> dict:
    u = users.get(c.user_id)
    return {
        "id": c.id,
        "target_type": c.target_type or "memory",
        "target_id": c.target_id or c.memory_id,
        "memory_id": c.memory_id,
        "media_url": c.media_url,
        "kind": c.kind,
        "content": c.content,
        "audio_url": c.audio_url,
        "duration_ms": c.duration_ms,
        "created_at": (c.created_at.isoformat() if c.created_at else None),
        "user_id": c.user_id,
        "nickname": u.nickname if u else "某人",
        "avatar": u.avatar if u else None,
        "is_mine": bool(viewer and c.user_id == viewer.id),
        # 自己的留言自己删，内容主人也能删
        "can_delete": bool(viewer and (c.user_id == viewer.id or owner_id == viewer.id)),
    }


def _owner_of(db: Session, target_type: str, target_id: str) -> tuple[str, str | None] | None:
    """(主人 id, 可见性)；找不到就 None"""
    model = TARGETS.get(target_type)
    if model is None:
        return None
    row = db.get(model, target_id)
    if row is None:
        return None
    return row.user_id, getattr(row, "visibility", None)


def _readable(db: Session, viewer: User | None, owner_id: str, visibility: str | None) -> bool:
    if can_view(db, viewer, owner_id, visibility):
        return True
    # 好友之间弹幕互通：内容设成「仅自己」也不影响好友来看/来留弹幕
    return bool(viewer and are_friends(db, viewer.id, owner_id))


def _resolve(db: Session, target_type: str, target_id: str, viewer: User | None) -> str:
    """校验目标存在且当前用户能碰它的弹幕，返回主人 id"""
    hit = _owner_of(db, target_type, target_id)
    if not hit or not _readable(db, viewer, *hit):
        raise HTTPException(404, "照片不存在")
    return hit[0]


def _target_filter(target_type: str, target_id: str):
    """老数据 target_id 可能为空，用 memory_id 兜住"""
    if target_type == "memory":
        return MediaComment.memory_id == target_id
    return (MediaComment.target_type == target_type) & (MediaComment.target_id == target_id)


def _target_urls(db: Session, target_type: str, target_id: str) -> list[str]:
    """这个东西底下所有照片的 url —— 弹幕按 url 共享，不按「它属于哪条记录」分家"""
    if target_type == "memory":
        return list(db.scalars(select(MemoryMedia.url).where(MemoryMedia.memory_id == target_id)))
    if target_type == "guide":
        guide = db.scalar(
            select(TravelGuide)
            .options(selectinload(TravelGuide.days_plan), selectinload(TravelGuide.media))
            .where(TravelGuide.id == target_id)
        )
        if not guide:
            return []
        urls: list[str] = []
        if guide.cover:
            urls.append(guide.cover)
        urls += [d.image_url for d in guide.days_plan if d.image_url]
        urls += [m.url for m in guide.media]
        return urls
    if target_type == "route":
        route = db.get(TravelRoute, target_id)
        return [route.cover] if route and route.cover else []
    return []


def _owner_map_for(db: Session, rows: list[MediaComment]) -> dict[tuple[str, str], str | None]:
    """每条留言原属那条内容的主人：判断能不能删要看它自己的出处"""
    out: dict[tuple[str, str], str | None] = {}
    for r in rows:
        key = (r.target_type or "memory", r.target_id or r.memory_id or "")
        if key in out:
            continue
        hit = _owner_of(db, key[0], key[1])
        out[key] = hit[0] if hit else None
    return out


# ---------- 通用：记忆 / 攻略 / 路线 的照片留言 ----------

@router.get("/media-comments")
def list_media_comments(
    target_type: str = Query("memory"),
    target_id: str = Query(...),
    media_url: str | None = None,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(optional_user),
):
    owner_id = _resolve(db, target_type, target_id, viewer)
    urls = [media_url] if media_url else _target_urls(db, target_type, target_id)
    if not urls:
        return []
    # 只看「照片 url」+「同一个人的内容」：
    # 同一个人把同一张图既放进记忆、又放进由它转出来的攻略 → 弹幕共用一批；
    # 不同用户各自上传了同一个文件（url 会一样）→ 各算各的，不串。
    rows = db.scalars(
        select(MediaComment)
        .where(MediaComment.media_url.in_(set(urls)))
        .where(MediaComment.owner_id == owner_id)
        .order_by(MediaComment.created_at)
    ).all()
    users = {u.id: u for u in db.scalars(select(User).where(User.id.in_({r.user_id for r in rows})))}
    owners = _owner_map_for(db, rows)
    return [
        _brief(r, users, viewer, owners.get((r.target_type or "memory", r.target_id or r.memory_id or "")))
        for r in rows
    ]


@router.post("/media-comments")
async def add_media_comment(
    target_type: str = Form("memory"),
    target_id: str = Form(...),
    media_url: str = Form(...),
    kind: str = Form("text"),
    content: str | None = Form(None),
    duration_ms: int | None = Form(None),
    audio: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    viewer: User = Depends(current_user),
):
    if target_type not in TARGETS:
        raise HTTPException(400, "不认识的照片类型")
    _resolve(db, target_type, target_id, viewer)

    text = (content or "").strip()
    audio_url: str | None = None

    if kind == "voice":
        if audio is None:
            raise HTTPException(400, "没有收到语音")
        data = await audio.read()
        if not data:
            raise HTTPException(400, "语音是空的")
        if len(data) > MAX_VOICE_BYTES:
            raise HTTPException(413, "语音太大了")
        suffix = Path(audio.filename or "voice.webm").suffix.lower() or ".webm"
        if suffix not in {".webm", ".ogg", ".mp3", ".m4a", ".wav"}:
            suffix = ".webm"
        name = f"{uuid.uuid4().hex}{suffix}"
        (VOICE_DIR / name).write_bytes(data)
        audio_url = f"/media/voice/{name}"
    elif not text:
        raise HTTPException(400, "留言不能为空")

    if len(text) > 140:
        text = text[:140]

    row = MediaComment(
        id=f"mc_{uuid.uuid4().hex[:10]}",
        target_type=target_type,
        target_id=target_id,
        memory_id=target_id if target_type == "memory" else None,
        media_url=media_url,
        user_id=viewer.id,
        kind="voice" if kind == "voice" else "text",
        content=text or None,
        audio_url=audio_url,
        duration_ms=duration_ms,
    )
    hit = _owner_of(db, target_type, target_id)
    row.owner_id = hit[0] if hit else None
    db.add(row)
    db.commit()
    db.refresh(row)
    return _brief(row, {viewer.id: viewer}, viewer, row.owner_id)


# ---------- 记忆详情页用的老接口（保持兼容） ----------

@router.get("/memories/{memory_id}/comments")
def list_comments(
    memory_id: str,
    media_url: str | None = None,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(optional_user),
):
    """默认返回这条记忆下所有照片的留言，前端按 media_url 分组；给 media_url 就只取那一张。"""
    owner_id = _resolve(db, "memory", memory_id, viewer)
    urls = [media_url] if media_url else _target_urls(db, "memory", memory_id)
    if not urls:
        return []
    # 同一张照片可能在记忆里、也在由它转出来的攻略里 —— 同一个人的，弹幕共用一份
    rows = db.scalars(
        select(MediaComment)
        .where(MediaComment.media_url.in_(set(urls)))
        .where(MediaComment.owner_id == owner_id)
        .order_by(MediaComment.created_at)
    ).all()
    users = {u.id: u for u in db.scalars(select(User).where(User.id.in_({r.user_id for r in rows})))}
    owners = _owner_map_for(db, rows)
    return [
        _brief(r, users, viewer, owners.get((r.target_type or "memory", r.target_id or r.memory_id or "")))
        for r in rows
    ]


@router.post("/memories/{memory_id}/comments")
async def add_comment(
    memory_id: str,
    media_url: str = Form(...),
    kind: str = Form("text"),
    content: str | None = Form(None),
    duration_ms: int | None = Form(None),
    audio: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    viewer: User = Depends(current_user),
):
    """留一句话或一段语音；语音走 multipart，存在 media/voice/ 下。"""
    return await add_media_comment(
        target_type="memory",
        target_id=memory_id,
        media_url=media_url,
        kind=kind,
        content=content,
        duration_ms=duration_ms,
        audio=audio,
        db=db,
        viewer=viewer,
    )


@router.delete("/comments/{comment_id}")
def delete_comment(
    comment_id: str,
    db: Session = Depends(get_db),
    viewer: User = Depends(current_user),
):
    row = db.get(MediaComment, comment_id)
    if not row:
        raise HTTPException(404, "留言不存在")
    hit = _owner_of(db, row.target_type or "memory", row.target_id or row.memory_id or "")
    # 自己留的，或者内容的主人，都能删
    if row.user_id != viewer.id and (not hit or hit[0] != viewer.id):
        raise HTTPException(403, "删不了别人的留言")
    if row.audio_url and row.audio_url.startswith("/media/voice/"):
        path = VOICE_DIR / row.audio_url.split("/")[-1]
        path.unlink(missing_ok=True)
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/comments/recent")
def recent_comments(
    scope: str = "friends",
    limit: int = Query(40, ge=1, le=120),
    db: Session = Depends(get_db),
    viewer: User = Depends(current_user),
):
    """好友弹幕流：好友（以及自己）最近在照片上留的话，记忆/攻略/路线的照片都算。

    scope=friends 只看好友+自己；scope=public 看全站公开内容上的弹幕。
    只返回我本来就能看到的那条内容，避免私密内容被弹幕流带出来。
    """
    ids = friend_ids(db, viewer.id) | {viewer.id}
    stmt = select(MediaComment).order_by(MediaComment.created_at.desc()).limit(limit * 6)
    if scope != "public":
        stmt = stmt.where(MediaComment.user_id.in_(ids))

    rows = db.scalars(stmt).all()
    users = {u.id: u for u in db.scalars(select(User).where(User.id.in_({r.user_id for r in rows})))}

    # 一次把三种目标都查出来，别在循环里查库
    picked = {
        "memory": {r.target_id or r.memory_id for r in rows if (r.target_type or "memory") == "memory"},
        "guide": {r.target_id for r in rows if r.target_type == "guide"},
        "route": {r.target_id for r in rows if r.target_type == "route"},
    }
    rows_of: dict[str, dict[str, object]] = {}
    for key, model in TARGETS.items():
        ids_ = {i for i in picked[key] if i}
        if not ids_:
            continue
        rows_of[key] = {obj.id: obj for obj in db.scalars(select(model).where(model.id.in_(ids_)))}

    out: list[dict] = []
    for r in rows:
        ttype = r.target_type or "memory"
        tid = r.target_id or r.memory_id or ""
        obj = rows_of.get(ttype, {}).get(tid)
        if obj is None:
            continue
        visibility = getattr(obj, "visibility", "friends")
        if scope == "public":
            if visibility != "public":
                continue
        elif not _readable(db, viewer, obj.user_id, visibility):
            continue

        item = _brief(r, users, viewer, obj.user_id)
        item["title"] = getattr(obj, "title", None)
        item["cover"] = getattr(obj, "cover", None)
        # 照片本身能不能点开：私密内容只有弹幕文字能看，照片不给
        item["openable"] = can_view(db, viewer, obj.user_id, visibility)
        item["visibility"] = visibility
        item["link"] = (
            f"/memories/{tid}" if ttype == "memory" else f"/travel/{tid}" if ttype == "guide" else f"/travel/route/{tid}"
        )
        # 前端沿用旧字段名
        item["memory_id"] = tid
        item["memory_title"] = item["title"]
        out.append(item)
        if len(out) >= limit:
            break
    return out
