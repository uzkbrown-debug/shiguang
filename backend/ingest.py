"""文件入库：保存文件、提取元数据（EXIF / 文本 / 视频抽帧）、生成草稿字段"""
import hashlib
import re
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

from PIL import Image

from config import FFMPEG_PATH, MEDIA_DIR, VIDEO_KEYFRAMES

UPLOAD_DIR = MEDIA_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_BYTES = 20 * 1024 * 1024
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}
TEXT_EXT = {".txt", ".md", ".markdown"}
VIDEO_EXT = {".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"}

# EXIF tag id
_TAG_DATETIME_ORIGINAL = 36867
_TAG_DATETIME = 306
_TAG_MAKE = 271
_TAG_MODEL = 272
_TAG_GPS = 34853

# 文件名里这些形式说明没有语义，需要另取标题
_MEANINGLESS = re.compile(r"^(img|dsc|image|photo|screenshot|微信图片|wx_?|mmexport|screenshot_)[-_0-9]*$", re.I)
_DATE_PATTERNS = [
    (re.compile(r"(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})"), True),
    (re.compile(r"(20\d{2})[-/年](\d{1,2})"), False),
    (re.compile(r"(20\d{2})"), False),
]


def save_upload(filename: str, data: bytes) -> dict:
    """按内容哈希保存文件（同内容天然去重）"""
    ext = Path(filename).suffix.lower()
    digest = hashlib.sha256(data).hexdigest()
    stored_name = f"{digest[:16]}{ext}"
    path = UPLOAD_DIR / stored_name
    existed = path.exists()
    if not existed:
        path.write_bytes(data)
    return {
        "path": path,
        "url": f"/media/uploads/{stored_name}",
        "ext": ext,
        "hash": digest,
        "size": len(data),
        "name": Path(filename).name,
        "duplicate": existed,
    }


def _gps_to_degrees(coord, ref: str | None) -> float | None:
    try:
        degrees, minutes, seconds = (float(x) for x in coord)
    except Exception:
        return None
    value = degrees + minutes / 60 + seconds / 3600
    if ref in ("S", "W"):
        value = -value
    return round(value, 6)


def _parse_exif_datetime(raw: str) -> str | None:
    for fmt in ("%Y:%m:%d %H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(raw.strip(), fmt).isoformat(timespec="seconds")
        except Exception:
            continue
    return None


def image_meta(path: Path) -> dict:
    """图片尺寸 + EXIF 拍摄时间 + GPS + 机型"""
    meta: dict = {
        "width": None,
        "height": None,
        "taken_at": None,
        "latitude": None,
        "longitude": None,
        "camera": None,
        "has_exif": False,
    }
    try:
        with Image.open(path) as im:
            meta["width"], meta["height"] = im.size
            exif = im.getexif()
            if not exif:
                return meta
            meta["has_exif"] = True
            raw_dt = exif.get(_TAG_DATETIME_ORIGINAL) or exif.get(_TAG_DATETIME)
            if raw_dt:
                meta["taken_at"] = _parse_exif_datetime(str(raw_dt))
            make = str(exif.get(_TAG_MAKE) or "").strip()
            model = str(exif.get(_TAG_MODEL) or "").strip()
            meta["camera"] = f"{make} {model}".strip() or None
            gps = exif.get_ifd(_TAG_GPS)
            if gps:
                meta["latitude"] = _gps_to_degrees(gps.get(2), gps.get(1))
                meta["longitude"] = _gps_to_degrees(gps.get(4), gps.get(3))
    except Exception:
        pass
    return meta


def find_ffmpeg() -> Path | None:
    """找 ffmpeg：先看配置，再看 PATH，最后看常见的安装位置"""
    if FFMPEG_PATH:
        candidate = Path(FFMPEG_PATH)
        if candidate.is_file():
            return candidate
    on_path = shutil.which("ffmpeg")
    if on_path:
        return Path(on_path)
    for guess in (
        Path(__file__).resolve().parent / "tools" / "ffmpeg.exe",
        Path.home() / "tools" / "ffmpeg-npm" / "node_modules" / "@ffmpeg-installer" / "win32-x64" / "ffmpeg.exe",
        Path(r"C:\ffmpeg\bin\ffmpeg.exe"),
    ):
        if guess.is_file():
            return guess
    return None


def _run(cmd: list[str], timeout: int = 180) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd,
        capture_output=True,
        timeout=timeout,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )


