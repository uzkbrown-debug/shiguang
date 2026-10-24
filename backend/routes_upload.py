"""记忆入库接口：上传 → 分析提取 → 确认保存 → 删除"""
import hashlib
import json
import random
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

import city_coords
import ingest
import llm
from config import MAX_VIDEO_MB
from auth import optional_user
from db import get_db
from models import Location, Memory, MemoryMedia, MemoryPerson, Person, PersonRelation, User

router = APIRouter(prefix="/api", tags=["记忆入库"])


class MemoryUpdate(BaseModel):
    title: str | None = None
    summary: str | None = None
    content: str | None = None
    happened_at: str | None = None
    time_precision: str | None = None
    location_id: str | None = None
    person_ids: list[str] | None = None
    tags: list[str] | None = None
    emotion: str | None = None
    importance: int | None = None
    ai_status: str | None = None
    visibility: str | None = None
    costs: list[dict] | None = None
    transport_info: str | None = None
    stay_info: str | None = None
    tips: str | None = None


def _draft(memory: Memory, media: MemoryMedia | None, meta: dict, extra: dict) -> dict:
    try:
        costs = json.loads(memory.cost_json or "[]")
    except Exception:
        costs = []
    if not isinstance(costs, list):
        costs = []
    try:
        links = [link.person_id for link in memory.person_links]
    except Exception:
        links = []
    return {
        "memory_id": memory.id,
        "title": memory.title,
        "summary": memory.summary,
        "content": memory.content,
        "happened_at": memory.happened_at,
        "time_precision": memory.time_precision,
        "location_id": memory.location_id,
        "tags": json.loads(memory.tags or "[]"),
        "emotion": memory.emotion,
        "importance": memory.importance,
        "cover": memory.cover,
        "ai_status": memory.ai_status,
        "ai_generated": bool(memory.ai_generated),
        "confidence": memory.confidence,
        "meta": meta,
        "duplicate": extra.get("duplicate", False),
        "file_url": media.url if media else None,
        # 状态栏要用的四块事实 + 现存的人物/可见范围
        "costs": costs,
        "transport_info": getattr(memory, "transport_info", None),
        "stay_info": getattr(memory, "stay_info", None),
        "tips": getattr(memory, "tips", None),
        "person_ids": links,
        "visibility": getattr(memory, "visibility", "friends"),
    }


class LocationCreate(BaseModel):
    name: str
    city: str | None = None
    latitude: float | None = None
    longitude: float | None = None


@router.post("/locations")
def create_location(payload: LocationCreate, db: Session = Depends(get_db)):
    """新建地点：同名地点直接返回；坐标尽量自动补全，让地图能定位"""
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "地点名不能为空")
    if len(name) > 32:
        raise HTTPException(400, "地点名太长（最多 32 个字）")

    auto = city_coords.lookup_coords(name)
    latitude = payload.latitude if payload.latitude is not None else (auto[0] if auto else None)
    longitude = payload.longitude if payload.longitude is not None else (auto[1] if auto else None)

    existing = db.scalar(select(Location).where(Location.name == name))
    if existing:
        if (existing.latitude is None or existing.longitude is None) and latitude is not None:
            existing.latitude = latitude
            existing.longitude = longitude
            db.commit()
        return {
            "id": existing.id,
            "name": existing.name,
            "city": existing.city,
            "latitude": existing.latitude,
            "longitude": existing.longitude,
            "created": False,
        }

    location = Location(
        id=f"loc_{uuid.uuid4().hex[:8]}",
        name=name,
        city=payload.city or name,
        precision="city",
        latitude=latitude,
        longitude=longitude,
    )
    db.add(location)
    db.commit()
    return {
        "id": location.id,
        "name": location.name,
        "city": location.city,
        "latitude": location.latitude,
        "longitude": location.longitude,
        "created": True,
    }


def _resolve_media(url: str) -> Path | None:
    """把媒体地址换成磁盘上的真实文件：
    /media/uploads/xxx → backend/media/uploads/xxx
    /images/xxx        → 前端 public/images/xxx（示例数据用的是这种）"""
    if url.startswith("/media/uploads/"):
        path = ingest.UPLOAD_DIR / url.split("/")[-1]
        return path if path.exists() else None
    if url.startswith("/images/"):
        path = ingest.UPLOAD_DIR.parent.parent.parent / "public" / "images" / url.split("/")[-1]
        return path if path.exists() else None
    return None


