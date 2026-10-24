"""小拾 AI：基于 MySQL 里的真实记忆回答问题（DeepSeek + 简单检索）"""
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

import llm
from db import get_db
from models import Location, Memory, MemoryPerson, Person

router = APIRouter(prefix="/api", tags=["小拾 AI"])

_STOPWORDS = {
    "什么", "怎么", "哪些", "哪个", "什么时候", "有没有", "我的", "你的", "帮我", "请问",
    "可以", "能不能", "告诉", "关于", "有关", "一下", "这个", "那个", "他们", "我们",
}


class QuestionIn(BaseModel):
    question: str


def _keywords(question: str) -> list[str]:
    """从问题里抽关键词：中文 2-4 字滑窗 + 英文/数字词"""
    words: set[str] = set()

    for token in re.findall(r"[A-Za-z0-9]{2,}", question):
        words.add(token.lower())

    chinese = re.sub(r"[^\u4e00-\u9fa5]+", " ", question)
    for chunk in chinese.split():
        for size in (4, 3, 2):
            for i in range(len(chunk) - size + 1):
                word = chunk[i : i + size]
                if word in _STOPWORDS:
                    continue
                words.add(word)

    return [w for w in words if w not in _STOPWORDS]


def _pick_relevant(question: str, db: Session, limit: int = 10) -> list[dict]:
    """关键词打分挑出最相关的记忆；没命中就给最近的几条（这样寒暄类问题也有上下文）"""
    rows = db.scalars(select(Memory).order_by(Memory.happened_at.desc()).limit(200)).all()
    keywords = _keywords(question)

    person_names = {
        p.id: p.name for p in db.scalars(select(Person))
    }
    location_names = {
        loc.id: loc.name for loc in db.scalars(select(Location))
    }
    person_links: dict[str, list[str]] = {}
    for link in db.scalars(select(MemoryPerson)):
        person_links.setdefault(link.memory_id, []).append(link.person_id)

    scored: list[tuple[int, Memory, dict]] = []
    for memory in rows:
        people = [person_names.get(pid, "") for pid in person_links.get(memory.id, [])]
        place = location_names.get(memory.location_id or "", "")
        haystack = " ".join(
            filter(
                None,
                [
                    memory.title,
                    memory.summary,
                    memory.content,
                    memory.tags,
                    memory.emotion,
                    memory.happened_at,
                    place,
                    " ".join(people),
                ],
            )
        ).lower()

        score = sum(1 for kw in keywords if kw.lower() in haystack)
        payload = {
            "id": memory.id,
            "date": (memory.happened_at or "")[:10],
            "title": memory.title,
            "summary": memory.summary,
            "place": place or None,
            "people": [p for p in people if p and p != "我"],
            "tags": re.findall(r'"([^"]+)"', memory.tags or ""),
            "emotion": memory.emotion,
        }
        scored.append((score, memory, payload))

    hits = [item for item in scored if item[0] > 0]
    hits.sort(key=lambda x: (-x[0], x[1].happened_at or ""), reverse=False)
    chosen = hits[:limit]
    if not chosen:
        chosen = scored[:limit]

    return [payload for _, _, payload in chosen]


@router.post("/assistant/query")
def assistant_query(payload: QuestionIn, db: Session = Depends(get_db)):
    question = (payload.question or "").strip()
    if not question:
        raise HTTPException(400, "问题不能为空")

    memories = _pick_relevant(question, db)
    result = llm.answer_memory_question(question, memories)

    if not result:
        # 未配置 Key 或调用失败 → 让前端回退到本地规则匹配
        return {
            "answer": None,
            "evidenceMemoryIds": [],
            "fallback": True,
            "memoryCount": len(memories),
        }

    return {
        "answer": result["answer"],
        "evidenceMemoryIds": result["evidence"],
        "model": result["model"],
        "matchedMemories": len(memories),
        "fallback": False,
    }
