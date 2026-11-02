"""拾光后端 API（FastAPI + MySQL）"""
import json
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import delete, false, func, or_, select
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
def list_persons(
    db: Session = Depends(get_db),
    viewer: User | None = Depends(optional_user),
):
    """人物库只展示「出现在我能看到的记忆里」的人，未登录返回空"""
    if viewer is None:
        return []

    visible_memory_ids = db.scalars(
        select(Memory.id).where(Memory.user_id == viewer.id)
    ).all()
    if not visible_memory_ids:
        return []

    person_ids = {
        link.person_id
        for link in db.scalars(
            select(MemoryPerson).where(MemoryPerson.memory_id.in_(visible_memory_ids))
        )
    }
    if not person_ids:
        return []

    rows = db.scalars(select(Person).where(Person.id.in_(person_ids))).all()
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


# 人物资料编辑/删除接口已随「人物网络」模块下线：
# 它们在删除页面的同时没有归属校验，等于允许任何人改/删全站人物数据。
# 人物信息现在只由记忆本身（memory_persons）推导，前端只读。


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
            stmt = stmt.where(Memory.user_id.in_(allowed) if allowed else false())
        elif scope in ("world", "everyone", "discover"):
            # 世界档：只放公开内容，自己的私密 / 好友可见不出现
            stmt = stmt.where(Memory.visibility == "public")
        elif scope in ("me", "friends", "all"):
            allowed = visible_owner_ids(db, viewer, scope)
            stmt = stmt.where(Memory.user_id.in_(allowed) if allowed else false())
        else:
            stmt = stmt.where(Memory.user_id == viewer.id)
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

    # 刚上传、还没分析过的（pending）只是草稿：不该出现在最近记忆 / 时间轴 / 相册里，
    # 它们只在「待分析」页里出现
    stmt = stmt.where(
        or_(Memory.ai_status.is_(None), Memory.ai_status.notin_(["pending", "draft"]))
    )

    stmt = stmt.order_by(Memory.happened_at.desc()).limit(limit).offset(offset)
    rows = [m for m in db.scalars(stmt).unique() if can_view(db, viewer, m.user_id, getattr(m, "visibility", None))]
    items = [memory_brief(m) for m in rows]

    # 没设封面的记忆，用它的第一张照片当封面：相册/卡片不该因为「没设过封面」就空着
    need = [it["id"] for it in items if not it.get("cover")]
    if need:
        first_photo: dict[str, str] = {}
        for row in db.scalars(
            select(MemoryMedia)
            .where(MemoryMedia.memory_id.in_(need))
            .order_by(MemoryMedia.memory_id, MemoryMedia.sort)
        ):
            first_photo.setdefault(row.memory_id, row.url)
        for it in items:
            if not it.get("cover"):
                it["cover"] = first_photo.get(it["id"])
    return items


@app.get("/api/memories/{memory_id}")
def get_memory(
    memory_id: str,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(optional_user),
):
    memory = db.scalar(
        select(Memory)
        .options(selectinload(Memory.person_links), selectinload(Memory.media))
        .where(Memory.id == memory_id)
    )
    if not memory:
        raise HTTPException(404, "记忆不存在")
    # 私密/好友可见的记忆不能靠猜 id 直接读
    if not can_view(db, viewer, memory.user_id, getattr(memory, "visibility", None)):
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
def get_memory_media(
    memory_id: str,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(optional_user),
):
    """记忆下的所有图片，用于时间线的图片展示页"""
    memory = db.get(Memory, memory_id)
    if not memory:
        raise HTTPException(404, "记忆不存在")
    if not can_view(db, viewer, memory.user_id, getattr(memory, "visibility", None)):
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
def timeline_years(
    db: Session = Depends(get_db),
    viewer: User | None = Depends(optional_user),
):
    """按年份聚合，前端时间线使用（只统计当前用户自己能看到的记忆）"""
    stmt = select(
        func.substr(Memory.happened_at, 1, 4).label("year"),
        func.count().label("count"),
    )
    if viewer:
        stmt = stmt.where(Memory.user_id == viewer.id)
    else:
        stmt = stmt.where(Memory.visibility == "public")
    rows = db.execute(stmt.group_by("year").order_by("year")).all()
    return [{"year": int(r.year), "count": r.count} for r in rows if r.year]


# ---------- 故事 ----------

@app.get("/api/stories")
def list_stories(
    db: Session = Depends(get_db),
    viewer: User | None = Depends(optional_user),
):
    """只列出「我自己」生成的故事；历史演示故事（user_id 为空）不展示给任何人"""
    if viewer is None:
        return []
    rows = db.scalars(
        select(Story).where(Story.user_id == viewer.id).order_by(Story.created_at.desc())
    ).all()
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
def get_story(
    story_id: str,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(optional_user),
):
    story = db.scalar(
        select(Story).options(selectinload(Story.scenes)).where(Story.id == story_id)
    )
    if not story:
        raise HTTPException(404, "故事不存在")
    if viewer is None or story.user_id != viewer.id:
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