def _ensure_persons(db: Session, found: list[dict], source_text: str = "") -> list[dict]:
    """把识别到的人名接进 persons 表：已存在就复用，不存在就新建。
    带 via 的表示间接关系（「王盈芳的闺蜜小美」→ 小美挂在王盈芳下面），
    这种人在人物图里是从王盈芳长出去的，不会算成"我"的直接关系。"""
    result: list[dict] = []
    # 先建直接关系的人，再建挂在别人下面的人，避免先后顺序问题
    ordered = sorted(found, key=lambda item: 1 if item.get("via") else 0)

    for item in ordered:
        name = (item.get("name") or "").strip()
        if not name:
            continue

        via_name = (item.get("via") or "").strip()
        # via 这个人必须真的在原文里出现过，而且不能是自己
        if via_name and (via_name == name or (source_text and via_name not in source_text)):
            via_name = ""

        anchor = None
        if via_name:
            anchor = db.scalar(select(Person).where(Person.name == via_name))
            if not anchor:
                anchor = Person(id=f"per_{uuid.uuid4().hex[:8]}", name=via_name, relation_label=None)
                db.add(anchor)
                db.flush()
                print(f"[person] 新识别并建库（作为关系锚点）：{via_name}")

        person = db.scalar(select(Person).where(Person.name == name))
        if not person:
            person = Person(id=f"per_{uuid.uuid4().hex[:8]}", name=name)
            db.add(person)
            db.flush()
            print(f"[person] 新识别并建库：{name}" + (f"（{via_name}的{item.get('role') or '关系人'}）" if anchor else ""))

        role = (item.get("role") or "").strip() or None

        if anchor:
            # 间接关系：写成「王盈芳的闺蜜」，并存一条关系边
            label = f"{anchor.name}的{role}" if role else f"{anchor.name}的关系人"
            exists = db.scalar(
                select(PersonRelation).where(
                    PersonRelation.from_person_id == anchor.id,
                    PersonRelation.to_person_id == person.id,
                )
            )
            if not exists:
                db.add(
                    PersonRelation(
                        id=f"rel_{uuid.uuid4().hex[:8]}",
                        from_person_id=anchor.id,
                        to_person_id=person.id,
                        label=role,
                    )
                )
            if not person.relation_label or person.relation_label.endswith("关系人"):
                person.relation_label = label[:32]
        elif role and (not person.relation_label or person.relation_label in ("待确认", "未分类")):
            person.relation_label = role[:16]

        result.append(
            {
                "id": person.id,
                "name": person.name,
                "role": person.relation_label,
                "via_id": anchor.id if anchor else None,
                "via_name": anchor.name if anchor else None,
            }
        )
    return result


def _media_kind(url: str) -> str:
    ext = Path(url).suffix.lower()
    if ext in ingest.VIDEO_EXT:
        return "video"
    if ext in ingest.IMAGE_EXT:
        return "image"
    return "text"


def _location_from_place(db: Session, place: str) -> Location | None:
    """把 AI 判断出来的地名落成一条地点记录

    - 名字里含已知城市（"厦门鼓浪屿" → 厦门）就用那个城市的坐标
    - 整名能查到坐标（"大理"）就直接用
    - 都查不到就不建，免得又出现坐标为 0、地图上飘在非洲的点
    """
    name = (place or "").strip()
    if not name:
        return None

    existing = db.scalar(select(Location).where(Location.name == name))
    if existing:
        return existing

    city: str | None = None
    coords: tuple[float, float] | None = None
    for key in sorted(city_coords.CITY_COORDS, key=len, reverse=True):
        if key in name or name in key:
            city, coords = key, city_coords.CITY_COORDS[key]
            break
    if coords is None:
        coords = city_coords.lookup_coords(name)
        city = name if coords else None
    if coords is None:
        return None

    loc = Location(
        id="loc_p_" + hashlib.sha1(name.encode("utf-8")).hexdigest()[:10],
        name=name,
        city=city,
        latitude=coords[0],
        longitude=coords[1],
        precision="spot" if city and name != city else "city",
    )
    db.add(loc)
    db.flush()
    return loc


# 地点真的认不出来时，从这些城市里随便给一个（前端状态栏会明确标「AI 猜的」）
_RANDOM_PLACES = (
    "厦门", "大理", "成都", "西安", "青岛", "杭州", "苏州", "长沙", "重庆", "昆明",
    "东京", "京都", "首尔", "曼谷", "新加坡", "巴黎", "罗马", "伦敦", "台北",
)


