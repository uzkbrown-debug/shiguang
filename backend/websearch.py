"""图片认不出景点时的网络兜底：拿画面关键词去搜一圈，把标题里的景点名抠出来。

只用 Bing 的公开搜索结果页，不依赖任何 key。
"""

from __future__ import annotations

import html
import re
import urllib.parse
import urllib.request

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0 Safari/537.36"
)

# 结果标题里常见的后缀噪音
NOISE = [
    "百度百科", "维基百科", "旅游攻略", "门票价格", "官方网站", "官网", "攻略", "游记",
    "简介", "介绍", "在哪里", "怎么去", "地址", "开放时间", "地图", "点评", "排行榜",
]

TITLE_RE = re.compile(r"<h2[^>]*>\s*<a[^>]*>(.*?)</a>", re.S)
SNIPPET_RE = re.compile(r"<p[^>]*>(.*?)</p>", re.S)
TAG_RE = re.compile(r"<[^>]+>")


def _clean(raw: str) -> str:
    text = TAG_RE.sub("", raw)
    text = html.unescape(text).strip()
    for noise in NOISE:
        text = text.replace(noise, "")
    # 去掉结尾的标点和多余空格
    return re.sub(r"[\s\-—_|·:：,，.。]+$", "", re.sub(r"\s+", " ", text)).strip()


def search(query: str, limit: int = 10, timeout: int = 8) -> list[str]:
    """返回搜索结果的候选标题（已清洗），失败就是空列表"""
    if not query.strip():
        return []
    url = "https://www.bing.com/search?" + urllib.parse.urlencode(
        {"q": query, "setlang": "zh-CN", "cc": "CN", "count": limit}
    )
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="ignore")
    except Exception as exc:
        print("[websearch] bing failed:", exc)
        return []

    seen: set[str] = set()
    out: list[str] = []
    for raw in TITLE_RE.findall(body):
        title = _clean(raw)
        if not (2 <= len(title) <= 24):
            continue
        if title in seen:
            continue
        seen.add(title)
        out.append(title)
        if len(out) >= limit:
            break
    # 摘要里通常一次列出好几个景点名，对"抽景点"更有用
    for raw in SNIPPET_RE.findall(body)[:limit * 2]:
        text = TAG_RE.sub("", raw)
        text = re.sub(r"\s+", " ", html.unescape(text)).strip()
        if 4 <= len(text) <= 200 and text not in seen:
            seen.add(text)
            out.append(text)
    return out


def guess_spots(keywords: list[str], city: str = "") -> list[str]:
    """用画面关键词搜景点名；city 有值时就限定在这个城市里找"""
    queries: list[str] = []
    kw = " ".join(k.strip() for k in keywords if k and k.strip())[:80]
    if city and kw:
        queries.append(f"{city} {kw} 景点")
    if city:
        queries.append(f"{city} 著名景点 有哪些")
    if kw:
        queries.append(f"{kw} 中国 景点")

    out: list[str] = []
    seen: set[str] = set()
    for q in queries:
        texts = search(q, limit=8)
        # 标题 + 摘要里抽景点名，别把「北京旅游必去的20个景点」这种整条当景点
        for name in extract_places(texts, city=city, limit=10):
            if name in seen:
                continue
            seen.add(name)
            out.append(name)
            if len(out) >= 12:
                return out
    return out


# 景点名常见尾缀：从搜索结果标题里把「XX景区」这类词抠出来
PLACE_SUFFIX = (
    "长城|古城|古镇|古村|景区|风景名胜区|国家公园|森林公园|地质公园|博物院|博物馆|"
    "故宫|宫殿|王府|寺|塔|庙|祠|陵|园|山|峰|岭|湖|海|湾|岛|峡|谷|沟|洞|泉|瀑|溪|江|河|"
    "桥|楼|阁|亭|台|街|巷|村|镇|关|门|陵园|遗址|石窟|草原|湿地|沙漠|雪山|冰川|"
    "广场|大道|步行街|海滩|沙滩|天池|瀑布|水乡|古城墙|长城"
)
PLACE_RE = re.compile(rf"[\u4e00-\u9fa5]{{2,7}}(?:{PLACE_SUFFIX})")
BAD_WORDS = ("旅游", "攻略", "门票", "怎么", "哪里", "排行", "十大", "必去", "景点推荐", "知乎")
PREFIX_JUNK = "从到在和的是了去来这那又也都还很非常有可以我们你们个人感觉已经"


def extract_places(titles: list[str], city: str = "", limit: int = 12) -> list[str]:
    """从搜索结果标题里抽出「景点名」候选，去掉城市前缀重复项"""
    out: list[str] = []
    seen: set[str] = set()
    for title in titles:
        for hit in PLACE_RE.findall(title):
            name = hit.strip()
            # 抠掉「从庄严的」这种前导修饰，只留景点名本身
            while name and name[0] in PREFIX_JUNK:
                name = name[1:]
            if len(name) < 2:
                continue
            if any(bad in name for bad in BAD_WORDS):
                continue
            if len(name) < 2:
                continue
            if city and name == city:
                continue
            if name in seen:
                continue
            seen.add(name)
            out.append(name)
            if len(out) >= limit:
                return out
    return out
