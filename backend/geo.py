"""路线几何：把「城市 → 城市」的直线换成沿公路的折线（高德驾车规划）

为什么放后端：
- 高德这个 key 是「Web 服务」用的，不能下发到浏览器；
- 折线要缓存，不然每开一次地图都在刷额度。

对外只露 `build_geometry(stops)`：给一串 (lat, lng)，回一组沿道路的点 + 里程 +
来源标记。某一段拿不到（境外、没网、超额）就退成直线那一段，整条线照样能画。
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

# 高德 Web 服务 key（可在 backend/.env 里用 AMAP_KEY 覆盖）
AMAP_KEY = (os.getenv("AMAP_KEY") or "bf92efe42da5e9c1e7c2a446ea4de30e").strip()
DRIVING_URL = "https://restapi.amap.com/v3/direction/driving"
TIMEOUT = 10.0
# 折线点数上限：再多小人走起来就卡了，而且这个精度对省级地图早就够
MAX_POINTS = 900


# ---------- 基础 ----------

def _http_json(url: str, timeout: float = TIMEOUT) -> dict | None:
    try:
        req = Request(url, headers={"User-Agent": "shiguang/1.0"})
        with urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8", "ignore"))
    except Exception:
        return None


def haversine(a: tuple[float, float] | list[float], b: tuple[float, float] | list[float]) -> float:
    """两点距离（米）"""
    lat1, lng1 = math.radians(a[0]), math.radians(a[1])
    lat2, lng2 = math.radians(b[0]), math.radians(b[1])
    dlat, dlng = lat2 - lat1, lng2 - lng1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 2 * 6371000 * math.asin(min(1.0, math.sqrt(h)))


def _length(points: list[list[float]]) -> float:
    return sum(haversine(a, b) for a, b in zip(points, points[1:]))


def _same(a: list[float], b: list[float]) -> bool:
    return abs(a[0] - b[0]) < 1e-7 and abs(a[1] - b[1]) < 1e-7


def signature_of(stops: list[tuple[float, float] | list[float]]) -> str:
    """站点坐标指纹：站点一改，缓存自动失效"""
    raw = "|".join(f"{float(p[0]):.5f},{float(p[1]):.5f}" for p in stops)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


# ---------- 取一段沿路折线 ----------

def _parse_polyline(raw: str) -> list[list[float]]:
    """高德 polyline 是「lng,lat;lng,lat;…」，这里统一成 [lat, lng]"""
    out: list[list[float]] = []
    for chunk in (raw or "").split(";"):
        if not chunk:
            continue
        try:
            lng, lat = chunk.split(",")
            out.append([float(lat), float(lng)])
        except ValueError:
            continue
    return out


def driving_segment(
    a: tuple[float, float] | list[float],
    b: tuple[float, float] | list[float],
    strategy: int = 0,
) -> dict | None:
    """一段的驾车规划。返回 {points, distance, duration}；失败返回 None"""
    query = urlencode(
        {
            "origin": f"{float(a[1]):.6f},{float(a[0]):.6f}",
            "destination": f"{float(b[1]):.6f},{float(b[0]):.6f}",
            "extensions": "base",
            "strategy": strategy,
            "key": AMAP_KEY,
        }
    )
    data = _http_json(f"{DRIVING_URL}?{query}")
    if not data or str(data.get("status")) != "1":
        return None
    paths = (data.get("route") or {}).get("paths") or []
    if not paths:
        return None
    path = paths[0]

    points: list[list[float]] = []
    for step in path.get("steps") or []:
        for pt in _parse_polyline(step.get("polyline") or ""):
            if not points or not _same(points[-1], pt):
                points.append(pt)
    if len(points) < 2:
        return None

    try:
        distance = float(path.get("distance") or 0)
    except (TypeError, ValueError):
        distance = 0.0
    try:
        duration = float(path.get("duration") or 0)
    except (TypeError, ValueError):
        duration = 0.0
    return {"points": points, "distance": distance or _length(points), "duration": duration}


# ---------- 抽稀：形状保住，点数砍掉 ----------

def _simplify(points: list[list[float]], tol: float = 0.00035) -> list[list[float]]:
    """Douglas-Peucker，容差按度算（0.00035° ≈ 35 米），去掉直路上的冗余点"""
    if len(points) < 3:
        return points
    # 经度方向按纬度压缩一下，让它接近真实米制距离
    kx = math.cos(math.radians(sum(p[0] for p in points) / len(points)))
    pts = [(p[1] * kx, p[0]) for p in points]

    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        start, end = stack.pop()
        if end <= start + 1:
            continue
        x1, y1 = pts[start]
        x2, y2 = pts[end]
        dx, dy = x2 - x1, y2 - y1
        norm = math.hypot(dx, dy) or 1e-12
        best_i, best_d = -1, 0.0
        for i in range(start + 1, end):
            px, py = pts[i]
            d = abs(dy * (px - x1) - dx * (py - y1)) / norm
            if d > best_d:
                best_i, best_d = i, d
        if best_i != -1 and best_d > tol:
            keep[best_i] = True
            stack.append((start, best_i))
            stack.append((best_i, end))
    out = [p for p, k in zip(points, keep) if k]
    return out if len(out) >= 2 else [points[0], points[-1]]


def _cap(points: list[list[float]], limit: int = MAX_POINTS) -> list[list[float]]:
    if len(points) <= limit:
        return points
    step = len(points) / limit
    out = [points[0]]
    for i in range(1, limit - 1):
        out.append(points[int(i * step)])
    out.append(points[-1])
    return out


# ---------- 整条路线 ----------

def build_geometry(
    stops: list[tuple[float, float] | list[float]],
    mode: str = "driving",
) -> tuple[list[list[float]], float, str]:
    """一串站点 → (折线 [[lat,lng],…], 里程米, 来源 amap/mixed/none)"""
    stops = [[float(p[0]), float(p[1])] for p in stops]
    if len(stops) < 2:
        return [], 0.0, "none"
    if mode != "driving":
        return [], 0.0, "none"

    joined: list[list[float]] = []
    total = 0.0
    ok = 0
    for a, b in zip(stops, stops[1:]):
        seg = driving_segment(a, b)
        if seg is None:
            # 长途那一段偶尔超时，隔一会儿再问一次；两次都不行才退直线
            time.sleep(0.6)
            seg = driving_segment(a, b)
        if seg:
            ok += 1
            total += float(seg["distance"])
            chunk = _simplify(seg["points"])
        else:
            chunk = [list(a), list(b)]
            total += haversine(a, b)
        if joined and not _same(joined[-1], chunk[0]):
            joined.append(list(a))  # 把站点的准确坐标补齐，免得站在路中间断开
        joined.extend(chunk)

    if ok == 0:
        return [], total, "none"

    joined = _cap(_simplify(joined) or joined)
    return joined, round(total, 1), ("amap" if ok == len(stops) - 1 else "mixed")


# ---------- 库里的缓存行 ----------

def load_cached(db, route_id: str, mode: str, signature: str):
    """取缓存；站点指纹对不上就当没缓存"""
    from models import RouteGeometry

    row = db.get(RouteGeometry, (route_id, mode))
    if not row or not row.polyline or (row.signature or "") != signature:
        return None
    try:
        points = json.loads(row.polyline)
    except Exception:
        return None
    if not isinstance(points, list) or len(points) < 2:
        return None
    return {
        "points": points,
        "distance_m": row.distance_m or 0,
        "source": row.source or "amap",
        "cached": True,
    }


def save_cached(db, route_id: str, mode: str, signature: str, points, distance, source) -> None:
    from models import RouteGeometry

    row = db.get(RouteGeometry, (route_id, mode))
    if row is None:
        row = RouteGeometry(route_id=route_id, mode=mode)
        db.add(row)
    row.signature = signature
    row.polyline = json.dumps(points, separators=(",", ":")) if points else None
    row.distance_m = int(distance or 0)
    row.source = source
    db.commit()