def _random_guess_place(db: Session) -> Location | None:
    for name in random.sample(_RANDOM_PLACES, len(_RANDOM_PLACES)):
        loc = _location_from_place(db, name)
        if loc:
            return loc
    return None


@router.post("/uploads")
async def upload_memory(
    file: UploadFile | None = File(None),
    files: list[UploadFile] | None = File(None),
    visibility: str = Form("friends"),
    db: Session = Depends(get_db),
    viewer: User | None = Depends(optional_user),
):
    """真实上传：一次可以多张照片/文字，也可以是一段视频（会自动抽关键帧）"""
    incoming: list[UploadFile] = []
    if files:
        incoming.extend([f for f in files if f and f.filename])
    if file and file.filename:
        incoming.append(file)
    if not incoming:
        raise HTTPException(400, "没有收到文件")

    max_video_bytes = MAX_VIDEO_MB * 1024 * 1024
    memory_id = f"mem_{datetime.now().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:6]}"

    saved_items: list[dict] = []
    video_items: list[dict] = []
    text_parts: list[str] = []
    meta_files: list[dict] = []

    for item in incoming:
        data = await item.read()
        filename = item.filename or "untitled"
        if not data:
            continue

        ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext in ingest.VIDEO_EXT:
            if len(data) > max_video_bytes:
                raise HTTPException(413, f"视频超过 {MAX_VIDEO_MB} MB 限制")
        elif ext in ingest.IMAGE_EXT or ext in ingest.TEXT_EXT:
            if len(data) > ingest.MAX_BYTES:
                raise HTTPException(413, f"{filename} 超过 20 MB 限制")
        else:
            raise HTTPException(415, f"不支持的文件类型：{ext or '未知'}")

        saved = ingest.save_upload(filename, data)
        meta_files.append({"name": saved["name"], "size": saved["size"], "ext": ext})

        if ext in ingest.VIDEO_EXT:
            video_items.append(saved)
        else:
            saved_items.append(saved)
            if saved["ext"] in ingest.TEXT_EXT:
                text_parts.append(ingest.read_text(saved["path"]))

    if not saved_items and not video_items:
        raise HTTPException(400, "没有可用的文件")

    content = "\n\n".join(p for p in text_parts if p).strip()

    # 视频：本体留着可播放，另外抽关键帧当图片
    video_meta_list: list[dict] = []
    for video in video_items:
        info = ingest.video_meta(video["path"])
        frames = ingest.extract_keyframes(video["path"])
        for frame in frames:
            saved_items.append(frame)
        video_meta_list.append(
            {
                "name": video["name"],
                "url": video["url"],
                "size": video["size"],
                "duration": info.get("duration"),
                "width": info.get("width"),
                "height": info.get("height"),
                "frames": len(frames),
            }
        )

    media_rows: list[MemoryMedia] = []
    for index, saved in enumerate(saved_items):
        caption = saved["name"]
        if saved.get("at_second") is not None:
            caption = f"{saved['name']} · 第 {saved['at_second']} 秒"
        # 每张图自己的拍摄时间：一次上传里跨了几天，就靠它把攻略拆成几天
        captured = None
        if saved["ext"] in ingest.IMAGE_EXT:
            try:
                captured = ingest.image_meta(saved["path"]).get("taken_at")
            except Exception:
                captured = None
        media_rows.append(
            MemoryMedia(
                memory_id=memory_id,
                url=saved["url"],
                caption=caption,
                sort=index,
                captured_at=(str(captured)[:19] if captured else None),
            )
        )
    for index, video in enumerate(video_items):
        media_rows.append(
            MemoryMedia(
                memory_id=memory_id,
                url=video["url"],
                caption=f"{video['name']}（视频）",
                sort=len(saved_items) + index,
            )
        )

    images = [s for s in saved_items if s["ext"] in ingest.IMAGE_EXT]
    cover = images[0]["url"] if images else (video_items[0]["url"] if video_items else None)

    if video_items:
        source_type = "video"
    elif images:
        source_type = "photo"
    else:
        source_type = "text"

    raw_name = video_items[0]["name"] if video_items else (saved_items[0]["name"] if saved_items else "untitled")
    memory = Memory(
        id=memory_id,
        title=ingest.guess_title(raw_name, content),
        summary="",
        # 先落一个上传时间，保证任何记录都能出现在时间线里；analyze 会用 EXIF 覆盖
        happened_at=datetime.now().isoformat(timespec="seconds"),
        time_precision="unknown",
        source_type=source_type,
        cover=cover,
        media_count=len(media_rows),
        ai_status="pending",
        confidence=0.0,
        ai_generated=False,
        tags="[]",
        user_id=viewer.id if viewer else "local",
        visibility=visibility if visibility in ("private", "friends", "public") else "friends",
    )

    db.add(memory)
    for row in media_rows:
        db.add(row)
    db.commit()
    db.refresh(memory)

    draft = _draft(
        memory,
        media_rows[0] if media_rows else None,
        {
            "files": meta_files,
            "count": len(meta_files),
            "filename": meta_files[0]["name"] if meta_files else None,
            "size": sum(f["size"] for f in meta_files),
            "kind": source_type,
            "videos": video_meta_list,
            "photos": [{"url": s["url"], "name": s["name"]} for s in images][:12],
        },
        {"duplicate": bool(saved_items) and all(s["duplicate"] for s in saved_items)},
    )
    draft["media"] = [
        {"id": row.id, "url": row.url, "caption": row.caption, "sort": row.sort, "kind": _media_kind(row.url)}
        for row in media_rows
    ]
    return draft


