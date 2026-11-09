"""天气：给首页那张天气卡提供实时数据（open-meteo，无需 key，失败就返回 null）。

城市不再写死：先用内置坐标表兜住常见城市，表里没有就拿高德的地理编码去查，
查到的坐标进一份进程内缓存（同一个城市只查一次）。城市名怎么来的也有接口：
/weather/cities 用高德的行政区搜索做输入提示。
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request

from fastapi import APIRouter, Query

from geo import AMAP_KEY

router = APIRouter(prefix="/api", tags=["weather"])

# 常见城市坐标，够首页那张卡用了（表里没有的走高德）
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
    "苏州": (31.2989, 120.5853),
    "青岛": (36.0669, 120.3826),
    "大连": (38.9140, 121.6147),
    "宁波": (29.8683, 121.5440),
    "合肥": (31.8206, 117.2272),
    "郑州": (34.7466, 113.6254),
    "济南": (36.6512, 117.1201),
    "沈阳": (41.8057, 123.4315),
    "哈尔滨": (45.8038, 126.5349),
    "长春": (43.8171, 125.3235),
    "石家庄": (38.0428, 114.5149),
    "太原": (37.8706, 112.5489),
    "南昌": (28.6820, 115.8579),
    "南宁": (22.8170, 108.3665),
    "海口": (20.0442, 110.1999),
    "三亚": (18.2528, 109.5119),
    "贵阳": (26.6470, 106.6302),
    "昆明": (25.0389, 102.7183),
    "兰州": (36.0611, 103.8343),
    "西宁": (36.6171, 101.7782),
    "银川": (38.4872, 106.2309),
    "乌鲁木齐": (43.8256, 87.6168),
    "呼和浩特": (40.8424, 111.7490),
    "拉萨": (29.6520, 91.1721),
    "香港": (22.3193, 114.1694),
    "澳门": (22.1987, 113.5439),
    "台北": (25.0330, 121.5654),
    "东京": (35.6762, 139.6503),
    "大阪": (34.6937, 135.5023),
    "首尔": (37.5665, 126.9780),
    "新加坡": (1.3521, 103.8198),
    "曼谷": (13.7563, 100.5018),
    "伦敦": (51.5072, -0.1276),
    "巴黎": (48.8566, 2.3522),
    "罗马": (41.9028, 12.4964),
    "纽约": (40.7128, -74.0060),
}

_GEO_URL = "https://restapi.amap.com/v3/geocode/geo"
_DISTRICT_URL = "https://restapi.amap.com/v3/config/district"

# 查过的城市就记下来，省得每次都问高德
_GEO_CACHE: dict[str, tuple[float, float] | None] = {}


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


def _get_json(url: str) -> dict | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "shiguang/1.0"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            return json.loads(resp.read().decode("utf-8", "ignore"))
    except Exception:  # noqa: BLE001
        return None


def _amap_coords(city: str) -> tuple[float, float] | None:
    """城市名 → 经纬度（高德地理编码）"""
    if not AMAP_KEY:
        return None
    query = urllib.parse.urlencode({"address": city, "key": AMAP_KEY})
    data = _get_json(f"{_GEO_URL}?{query}")
    if not data or str(data.get("status")) != "1":
        return None
    for row in data.get("geocodes") or []:
        loc = (row.get("location") or "").split(",")
        if len(loc) == 2:
            try:
                lng, lat = float(loc[0]), float(loc[1])
            except ValueError:
                continue
            return (lat, lng)
    return None


def city_coords(city: str) -> tuple[float, float] | None:
    city = (city or "").strip()
    if not city:
        return None
    if city in CITY_COORDS:
        return CITY_COORDS[city]
    # 「青岛市」「山东省青岛市」这类写法也认
    short = city.rstrip("市")
    if short in CITY_COORDS:
        return CITY_COORDS[short]
    if city in _GEO_CACHE:
        return _GEO_CACHE[city]
    coords = _amap_coords(city)
    _GEO_CACHE[city] = coords
    return coords


@router.get("/weather/cities")
def search_cities(q: str = Query(..., min_length=1, max_length=32)):
    """城市输入提示：行政区搜索，返回「厦门市」这种标准写法"""
    if not AMAP_KEY:
        return [
            {"name": name, "level": "city"}
            for name in CITY_COORDS
            if q.strip() in name
        ][:10]
    query = urllib.parse.urlencode(
        {"keywords": q.strip(), "subdistrict": 0, "extensions": "base", "key": AMAP_KEY}
    )
    data = _get_json(f"{_DISTRICT_URL}?{query}")
    if not data or str(data.get("status")) != "1":
        return []
    # 高德把区县也一起返回，这里让「市 / 省」排前面，区县垫底，名字去重
    rank = {"country": 0, "province": 1, "city": 2, "district": 3, "biz_area": 4, "street": 5}
    rows = []
    seen: set[str] = set()
    for row in data.get("districts") or []:
        name = (row.get("name") or "").strip().rstrip("市")
        if not name or name in seen:
            continue
        seen.add(name)
        rows.append({"name": name, "level": row.get("level") or "city"})
    rows.sort(key=lambda r: rank.get(r["level"], 9))
    return rows[:10]


@router.get("/weather")
def weather(city: str = Query("泉州", max_length=32)):
    """返回当前天气 + 今日高低温；城市查不到 / 网络不通就返回 ok=false"""
    city = city.strip() or "泉州"
    coords = city_coords(city)
    if coords is None:
        return {"ok": False, "city": city, "error": "没查到这座城市的坐标"}

    lat, lng = coords
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
    data = _get_json(url)
    if not data:
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
