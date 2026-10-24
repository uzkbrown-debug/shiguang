"""配音：edge-tts 生成 mp3 + 词级时间轴（用于字幕同步）"""
import asyncio
import re

import edge_tts

from config import AUDIO_DIR, TTS_RATE, TTS_VOICE, TTS_VOLUME

# 中文数字读法优化（避免"2018"被读成"两千零一十八"这类问题）
_YEAR_RE = re.compile(r"(?<!\d)((?:19|20)\d{2})(?!\d)")
_DIGITS = "零一二三四五六七八九"


def _year_to_cn(match: re.Match) -> str:
    year = match.group(1)
    return "".join(_DIGITS[int(c)] for c in year) + "年"


def normalize_text(text: str) -> str:
    """把文本处理成更适合朗读的形式"""
    text = text.strip()
    text = _YEAR_RE.sub(_year_to_cn, text)
    text = text.replace("——", "，").replace("…", "。").replace("~", "，").replace("～", "，")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{2,}", "\n", text)
    return text


async def synthesize(
    text: str,
    out_name: str,
    voice: str | None = None,
    rate: str | None = None,
    volume: str | None = None,
    boundary: str = "WordBoundary",
) -> dict:
    """把一段旁白合成为音频，返回文件地址 + 时间轴（词级或句级）"""
    spoken = normalize_text(text)
    out_path = AUDIO_DIR / out_name
    out_path.parent.mkdir(parents=True, exist_ok=True)

    communicate = edge_tts.Communicate(
        spoken,
        voice or TTS_VOICE,
        rate=rate or TTS_RATE,
        volume=volume or TTS_VOLUME,
        boundary=boundary,  # WordBoundary 词级 / SentenceBoundary 句级
    )

    subtitles: list[dict] = []
    with open(out_path, "wb") as f:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] in ("WordBoundary", "SentenceBoundary"):
                # offset / duration 单位是 100 纳秒
                subtitles.append(
                    {
                        "text": chunk["text"],
                        "start_ms": round(chunk["offset"] / 10000),
                        "duration_ms": round(chunk["duration"] / 10000),
                        "level": "word" if chunk["type"] == "WordBoundary" else "sentence",
                    }
                )

    duration_ms = 0
    if subtitles:
        last = subtitles[-1]
        duration_ms = last["start_ms"] + last["duration_ms"]

    return {
        "audio_url": f"/media/audio/{out_name}",
        "text": spoken,
        "subtitles": subtitles,
        "duration_ms": duration_ms,
    }


def synthesize_sync(text: str, out_name: str, **kwargs) -> dict:
    return asyncio.run(synthesize(text, out_name, **kwargs))


if __name__ == "__main__":
    demo = "二零二三年春天，我第一次去东京。落地成田的那个下午在下雨，拖着箱子换了两趟电车，到住处时天已经黑了。"
    result = synthesize_sync(demo, "_demo.mp3")
    print("audio:", result["audio_url"])
    print("duration_ms:", result["duration_ms"])
    print("subtitle segments:", len(result["subtitles"]))
    for item in result["subtitles"][:6]:
        print("  ", item)