@router.get("/pending-memories")
def list_pending(db: Session = Depends(get_db)):
    """待分析列表：上传了但还没跑 AI 的记忆（跳过的那些）"""
    rows = db.scalars(
        select(Memory).where(Memory.ai_status == "pending").order_by(Memory.created_at.desc())
    ).all()

    items = []
    for memory in rows:
        media = db.scalar(
            select(MemoryMedia).where(MemoryMedia.memory_id == memory.id).order_by(MemoryMedia.sort)
        )
        size = None
        if media and media.url.startswith("/media/uploads/"):
            path = ingest.UPLOAD_DIR / media.url.split("/")[-1]
            if path.exists():
                size = path.stat().st_size
        items.append(
            {
                "id": memory.id,
                "title": memory.title,
                "cover": media.url if media else None,
                "filename": media.caption if media else None,
                "source_type": memory.source_type,
                "created_at": memory.created_at.isoformat(timespec="seconds") if memory.created_at else None,
                "happened_at": memory.happened_at,
                "size": size,
            }
        )
    return {"count": len(items), "items": items}


class AnalyzeBody(BaseModel):
    notes: str | None = None


@router.post("/memories/{memory_id}/analyze")
def analyze_memory(
    memory_id: str,
    style: str = Query(llm.DEFAULT_STYLE, description="写作风格：brief / diary / prose / warm / humor"),
    payload: AnalyzeBody | None = None,
    db: Session = Depends(get_db),
):
    """分析：读取真实元数据（EXIF / 文本 / 文件信息）并写回数据库；
    配置 DeepSeek 时会**把所有照片一起**交给模型看图；用户填的要点优先采纳"""
    memory = db.get(Memory, memory_id)
    if not memory:
        raise HTTPException(404, "记忆不存在")

    notes = (payload.notes or "").strip() if payload else ""

    rows = db.scalars(
        select(MemoryMedia).where(MemoryMedia.memory_id == memory_id).order_by(MemoryMedia.sort)
    ).all()
    primary = rows[0] if rows else None
    meta: dict = {"filename": primary.caption if primary else None, "media_count": len(rows)}
    content = memory.content or ""

    # 收集所有可用的照片（含视频抽出来的关键帧）
    image_paths: list[Path] = []
    video_infos: list[dict] = []
    for row in rows:
        stored = _resolve_media(row.url)
        if not stored:
            continue
        suffix = stored.suffix.lower()
        if suffix in ingest.IMAGE_EXT:
            image_paths.append(stored)
        elif suffix in ingest.VIDEO_EXT:
            info = ingest.video_meta(stored)
            video_infos.append({"name": row.caption, **info})
        elif suffix in ingest.TEXT_EXT and not content:
            content = ingest.read_text(stored)

    # 主图的元数据（尺寸/EXIF）仍然取第一张
    if image_paths:
        meta.update(ingest.image_meta(image_paths[0]))
    if primary and primary.url.startswith("/media/uploads/"):
        stored = ingest.UPLOAD_DIR / primary.url.split("/")[-1]
        if stored.exists():
            meta["size"] = stored.stat().st_size

    # 时间：正文/要点里的日期 > EXIF > 上传时间兜底（保证记录一定能进时间线）
    happened_at = None
    precision = "unknown"
    time_source = "fallback"
    if notes:
        happened_at, precision = ingest.find_date_in_text(notes)
        if happened_at:
            time_source = "notes"
    if not happened_at and content:
        happened_at, precision = ingest.find_date_in_text(content)
        if happened_at:
            time_source = "notes"
    if not happened_at:
        happened_at = meta.get("taken_at")
        precision = "exact" if happened_at else "unknown"
        if happened_at:
            time_source = "exif"
    if not happened_at:
        happened_at = datetime.now().isoformat(timespec="seconds")
        precision = "unknown"
        time_source = "fallback"
        meta["time_fallback"] = True

    # 地点：有 GPS 就匹配最近的已知地点（城市级）
    location_id = None
    place_source = "missing"
    if meta.get("latitude") is not None and meta.get("longitude") is not None:
        best, best_distance = None, 1.5  # 约 150km 内视为同一城市
        for loc in db.scalars(select(Location)):
            if loc.latitude is None or loc.longitude is None:
                continue
            distance = ((loc.latitude - meta["latitude"]) ** 2 + (loc.longitude - meta["longitude"]) ** 2) ** 0.5
            if distance < best_distance:
                best, best_distance = loc, distance
        if best:
            location_id = best.id
            place_source = "exif"
            meta["location_guess"] = best.name

    memory.content = content or memory.content
    memory.happened_at = happened_at or memory.happened_at
    memory.time_precision = precision
    memory.location_id = location_id or memory.location_id

    kind = "video" if video_infos else ("photo" if image_paths else "text")
    ai_fields = llm.generate_memory_fields(
        {
            "kind": kind,
            "photo_count": len(image_paths),
            "user_notes": notes or None,
            "filename": primary.caption if primary else None,
            "taken_at": happened_at,
            "time_precision": precision,
            "camera": meta.get("camera"),
            "resolution": f"{meta.get('width')}×{meta.get('height')}" if meta.get("width") else None,
            "gps": [meta.get("latitude"), meta.get("longitude")]
            if meta.get("latitude") is not None
            else None,
            "location": meta.get("location_guess"),
            "video": video_infos[0] if video_infos else None,
            "text": content[:800] if content else None,
        },
        image_paths=image_paths[: llm.MAX_IMAGES],
        style=style,
    )

    detected_persons: list[dict] = []
    person_question: str | None = None

    if ai_fields:
        memory.title = ai_fields["title"]
        memory.summary = ai_fields["summary"]
        memory.tags = json.dumps(ai_fields["tags"], ensure_ascii=False)
        memory.emotion = ai_fields.get("emotion") or memory.emotion
        memory.ai_generated = True
        memory.confidence = 0.92 if ai_fields.get("saw_image") else 0.85
        style_name = ai_fields.get("style_name", "")
        looked = ai_fields.get("image_count") or 0
        if kind == "video":
            ai_desc = f"AI 看过 {looked} 张关键画面（视频）· {style_name}风格"
        elif looked > 1:
            ai_desc = f"AI 逐张看过 {looked} 张照片 · {style_name}风格"
        elif looked == 1:
            ai_desc = f"AI 看图理解 · {style_name}风格"
        else:
            ai_desc = f"AI 生成文案 · {style_name}风格"
        if ai_fields.get("scene"):
            meta["scene"] = ai_fields["scene"]

        # AI 判断出来的地点：没有 GPS 时用它补地点，并顺手落地成一条地点记录
        if ai_fields.get("place") and not memory.location_id:
            loc = _location_from_place(db, ai_fields["place"])
            if loc:
                memory.location_id = loc.id
                place_source = "ai"
                meta["location_guess"] = loc.name
                meta["place_source"] = "ai"
        if ai_fields.get("trip"):
            meta["trip"] = ai_fields["trip"]

        # 花费明细 / 交通 / 住宿 / 提醒：写进记忆，详情页按攻略版式展示
        if ai_fields.get("costs"):
            memory.cost_json = json.dumps(ai_fields["costs"], ensure_ascii=False)
        if ai_fields.get("transport"):
            memory.transport_info = ai_fields["transport"]
        if ai_fields.get("stay"):
            memory.stay_info = ai_fields["stay"]
        if ai_fields.get("tips"):
            memory.tips = ai_fields["tips"]

        # 识别出来的人：必须在原文里真的出现过，绝不接受模型自己编的名字
        source_text = f"{notes}\n{content}"
        proposed = ai_fields.get("persons") or []
        accepted = [p for p in proposed if p.get("name") and p["name"] in source_text]
        if proposed and not accepted:
            rejected = "、".join(p.get("name", "") for p in proposed)
            print(f"[person] 丢弃了原文里没有的名字：{rejected}")
            meta["persons_rejected"] = rejected
        detected_persons = _ensure_persons(db, accepted, source_text)
        if detected_persons:
            db.execute(delete(MemoryPerson).where(MemoryPerson.memory_id == memory_id))
            # 间接关系的人，顺手把关系锚点也挂到这条记忆上，人物图里才连得起来
            link_ids = {p["id"] for p in detected_persons}
            link_ids.update(p["via_id"] for p in detected_persons if p.get("via_id"))
            for pid in link_ids:
                db.add(MemoryPerson(memory_id=memory_id, person_id=pid))
                if memory.cover:
                    row = db.get(Person, pid)
                    if row and not row.avatar:
                        row.avatar = memory.cover
            meta["persons_source"] = "来自你写的要点"
        else:
            person_question = ai_fields.get("person_question")
            if not person_question and image_paths:
                person_question = "画面里如果还有别人，可以在「要点模板」里写下他们是谁，我再挂到人物里。"
            if person_question:
                meta["person_question"] = person_question
    else:
        memory.title = ingest.guess_title(primary.caption if primary else memory.title, content, memory.happened_at)
        memory.summary = ingest.guess_summary(content, meta)
        memory.tags = json.dumps(ingest.guess_tags(primary.caption if primary else memory.title, content), ensure_ascii=False)
        memory.ai_generated = False
        memory.confidence = 0.55 if meta.get("has_exif") else 0.35
        ai_desc = (
            "已按文件信息与文字内容推断"
            if not llm.available()
            else "AI 分析暂时不可用，已改用基础推断"
        )

    # ---- 地点兜底：GPS 和 AI 都没给出结果时，随便给一个像样的地方 ----
    # 演示里宁可有一个「明确标着是猜的」地点，也不要留一个上不了地图的空点
    if not memory.location_id:
        guess = _random_guess_place(db)
        if guess:
            memory.location_id = guess.id
            place_source = "random"
            meta["location_guess"] = guess.name
            meta["place_source"] = "random"

    # ---- 每格数据从哪来的：前端状态栏靠这个标「AI 看图 / 账单 / AI 补 / 等你补」----
    try:
        saved_costs = json.loads(memory.cost_json or "[]")
    except Exception:
        saved_costs = []
    if not isinstance(saved_costs, list):
        saved_costs = []
    costs_from = str((ai_fields or {}).get("costs_from") or "guess").lower()
    facts = {
        "place": {
            "source": place_source,
            "confidence": round(float(memory.confidence or 0), 2),
        },
        "time": {"source": time_source, "precision": precision},
        "persons": {
            "source": "notes" if detected_persons else "none",
            "count": len(detected_persons),
        },
        "costs": {
            "source": ("bill" if costs_from == "bill" else "guess") if saved_costs else "none",
            "count": len(saved_costs),
        },
        "transport": {"source": "ai" if getattr(memory, "transport_info", None) else "none"},
        "stay": {"source": "ai" if getattr(memory, "stay_info", None) else "none"},
        "tips": {"source": "ai" if getattr(memory, "tips", None) else "none"},
        "video": bool(video_infos),
        "image_count": len(image_paths),
    }

    memory.ai_status = "processing"
    db.commit()
    db.refresh(memory)

    steps = [
        {
            "name": "读取元数据",
            "detail": f"{len(image_paths)} 张画面 · EXIF {'已找到' if meta.get('has_exif') else '不存在'}"
            + (f" · {meta.get('width')}×{meta.get('height')}" if meta.get("width") else ""),
        },
        {"name": "理解素材", "detail": ai_desc},
        {
            "name": "提取实体",
            "detail": f"时间 {memory.happened_at or '未识别'} · 地点 {meta.get('location_guess') or '未识别'}",
        },
        {"name": "生成文案", "detail": memory.title},
    ]

    draft = _draft(memory, primary, meta, {})
    draft["notes"] = notes or None
    draft["person_ids"] = [p["id"] for p in detected_persons]
    draft["persons"] = detected_persons
    draft["person_question"] = person_question
    draft["facts"] = facts
    # 前端要拿这两个显示「AI 判断你是在哪旅行」
    draft["place"] = meta.get("location_guess")
    draft["trip"] = meta.get("trip")
    return {
        "draft": draft,
        "steps": steps,
        "image_count": len(image_paths),
        "video": bool(video_infos),
        "persons": detected_persons,
        "person_question": person_question,
        "place": meta.get("location_guess"),
        "trip": meta.get("trip"),
        "facts": facts,
    }


