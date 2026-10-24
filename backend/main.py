"""拾光后端 API（FastAPI + MySQL）"""
import json
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, selectinload

from config import DATA_DIR, MEDIA_DIR
from auth import are_friends, can_view, optional_user, visible_owner_ids
from db import get_db, init_db
from models import (
    Location,
    Memory,
    MemoryMedia,
    MemoryPerson,
    Person,
    PersonRelation,
    Story,
    User,
)
from routes_assistant import router as assistant_router
from routes_narration import router as narration_router
from routes_social import router as social_router
from routes_travel import router as travel_router
from routes_upload import router as upload_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="拾光 API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 音频等媒体文件：/media/audio/xxx.mp3
app.mount("/media", StaticFiles(directory=str(MEDIA_DIR)), name="media")

# 记忆入库（上传 / 分析 / 保存 / 删除）
app.include_router(upload_router)

# 小拾 AI（基于真实记忆回答问题）
app.include_router(assistant_router)

# 配音故事（分幕旁白 + 语音 + 字幕）
app.include_router(narration_router)

# 账号 / 好友 / 友链
app.include_router(social_router)

# 旅行路线 / 旅游攻略 / 地图共享
app.include_router(travel_router)


# ---------- 序列化 ----------

def memory_brief(m: Memory) -> dict:
    return {
        "id": m.id,
        "title": m.title,
        "summary": m.summary,
        "happened_at": m.happened_at,
        "time_precision": m.time_precision,
        "location_id": m.location_id,
        "person_ids": [link.person_id for link in m.person_links],
        "tags": json.loads(m.tags or "[]"),
        "emotion": m.emotion,
        "importance": m.importance,
        "source_type": m.source_type,
        "cover": m.cover,
        "media_count": m.media_count,
        "ai_status": m.ai_status,
        "ai_generated": bool(m.ai_generated),
        "confidence": m.confidence,
        "user_id": m.user_id,
        "visibility": getattr(m, "visibility", "friends"),
    }


def location_dict(loc: Location | None) -> dict | None:
    if not loc:
        return None
    return {
        "id": loc.id,
        "name": loc.name,
        "city": loc.city,
        "region": loc.region,
        "country": loc.country,
        "latitude": loc.latitude,
        "longitude": loc.longitude,
        "precision": loc.precision,
    }


def scene_dict(s) -> dict:
    return {
        "id": s.id,
        "sort": s.sort,
        "narration": s.narration,
        "image_url": s.image_url,
        "memory_ids": json.loads(s.memory_ids or "[]"),
        "audio_url": s.audio_url,
        "subtitles": json.loads(s.subtitle_json or "[]"),
        "duration_ms": s.duration_ms,
    }


# ---------- 基础 ----------

@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    return {
        "status": "ok",
        "memories": db.scalar(select(func.count()).select_from(Memory)) or 0,
        "persons": db.scalar(select(func.count()).select_from(Person)) or 0,
        "locations": db.scalar(select(func.count()).select_from(Location)) or 0,
        "stories": db.scalar(select(func.count()).select_from(Story)) or 0,
    }


@app.get("/api/startup")
def startup_log():
    """start.bat 写下的启动过程记录，开场动画照它展示「命令行刚刚做了什么」"""
    path = DATA_DIR / "startup.json"
    if not path.exists():
        return {"stages": [], "total_seconds": 0}
    try:
        stages = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {"stages": [], "total_seconds": 0}
    if isinstance(stages, dict):
        stages = [stages]
    total = sum(float(s.get("seconds") or 0) for s in stages)
    return {"stages": stages, "total_seconds": round(total, 1)}


@app.get("/api/locations")
def list_locations(db: Session = Depends(get_db)):
    return [location_dict(loc) for loc in db.scalars(select(Location).order_by(Location.name))]


@app.get("/api/persons")
def list_persons(db: Session = Depends(get_db)):
    rows = db.scalars(select(Person)).all()
    # 间接关系：这个人是通过谁认识的（王盈芳的闺蜜 → via 王盈芳）
    links = db.scalars(select(PersonRelation)).all()
    via_map: dict[str, dict] = {}
    for link in links:
        anchor = db.get(Person, link.from_person_id)
        if anchor:
            via_map[link.to_person_id] = {"via_id": anchor.id, "via_name": anchor.name, "via_label": link.label}

    return [
        {
            "id": p.id,
            "name": p.name,
            "relation_label": p.relation_label,
            "avatar": p.avatar,
            "aliases": json.loads(p.aliases or "[]"),
            **via_map.get(p.id, {}),
        }
        for p in rows
    ]


class PersonUpdate(BaseModel):
    name: str | None = None
    relation_label: str | None = None
    avatar: str | None = None


@app.patch("/api/persons/{person_id}")
def update_person(person_id: str, payload: PersonUpdate, db: Session = Depends(get_db)):
    """改人物资料：名字、关系、头像（头像不填就自动用 TA 第一张照片）"""
    person = db.get(Person, person_id)
    if not person:
        raise HTTPException(404, "人物不存在")
    if payload.name:
        person.name = payload.name.strip()[:32]
    if payload.relation_label is not None:
        person.relation_label = payload.relation_label.strip()[:16] or None
    if payload.avatar is not None:
        person.avatar = payload.avatar or None
    db.commit()

    # 没头像就顺手补一张：拿 TA 参与的记忆的封面
    if not person.avatar:
        first = db.scalar(
            select(Memory)
            .join(MemoryPerson, MemoryPerson.memory_id == Memory.id)
            .where(MemoryPerson.person_id == person_id, Memory.cover.isnot(None))
            .order_by(Memory.happened_at)
        )
        if first and first.cover:
            person.avatar = first.cover
            db.commit()

    return {"id": person.id, "name": person.name, "relation_label": person.relation_label, "avatar": person.avatar}


