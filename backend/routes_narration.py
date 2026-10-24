"""配音故事：把一条记忆写成分幕旁白 → 逐幕合成语音 → 存进 stories / story_scenes"""
import json
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

import ingest
import llm
import tts
from db import get_db
from models import Location, Memory, MemoryMedia, Story, StoryScene

router = APIRouter(prefix="/api", tags=["配音故事"])

# 每幕一张配图，最多 5 幕
MAX_SCENES = 5


def _story_dict(story: Story, scenes: list[StoryScene]) -> dict:
    return {
        "id": story.id,
        "title": story.title,
        "subtitle": story.subtitle,
        "cover": story.cover,
        "style": story.style,
        "status": story.status,
        "voice": story.voice,
        "created_at": story.created_at.isoformat(timespec="seconds") if story.created_at else None,
        "duration_ms": sum(s.duration_ms or 0 for s in scenes),
        "scenes": [
            {
                "id": s.id,
                "sort": s.sort,
                "narration": s.narration,
                "image_url": s.image_url,
                "audio_url": s.audio_url,
                "duration_ms": s.duration_ms,
                "subtitles": json.loads(s.subtitle_json or "[]"),
                "memory_ids": json.loads(s.memory_ids or "[]"),
            }
            for s in scenes
        ],
    }


def _existing_story(db: Session, memory_id: str) -> Story | None:
    """一条记忆只保留一个配音故事，重做时覆盖"""
    return db.scalar(
        select(Story).where(Story.subtitle.like(f"%{memory_id}%")).order_by(Story.created_at.desc())
    )


@router.post("/memories/{memory_id}/narration")
def create_narration(
    memory_id: str,
    style: str = Query(llm.DEFAULT_STYLE),
    scenes_wanted: int = Query(3, alias="scenes", ge=2, le=MAX_SCENES),
    db: Session = Depends(get_db),
):
    """为一条记忆生成配音故事：AI 写分幕旁白 → edge-tts 配音 + 字幕 → 落库"""
    memory = db.get(Memory, memory_id)
    if not memory:
        raise HTTPException(404, "记忆不存在")

    media = db.scalars(
        select(MemoryMedia).where(MemoryMedia.memory_id == memory_id).order_by(MemoryMedia.sort)
    ).all()
    images = [m.url for m in media if m.url.lower().endswith((".jpg", ".jpeg", ".png", ".webp", ".gif"))]

    location = db.get(Location, memory.location_id) if memory.location_id else None
    wanted = min(scenes_wanted, max(2, len(images))) if images else min(scenes_wanted, 4)

    info = {
        "title": memory.title,
        "summary": memory.summary,
        "content": (memory.content or "")[:1500],
        "taken_at": memory.happened_at,
        "time_precision": memory.time_precision,
        "location": location.name if location else None,
        "tags": json.loads(memory.tags or "[]"),
        "emotion": memory.emotion,
        "photo_count": len(images),
    }

    narrations, by_ai = llm.write_narration_scenes(info, wanted)
    if not narrations:
        raise HTTPException(500, "旁白生成失败，请稍后再试")

    # 覆盖旧故事
    old = _existing_story(db, memory_id)
    if old:
        db.delete(old)
        db.commit()

    story = Story(
        id=f"story_{uuid.uuid4().hex[:10]}",
        title=memory.title or "一段记忆",
        subtitle=memory_id,
        cover=images[0] if images else memory.cover,
        style=style if style in llm.STYLES else llm.DEFAULT_STYLE,
        status="voiced",
    )
    db.add(story)

    voice_error: str | None = None
    for index, narration in enumerate(narrations):
        scene = StoryScene(
            id=f"scn_{uuid.uuid4().hex[:10]}",
            story_id=story.id,
            sort=index,
            narration=narration,
            image_url=images[index % len(images)] if images else memory.cover,
            memory_ids=json.dumps([memory_id]),
        )
        try:
            clip = tts.synthesize_sync(narration, f"{story.id}_{index}.mp3")
            scene.audio_url = clip["audio_url"]
            scene.subtitle_json = json.dumps(clip["subtitles"], ensure_ascii=False)
            scene.duration_ms = clip["duration_ms"]
        except Exception as exc:  # 配音失败也要保住文字，前端仍能读字幕
            print("[TTS] failed:", exc)
            scene.audio_url = None
            voice_error = str(exc)
        db.add(scene)

    if voice_error:
        story.status = "draft"
    db.commit()
    db.refresh(story)

    rows = db.scalars(
        select(StoryScene).where(StoryScene.story_id == story.id).order_by(StoryScene.sort)
    ).all()
    result = _story_dict(story, list(rows))
    result["ai_generated"] = by_ai
    result["voice_error"] = voice_error
    return result


@router.get("/memories/{memory_id}/narration")
def get_narration(memory_id: str, db: Session = Depends(get_db)):
    """读取已生成的配音故事（没生成过返回 null）"""
    story = _existing_story(db, memory_id)
    if not story:
        return {"story": None}
    rows = db.scalars(
        select(StoryScene).where(StoryScene.story_id == story.id).order_by(StoryScene.sort)
    ).all()
    return {"story": _story_dict(story, list(rows))}


@router.delete("/stories/{story_id}")
def delete_story(story_id: str, db: Session = Depends(get_db)):
    story = db.get(Story, story_id)
    if not story:
        raise HTTPException(404, "故事不存在")
    rows = db.scalars(select(StoryScene).where(StoryScene.story_id == story_id)).all()
    for scene in rows:
        if scene.audio_url and scene.audio_url.startswith("/media/audio/"):
            path: Path = ingest.UPLOAD_DIR.parent / "audio" / scene.audio_url.split("/")[-1]
            if path.exists():
                path.unlink(missing_ok=True)
    db.delete(story)
    db.commit()
    return {"deleted": story_id}