@router.patch("/memories/{memory_id}")
def update_memory(memory_id: str, payload: MemoryUpdate, db: Session = Depends(get_db)):
    """用户确认/修正后保存"""
    memory = db.get(Memory, memory_id)
    if not memory:
        raise HTTPException(404, "记忆不存在")

    if payload.title is not None:
        memory.title = payload.title
    if payload.summary is not None:
        memory.summary = payload.summary
    if payload.content is not None:
        memory.content = payload.content
    if payload.happened_at is not None:
        memory.happened_at = payload.happened_at
    if payload.time_precision is not None:
        memory.time_precision = payload.time_precision
    if payload.location_id is not None:
        memory.location_id = payload.location_id
    if payload.tags is not None:
        memory.tags = json.dumps(payload.tags, ensure_ascii=False)
    if payload.emotion is not None:
        memory.emotion = payload.emotion
    if payload.importance is not None:
        memory.importance = payload.importance
    if payload.visibility in ("private", "friends", "public"):
        memory.visibility = payload.visibility
    if payload.costs is not None:
        memory.cost_json = json.dumps(payload.costs, ensure_ascii=False)
    if payload.transport_info is not None:
        memory.transport_info = payload.transport_info.strip() or None
    if payload.stay_info is not None:
        memory.stay_info = payload.stay_info.strip() or None
    if payload.tips is not None:
        memory.tips = payload.tips.strip() or None
    memory.ai_status = payload.ai_status or "confirmed"

    if payload.person_ids is not None:
        db.execute(delete(MemoryPerson).where(MemoryPerson.memory_id == memory_id))
        for pid in payload.person_ids:
            db.add(MemoryPerson(memory_id=memory_id, person_id=pid))

    db.commit()
    db.refresh(memory)

    media = db.scalar(select(MemoryMedia).where(MemoryMedia.memory_id == memory_id).order_by(MemoryMedia.sort))
    return _draft(memory, media, {}, {})