def video_meta(path: Path) -> dict:
    """用 ffmpeg 的报错信息里读时长与分辨率（不依赖 ffprobe）"""
    meta: dict = {"duration": None, "width": None, "height": None, "fps": None}
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        return meta
    try:
        out = _run([str(ffmpeg), "-hide_banner", "-i", str(path)]).stderr.decode("utf-8", "ignore")
    except Exception:
        return meta
    match = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)", out)
    if match:
        h, m, s = int(match.group(1)), int(match.group(2)), float(match.group(3))
        meta["duration"] = round(h * 3600 + m * 60 + s, 2)
    stream = re.search(r"Video:.*?(\d{2,5})x(\d{2,5})", out)
    if stream:
        meta["width"], meta["height"] = int(stream.group(1)), int(stream.group(2))
    fps = re.search(r"(\d+(?:\.\d+)?)\s*fps", out)
    if fps:
        meta["fps"] = float(fps.group(1))
    return meta


def extract_keyframes(path: Path, count: int | None = None) -> list[dict]:
    """从视频里挑关键画面：先多抽一批候选，再按"细节够多、彼此不重复"筛出来。
    纯色墙面、地板、糊成一片的过渡帧分数低，会被丢掉，留下来的更像有人有内容的画面。"""
    wanted = max(1, min(20, count or VIDEO_KEYFRAMES))
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        print("[video] 没找到 ffmpeg，跳过硬抽帧")
        return []

    info = video_meta(path)
    duration = info.get("duration") or 0
    tmp_dir = UPLOAD_DIR / f"_frames_{path.stem}"
    tmp_dir.mkdir(parents=True, exist_ok=True)

    # 候选抽 3 倍，给筛选留出余地
    candidates = min(40, wanted * 3)
    if duration > 0:
        fps = max(0.05, candidates / duration)
        vf = f"fps={fps:.4f},scale='min(1280,iw)':-2"
    else:
        vf = f"fps=1/{max(1, candidates)},scale='min(1280,iw)':-2"

    pattern = str(tmp_dir / "f_%03d.jpg")
    try:
        _run(
            [
                str(ffmpeg), "-hide_banner", "-loglevel", "error", "-y",
                "-i", str(path), "-vf", vf, "-frames:v", str(candidates),
                "-q:v", "3", pattern,
            ]
        )
    except Exception as exc:
        print("[video] 抽帧失败:", exc)

    raw_frames = sorted(tmp_dir.glob("f_*.jpg"))
    interval = (duration / len(raw_frames)) if (duration and raw_frames) else 0

    def score_and_print(frame: Path) -> tuple[float, object] | None:
        """分数 = 明暗起伏 + 边缘密度；顺便返回一张 16x16 缩略图用来判重"""
        try:
            from PIL import Image, ImageFilter, ImageStat

            with Image.open(frame) as im:
                gray = im.convert("L")
                small = gray.resize((16, 16))
                thumb = list(small.getdata())
                stat = ImageStat.Stat(gray.resize((256, 144)))
                edges = gray.resize((256, 144)).filter(ImageFilter.FIND_EDGES)
                edge_mean = ImageStat.Stat(edges).mean[0]
                return stat.stddev[0] + edge_mean * 2.2, thumb
        except Exception:
            return None

    scored: list[tuple[float, int, Path, list[int]]] = []
    for index, frame in enumerate(raw_frames):
        result = score_and_print(frame)
        if not result:
            continue
        value, thumb = result
        scored.append((value, index, frame, thumb))

    scored.sort(key=lambda item: -item[0])

    # 只留细节明显够多的：低于最高分 55% 的一律丢掉（纯色墙面、地板、糊片都在这一档）
    floor = (scored[0][0] * 0.55) if scored else 0

    kept: list[tuple[float, int, Path, list[int]]] = []
    for item in scored:
        if len(kept) >= wanted:
            break
        if item[0] < floor:
            continue
        # 和已经选中的太像就跳过（同一秒里的连续画面只留一张）
        duplicate = False
        for chosen in kept:
            diff = sum(abs(a - b) for a, b in zip(item[3], chosen[3])) / len(item[3])
            if diff < 8:
                duplicate = True
                break
        if not duplicate:
            kept.append(item)

    kept.sort(key=lambda item: item[1])  # 按时间顺序还原

    frames: list[dict] = []
    for position, (_, index, frame, _) in enumerate(kept):
        data = frame.read_bytes()
        saved = save_upload(f"frame_{path.stem}_{position:02d}.jpg", data)
        frames.append(
            {
                "path": saved["path"],
                "url": saved["url"],
                "name": saved["name"],
                "size": saved["size"],
                "hash": saved["hash"],
                "ext": ".jpg",
                "duplicate": saved["duplicate"],
                "at_second": round(interval * index, 1) if interval else None,
            }
        )
    shutil.rmtree(tmp_dir, ignore_errors=True)
    print(f"[video] 候选 {len(raw_frames)} 张，筛出 {len(frames)} 张")
    return frames


