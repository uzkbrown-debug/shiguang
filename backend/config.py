"""配置：优先读 backend/.env"""
import os
from pathlib import Path
from urllib.parse import quote_plus

BASE_DIR = Path(__file__).resolve().parent


def _load_env_file() -> None:
    env_path = BASE_DIR / ".env"
    if not env_path.exists():
        return
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


_load_env_file()

# MySQL
MYSQL_HOST = os.getenv("MYSQL_HOST", "127.0.0.1")
MYSQL_PORT = int(os.getenv("MYSQL_PORT", "3306"))
MYSQL_USER = os.getenv("MYSQL_USER", "root")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "")
MYSQL_DATABASE = os.getenv("MYSQL_DATABASE", "shiguang")

DATABASE_URL = (
    f"mysql+pymysql://{MYSQL_USER}:{quote_plus(MYSQL_PASSWORD)}"
    f"@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DATABASE}?charset=utf8mb4"
)

# 目录
DATA_DIR = BASE_DIR / "data"
MEDIA_DIR = BASE_DIR / "media"
AUDIO_DIR = MEDIA_DIR / "audio"
for _d in (DATA_DIR, MEDIA_DIR, AUDIO_DIR):
    _d.mkdir(parents=True, exist_ok=True)

# TTS（配音）默认音色
TTS_VOICE = os.getenv("TTS_VOICE", "zh-CN-XiaoxiaoNeural")
TTS_RATE = os.getenv("TTS_RATE", "-8%")
TTS_VOLUME = os.getenv("TTS_VOLUME", "+0%")

# DeepSeek（可选）：配置 API Key 后，「分析」会用真实大模型生成标题/摘要/标签
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

# ffmpeg：上传视频时要靠它抽关键帧。留空则自动找 PATH 上的 ffmpeg
FFMPEG_PATH = os.getenv("FFMPEG_PATH", "")

# 视频关键帧数量（抽多少张图进记忆）
VIDEO_KEYFRAMES = int(os.getenv("VIDEO_KEYFRAMES", "8"))
# 视频文件大小上限
MAX_VIDEO_MB = int(os.getenv("MAX_VIDEO_MB", "300"))