class DayGroup(BaseModel):
    urls: list[str] = []


class AnalyzeDaysBody(BaseModel):
    days: list[DayGroup] = []


@router.post("/memories/{memory_id}/analyze-days")
def analyze_days(
    memory_id: str,
    body: AnalyzeDaysBody,
    style: str = Query(llm.DEFAULT_STYLE),
    db: Session = Depends(get_db),
):
    """按用户分好的天，各看各的照片，各写一段 —— 这样第 2、3 天不会是空的"""
    memory = db.get(Memory, memory_id)
    if not memory:
        raise HTTPException(404, "记忆不存在")
    rows = {
        row.url: row
        for row in db.scalars(select(MemoryMedia).where(MemoryMedia.memory_id == memory_id))
    }
    out: list[dict] = []
    for group in body.days:
        paths: list[Path] = []
        for url in group.urls:
            row = rows.get(url)
            if not row:
                continue
            stored = _resolve_media(row.url)
            if stored and stored.suffix.lower() in ingest.IMAGE_EXT:
                paths.append(stored)
        fields = llm.generate_memory_fields(
            {
                "kind": "photo",
                "photo_count": len(paths),
                "user_notes": None,
                "taken_at": memory.happened_at,
                "location": None,
            },
            image_paths=paths[: llm.MAX_IMAGES],
            style=style,
        ) if paths else None
        out.append(
            {
                "title": (fields or {}).get("title"),
                "content": (fields or {}).get("summary"),
                "transport": (fields or {}).get("transport"),
                "cost": None,
                "costs": (fields or {}).get("costs") or [],
            }
        )
    return {"days": out}