def read_text(path: Path) -> str:
    for encoding in ("utf-8", "gbk", "utf-16"):
        try:
            # 去掉记事本可能写入的 BOM
            return path.read_text(encoding=encoding).lstrip("\ufeff").strip()
        except Exception:
            continue
    return ""


def find_date_in_text(text: str) -> tuple[str | None, str]:
    """从正文里找日期，返回 (ISO 时间, 精度)"""
    for pattern, full in _DATE_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        groups = match.groups()
        if full and len(groups) >= 3:
            year, month, day = (int(g) for g in groups[:3])
            precision = "day"
        elif len(groups) >= 2:
            year, month = int(groups[0]), int(groups[1])
            day, precision = 1, "month"
        else:
            year, month, day, precision = int(groups[0]), 1, 1, "year"
        try:
            return datetime(year, month, day).isoformat(timespec="seconds"), precision
        except ValueError:
            continue
    return None, "unknown"


_STOPWORDS = {"今天", "然后", "因为", "所以", "我们", "他们", "自己", "一个", "这个", "那个", "什么", "时候", "还是", "就是", "感觉"}


def guess_tags(filename: str, content: str = "") -> list[str]:
    """从文件名与正文里提取候选标签（中文词组 / 英文词）"""
    source = f"{Path(filename).stem} {content[:300]}"
    candidates: list[str] = []

    for word in re.findall(r"[\u4e00-\u9fa5]{2,6}", source):
        if word not in _STOPWORDS and word not in candidates:
            candidates.append(word)
    for word in re.findall(r"[A-Za-z]{3,12}", source):
        lowered = word.lower()
        if lowered not in candidates:
            candidates.append(lowered)
    return candidates[:5]


def guess_title(filename: str, content: str = "", happened_at: str | None = None) -> str:
    # 有正文时优先用正文第一句（比文件名、比整段都更像标题）
    if content:
        first_line = content.splitlines()[0].strip()
        sentence = re.split(r"[。！？!?；;\n]", first_line)[0].strip()
        if len(sentence) >= 4:
            return sentence[:30]

    stem = Path(filename).stem.strip()
    if not _MEANINGLESS.match(stem) and len(stem) >= 2:
        return stem[:60]

    if happened_at:
        return f"{happened_at[:10]} 的一段记忆"
    return "一段未命名的记忆"


def guess_summary(content: str = "", meta: dict | None = None) -> str:
    if content:
        plain = re.sub(r"\s+", " ", content).strip()
        return plain[:80] + ("…" if len(plain) > 80 else "")
    meta = meta or {}
    parts = []
    if meta.get("taken_at"):
        parts.append(f"拍摄于 {meta['taken_at'][:16].replace('T', ' ')}")
    if meta.get("width") and meta.get("height"):
        parts.append(f"{meta['width']}×{meta['height']}")
    if meta.get("camera"):
        parts.append(meta["camera"])
    if meta.get("latitude") is not None:
        parts.append(f"GPS {meta['latitude']}, {meta['longitude']}")
    return "这张照片的元数据：" + "、".join(parts) if parts else "等待补充摘要"
