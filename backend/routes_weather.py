"""天气：给首页那张天气卡提供实时数据（open-meteo，无需 key，失败就返回 null）。"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request

from fastapi import APIRouter, Query

router = APIRouter(prefix="/api", tags=["weather"])

# 常见城市坐标，够首页那张卡用了
CITY_COORDS: dict[str, tuple[float, float]] = {
    "北京": (39.9042, 116.4074),
    "上海": (31.2304, 121.4737),
    "广州": (23.1291, 113.2644),
    "深圳": (22.5431, 114.0579),
    "厦门": (24.4798, 118.0894),
    "泉州": (24.8741, 118.6757),
    "福州": (26.0745, 119.2965),
    "杭州": (30.2741, 120.1551),
    "成都": (30.5728, 104.0668),
    "西安": (34.3416, 108.9398),
    "南京": (32.0603, 118.7969),
    "武汉": (30.5928, 114.3055),
    "重庆": (29.5630, 106.5516),
    "天津": (39.3434, 117.3616),
    "长沙": (28.2282, 112.9388),
}


def _label(code: int | None) -> str:
    if code is None:
        return "未知"
    if code == 0:
        return "晴"
    if code in (1, 2):
        return "少云"
    if code == 3:
        return "多云"
    if code in (45, 48):
        return "有雾"
    if 51 <= code <= 57:
        return "毛毛雨"
    if 61 <= code <= 67:
        return "下雨"
    if 71 <= code <= 77:
        return "下雪"
    if 80 <= code <= 82:
        return "阵雨"
    if code in (85, 86):
        return "阵雪"
    if 95 <= code <= 99:
        return "雷雨"
    return "多云"


def _icon(code: int | None) -> str:
    if code == 0:
        return "sun"
    if code in (1, 2, 3):
        return "cloud-sun"
    if code in (45, 48):
        return "fog"
    if 51 <= code <= 67 or 80 <= code <= 82:
        return "rain"
    if 71 <= code <= 77 or code in (85, 86):
        return "snow"
    if 95 <= code <= 99:
        return "storm"
    return "cloud-sun"


@router.get("/weather")
def weather(city: str = Query("泉州", max_length=32)):
    """返回当前天气 + 今日高低温；网络不通就返回 null，前端保留占位。"""
    lat, lng = CITY_COORDS.get(city, CITY_COORDS["泉州"])
    query = urllib.parse.urlencode(
        {
            "latitude": lat,
            "longitude": lng,
            "current": "temperature_2m,relative_humidity_2m,weather_code",
            "daily": "temperature_2m_max,temperature_2m_min",
            "timezone": "auto",
            "forecast_days": 1,
        }
    )
    url = f"https://api.open-meteo.com/v1/forecast?{query}"
    try:
        with urllib.request.urlopen(url, timeout=6) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception:  # noqa: BLE001
        return {"ok": False, "city": city}

    current = data.get("current") or {}
    daily = data.get("daily") or {}
    code = current.get("weather_code")
    highs = daily.get("temperature_2m_max") or []
    lows = daily.get("temperature_2m_min") or []
    return {
        "ok": True,
        "city": city,
        "temperature": round(current.get("temperature_2m") or 0),
        "humidity": current.get("relative_humidity_2m"),
        "text": _label(code),
        "icon": _icon(code),
        "high": round(highs[0]) if highs else None,
        "low": round(lows[0]) if lows else None,
    }