@router.delete("/memories/{memory_id}")
def delete_memory(memory_id: str, db: Session = Depends(get_db)):
    """删除记忆（同时清掉媒体记录与已上传的文件）"""
    memory = db.get(Memory, memory_id)
    if not memory:
        raise HTTPException(404, "记忆不存在")

    medias = db.scalars(select(MemoryMedia).where(MemoryMedia.memory_id == memory_id)).all()
    for item in medias:
        if item.url.startswith("/media/uploads/"):
            path = ingest.UPLOAD_DIR / item.url.split("/")[-1]
            if path.exists():
                path.unlink(missing_ok=True)

    db.delete(memory)
    db.commit()
    return {"deleted": memory_id}


@router.delete("/memories/{memory_id}/media")
def delete_media_by_url(memory_id: str, url: str, db: Session = Depends(get_db)):
    """按素材地址删（前端最稳的一条路：url 一定拿得到，不用管 id）"""
    row = db.scalar(
        select(MemoryMedia).where(MemoryMedia.memory_id == memory_id, MemoryMedia.url == url)
    )
    memory = db.get(Memory, memory_id)
    if not row or not memory:
        raise HTTPException(404, "素材不存在")

    db.delete(row)
    db.flush()

    # 同一个文件被多行共用时，只有最后一个引用才真删文件
    if url.startswith("/media/uploads/"):
        still_used = db.scalar(select(func.count()).select_from(MemoryMedia).where(MemoryMedia.url == url))
        if not still_used:
            (ingest.UPLOAD_DIR / url.split("/")[-1]).unlink(missing_ok=True)

    rest = db.scalars(
        select(MemoryMedia).where(MemoryMedia.memory_id == memory_id).order_by(MemoryMedia.sort)
    ).all()
    memory.media_count = len(rest)

    def usable(u: str | None) -> bool:
        if not u:
            return False
        if u.startswith("/media/uploads/"):
            return (ingest.UPLOAD_DIR / u.split("/")[-1]).exists()
        return True

    if memory.cover == url or not usable(memory.cover):
        pick = next((r for r in rest if usable(r.url) and r.url.lower().endswith((".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"))), None)
        pick = pick or next((r for r in rest if usable(r.url)), None)
        memory.cover = pick.url if pick else None
    db.commit()

    return {
        "deleted": url,
        "media_count": len(rest),
        "cover": memory.cover,
        "media": [
            {"id": r.id, "url": r.url, "caption": r.caption, "sort": r.sort, "kind": _media_kind(r.url)}
            for r in rest
        ],
    }