@app.delete("/api/persons/{person_id}")
def delete_person(person_id: str, db: Session = Depends(get_db)):
    """删掉一个人物（同时解除 TA 与所有记忆的关联、以及与其他人的关系）"""
    person = db.get(Person, person_id)
    if not person:
        raise HTTPException(404, "人物不存在")
    db.execute(delete(MemoryPerson).where(MemoryPerson.person_id == person_id))
    db.execute(
        delete(PersonRelation).where(
            (PersonRelation.from_person_id == person_id) | (PersonRelation.to_person_id == person_id)
        )
    )
    db.delete(person)
    db.commit()
    return {"deleted": person_id}


# ---------- 记忆 ----------

@app.get("/api/memories")
def list_memories(
    year: int | None = None,
    person_id: str | None = None,
    location_id: str | None = None,
    q: str | None = None,
    scope: str | None = None,
    owner: str | None = None,
    limit: int = Query(100, le=500),
    offset: int = 0,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(optional_user),
):
    stmt = select(Memory).options(selectinload(Memory.person_links))

    if viewer:
        if owner:
            allowed = [owner] if (owner == viewer.id or are_friends(db, viewer.id, owner)) else []
        elif scope in ("me", "friends", "all"):
            allowed = visible_owner_ids(db, viewer, scope)
        else:
            allowed = [viewer.id]
        stmt = stmt.where(Memory.user_id.in_(allowed) if allowed else Memory.visibility == "public")
    else:
        stmt = stmt.where(Memory.visibility == "public")

    if year:
        stmt = stmt.where(Memory.happened_at.like(f"{year}%"))
    if location_id:
        stmt = stmt.where(Memory.location_id == location_id)
    if person_id:
        stmt = stmt.join(Memory.person_links).where(
            Memory.person_links.property.mapper.class_.person_id == person_id
        )
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            Memory.title.like(like) | Memory.summary.like(like) | Memory.content.like(like)
        )

    stmt = stmt.order_by(Memory.happened_at.desc()).limit(limit).offset(offset)
    rows = [m for m in db.scalars(stmt).unique() if can_view(db, viewer, m.user_id, getattr(m, "visibility", None))]
    return [memory_brief(m) for m in rows]


@app.get("/api/memories/{memory_id}")
def get_memory(memory_id: str, db: Session = Depends(get_db)):
    memory = db.scalar(
        select(Memory)
        .options(selectinload(Memory.person_links), selectinload(Memory.media))
        .where(Memory.id == memory_id)
    )
    if not memory:
        raise HTTPException(404, "记忆不存在")

    data = memory_brief(memory)
    data.update(
        {
            "content": memory.content,
            "time_precision": memory.time_precision,
            "location": location_dict(db.get(Location, memory.location_id)),
            # 旅行攻略那几块：消费明细 / 交通 / 住宿 / 提醒
            "costs": json.loads(memory.cost_json or "[]"),
            "transport_info": getattr(memory, "transport_info", None),
            "stay_info": getattr(memory, "stay_info", None),
            "tips": getattr(memory, "tips", None),
            "media": [
                {"id": md.id, "url": md.url, "caption": md.caption} for md in memory.media
            ],
        }
    )
    return data


@app.get("/api/memories/{memory_id}/media")
def get_memory_media(memory_id: str, db: Session = Depends(get_db)):
    """记忆下的所有图片，用于时间线的图片展示页"""
    memory = db.get(Memory, memory_id)
    if not memory:
        raise HTTPException(404, "记忆不存在")
    rows = db.scalars(
        select(MemoryMedia).where(MemoryMedia.memory_id == memory_id).order_by(MemoryMedia.sort)
    ).all()
    return {
        "memory_id": memory_id,
        "title": memory.title,
        "summary": memory.summary,
        "happened_at": memory.happened_at,
        "photos": [
            {
                "id": r.id,
                "url": r.url,
                "caption": r.caption or "",
                # 视频和照片混在一条记忆里，前端据此决定用 <video> 还是 <img>
                "kind": (
                    "video"
                    if r.url.lower().endswith((".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv"))
                    else "image"
                ),
            }
            for r in rows
        ],
    }


@app.get("/api/timeline/years")
def timeline_years(db: Session = Depends(get_db)):
    """按年份聚合，前端时间线使用"""
    rows = db.execute(
        select(
            func.substr(Memory.happened_at, 1, 4).label("year"),
            func.count().label("count"),
        )
        .group_by("year")
        .order_by("year")
    ).all()
    return [{"year": int(r.year), "count": r.count} for r in rows if r.year]


# ---------- 故事 ----------

@app.get("/api/stories")
def list_stories(db: Session = Depends(get_db)):
    rows = db.scalars(select(Story).order_by(Story.created_at.desc())).all()
    return [
        {
            "id": s.id,
            "title": s.title,
            "subtitle": s.subtitle,
            "cover": s.cover,
            "style": s.style,
            "status": s.status,
            "voice": s.voice,
        }
        for s in rows
    ]


@app.get("/api/stories/{story_id}")
def get_story(story_id: str, db: Session = Depends(get_db)):
    story = db.scalar(
        select(Story).options(selectinload(Story.scenes)).where(Story.id == story_id)
    )
    if not story:
        raise HTTPException(404, "故事不存在")
    return {
        "id": story.id,
        "title": story.title,
        "subtitle": story.subtitle,
        "cover": story.cover,
        "style": story.style,
        "status": story.status,
        "voice": story.voice,
        "scenes": [scene_dict(s) for s in story.scenes],
    }