@router.delete("/memories/{memory_id}/media/{media_id}")
def delete_media(memory_id: str, media_id: int, db: Session = Depends(get_db)):
    """删掉这条记忆里的某一个素材（比如视频抽出来的一张不合适的画面）"""
    row = db.get(MemoryMedia, media_id)
    memory = db.get(Memory, memory_id)
    if not row or not memory or row.memory_id != memory_id:
        raise HTTPException(404, "素材不存在")

    removed_url = row.url
    db.delete(row)
    db.flush()

    # 同一个文件可能被多行共用（内容去重），只有没人再用了才真的删掉
    if removed_url.startswith("/media/uploads/"):
        still_used = db.scalar(
            select(func.count()).select_from(MemoryMedia).where(MemoryMedia.url == removed_url)
        )
        if not still_used:
            path = ingest.UPLOAD_DIR / removed_url.split("/")[-1]
            path.unlink(missing_ok=True)

    rest = db.scalars(
        select(MemoryMedia).where(MemoryMedia.memory_id == memory_id).order_by(MemoryMedia.sort)
    ).all()
    memory.media_count = len(rest)

    def usable(url: str | None) -> bool:
        if not url:
            return False
        if url.startswith("/media/uploads/"):
            return (ingest.UPLOAD_DIR / url.split("/")[-1]).exists()
        return True

    # 封面没了、或者指向一个已经被删掉的文件，就换一张还能用的
    if memory.cover == removed_url or not usable(memory.cover):
        first_image = next(
            (r for r in rest if usable(r.url) and r.url.lower().endswith((".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"))),
            None,
        )
        picked = first_image or next((r for r in rest if usable(r.url)), None)
        memory.cover = picked.url if picked else None
    db.commit()

    return {
        "deleted": media_id,
        "media_count": len(rest),
        "cover": memory.cover,
        "media": [
            {"id": r.id, "url": r.url, "caption": r.caption, "sort": r.sort, "kind": _media_kind(r.url)}
            for r in rest
        ],
    }
