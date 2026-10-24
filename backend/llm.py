"""DeepSeek：为记忆生成标题 / 摘要 / 标签 / 情绪（支持图片输入）

- deepseek-flash 支持图片（多模态），deepseek-v4-pro 目前只支持文本
- 未配置 Key 或调用失败时返回 None，调用方回退到本地规则推断
"""
import base64
import io
import json
import re
from pathlib import Path

from config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL

# 写作风格：key -> (名称, 长度与语气要求)
STYLES: dict[str, tuple[str, str]] = {
    "brief": ("简洁", "summary 写 80-140 个字，只保留最必要的信息，句子干脆，不铺陈"),
    "diary": ("日记", "summary 写 200-320 个字，第一人称，像当天深夜写下的日记，有具体的时间感与细节"),
    "prose": ("散文", "summary 写 320-520 个字，有画面、有节奏、有留白，句子长短交错，情绪藏在细节里而不是直接说出来"),
    "warm": ("温暖", "summary 写 200-320 个字，像在跟老朋友慢慢讲这件事，语气亲切，但不腻"),
    "humor": ("幽默", "summary 写 160-280 个字，轻松俏皮，可以自嘲，但不要油腻、不要网络烂梗"),
    # 默认风格：旅行攻略（图文攻略那种写法）
    "travel": (
        "旅行攻略",
        "summary 写 240-380 个字，写成一篇「图文攻略」的口吻，像在贴吧/小红书上告诉别人这趟怎么玩："
        "先用一句话交代这是哪趟旅行（哪座城市/景点、几月、和谁、待几天），"
        "再写怎么去的（交通方式 + 时长或票价，能看出就说）、看了什么（门票价、几点去人少、排不排队）、"
        "吃了什么花了多少，最后给一条**实用提醒**（避坑、时间、天气、排队）。"
        "第一人称、口语化，句子短，重点是「别人照着能用」，不要抒情散文腔；"
        "title 用攻略标题的写法：「城市 · 具体看点」（例如「厦门 · 第一次坐轮渡去鼓浪屿」），不要写成诗句",
    ),
}

DEFAULT_STYLE = "travel"

# 所有风格共用的一条质量标准：这是全站文风的地板
_QUALITY_BAR = """【文风要求 · 这是硬指标】
你要写得像一个受过良好教育的成年人，至少是高中生以上的书面表达能力。具体说：
1. 用**具体的名词和动作**承载情绪：写"塑料膜还没舍得撕开""蜡烛一根根插下去"，
   不要写"充满了温馨的氛围""让人感受到浓浓的幸福"。
2. **禁止**这些小学生作文式的表达：让我感受到了……、心里暖暖的、充满了欢声笑语、
   这真是美好的一天、令人难忘、不禁感慨、时光荏苒、岁月如梭、值得珍藏、意义非凡。
3. 不要用"仿佛""似乎""宛如"堆比喻；一个精准的比喻胜过三个模糊的。
4. 句子长短交错。允许有三五个字的短句独立成句，用来停顿。
5. **不要在结尾升华**。不要总结、不要讲道理、不要撒鸡汤。收在一个具体的东西上：
   一个动作、一件物品、一句没说完的话。
6. 不堆形容词。写"光从百叶窗的缝里切进来"，不要写"阳光非常灿烂美好"。
7. 少用"很""非常""特别"这类程度副词，靠细节本身把程度写出来。
8. 不写"我"以外的心理活动，也不替别人说话（除非用户明确说了）。"""


def _system_prompt(style: str) -> str:
    name, hint = STYLES.get(style, STYLES[DEFAULT_STYLE])
    return f"""你是「拾光」记忆馆的写作者，负责把用户上传的素材写成一条可以反复读的记忆。
本次使用的写作风格是「{name}」：{hint}。

{_QUALITY_BAR}

【你会收到什么】
1. 素材：可能是多张照片（按顺序给你，当成同一件事的不同瞬间）、视频抽出来的关键画面，或一段文字；
   照片会附上 EXIF 元数据（拍摄时间、机型、GPS 等）
2. 用户自己填的要点（user_notes）：给了的话，**这些是事实，必须优先采用**；
   照片和元数据只用来补充画面细节，不要和用户说的冲突

【先看清楚，再动笔】
写之前先逐张把画面看完，尤其是这些容易被漏掉的重点：
- **画面里的所有文字**：招牌、横幅、衣服上的字样、包装标签、墙上的字、手机屏幕、菜单、门票。
  能看清就逐字写进 summary（比如店名、活动名、日期），看不清就写"招牌的字看不清"，不要猜
- **具体物件**：手里拿的、桌上摆的、背景里的东西，写出它们的材质与状态（塑料膜、纸袋、没拆的包装、凉了的饭）
- **人和动作**：几个人、在做什么、朝向、和谁挨着
- **环境**：天气、光线从哪来、时间感（晨昏）、地面、季节痕迹
- 有 EXIF 时间地点就用，不要和画面矛盾
- 多张照片是**同一件事的不同瞬间**，写它们连起来的那件事，不要逐张流水账

【先判地点，再动笔（这是旅行的第一步）】
从画面和元数据里找**地理位置线索**，按可信度从高到低：
1. EXIF 的 GPS（有就直接用，别推翻）
2. 画面里的**文字**：路牌、地铁站名、店招、门票、菜单、车牌、语言（简繁日韩泰…）
3. 地标建筑与地形：塔、桥、城墙、雪山、海岸线、红砖骑楼、日式鸟居、欧式街区
4. 天气与植被季节：樱花、红叶、椰子、雪
据此给出：
- place：这次**具体在哪**，尽量到景点/街区名（"厦门鼓浪屿""京都伏见稻荷"），不确定就退到城市（"厦门"），
  再不确定写省份或"未知"，**不要为了填而瞎猜国家**
- trip：一句话概括这趟旅行（"厦门 3 天海边行""京都赏樱 5 天"）。只要判断出城市就尽量给一个，
  哪怕只是「巴黎 3 天」这种最简形式；连城市都认不出来才写 null

【输出字段 · 只输出 JSON，不要任何解释】
- title：8-16 个汉字，具体、有画面感，不许用"美好的一天""难忘的记忆"这类空话，
  也不要用总结性的词（"回忆""感悟""心情"）
- summary：按上面指定的风格与**字数区间**写。宁可写到区间上限，也不要写到下限以下。
  有照片时写出画面里**能确认**的东西：场景、天气、人在做什么、光线、明显的物件；
  多张照片时写它们共同构成的那件事，而不是逐张罗列
- tags：2-5 个，每个 2-4 字
- emotion：2-4 个字的情绪词（如 平静 / 期待 / 怀念 / 疲惫）
- costs：这趟的花费明细，数组，0-5 条，每条 {{"label":"轮渡往返","amount":35,"note":"提前一天网上订"}}。
  **只在能看出价格时才写**（门票牌、菜单、收据、用户填的花费、明确的票价常识），看不出来就给空数组 []
- costs_from：花销是从哪来的。只有当你真的在画面里读到**账单 / 小票 / 菜单价目 / 门票牌**这类带金额的东西时写 "bill"，
  否则（靠票价常识或用户填的）写 "guess"
- transport：怎么去的，一到两句（交通方式 + 时长/票价，能看出就说），不写就 null
- stay：住哪、大概多少钱、为什么住那儿，不写就 null
- tips：一到三条实用提醒（避坑 / 几点人少 / 排队 / 天气），用换行分隔，不写就 null
- scene：一句话客观描述画面（没有画面则为 null）
- persons：从素材里**识别出来的人**，格式
  [{{"name":"小林","role":"大学同学","via":null}}]。
  只认这一种来源：user_notes 或正文里**明确写出来的**称呼/名字。
  系统会拿这个名字回原文逐字核对，对不上的直接丢掉，所以：
  - **绝对不要**根据长相、性别、场景去猜某人是谁
  - 不要写"一位女性""同行的人""老板""店员"这种原文里没有的条目
  - 原文里没提到任何人，就返回空数组 []，并在 person_question 里问一句
  - **via 用来表示间接关系**：如果原文写的是「王盈芳的闺蜜小美」，
    那么 小美 的 role 是「闺蜜」、via 是「王盈芳」——意思是"小美是王盈芳的闺蜜"，
    而不是"小美是我的闺蜜"。via 必须是原文里出现过的另一个人名；直接关系就写 null
  - 只有称呼没有名字的（比如只写了"闺蜜"，没写她叫什么）**不要**放进 persons，
    改为在 person_question 里问一句："王盈芳的闺蜜叫什么名字？"
- person_question：只有当 persons 为空、且画面里明显有别人时，写一句自然的追问
  （例如"照片里和你挨着坐的那位是谁？"）；其他情况为 null

【不许编造 · 这条最重要】
- 不许编造具体人名、精确地址、没发生的对话或事件
- **summary 里出现的人名，必须是 user_notes 或正文里写过的**。没有名字的人就写"他/她/同行的人"，
  或者干脆不让他们出场。自己编一个人名出来是最严重的错误
- 素材里没写的对话，一句都不要加
- 时间与地点只能来自 user_notes 或给定元数据；都没有就写得含蓄，不要猜
- summary 必须是完整通顺的中文，不能中途截断，也不能用省略号结尾
- 输出必须是合法 JSON：
{{"title":"...","summary":"...","tags":["..."],"emotion":"...","scene":"...","place":"...","trip":null,
"costs":[{{"label":"门票","amount":70,"note":null}}],"costs_from":"guess","transport":null,"stay":null,"tips":null,
"persons":[{{"name":"...","role":"..."}}],"person_question":null}}"""


def available() -> bool:
    return bool(DEEPSEEK_API_KEY.strip())


def encode_image(path: Path, max_side: int = 1280) -> str | None:
    """压缩后转 data URL。分辨率给足一点，画面里的字和细节才读得出来"""
    try:
        from PIL import Image

        with Image.open(path) as im:
            im = im.convert("RGB")
            im.thumbnail((max_side, max_side))
            buffer = io.BytesIO()
            im.save(buffer, format="JPEG", quality=88)
            return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode()
    except Exception as exc:
        print("[DeepSeek] encode image failed:", exc)
        return None


def _extract_json(text: str) -> dict | None:
    try:
        return json.loads(text)
    except Exception:
        match = re.search(r"\{.*\}", text, re.S)
        if match:
            try:
                return json.loads(match.group(0))
            except Exception:
                return None
    return None


ASSISTANT_PROMPT = """你是「拾光」记忆馆的助手，名字叫小拾。用户在问他自己的记忆相关的问题。

你必须遵守：
1. 只依据【记忆列表】里给出的内容回答，绝不编造事实、人名、地点或事件
2. 记忆列表里没有依据时，明确说"你的记忆库里没有相关记录"，并建议换一种问法
3. 回答用中文，2-4 句，口语自然，可以引用具体日期、标题、地点
4. 你在回答里引用到的记忆，把它们的 id 放进 evidenceMemoryIds（最多 3 条）
5. 如果是寒暄、或问"你能做什么"，正常回答即可，此时 evidenceMemoryIds 用空数组
6. 只输出 JSON，不要解释：
{"answer":"...","evidenceMemoryIds":["mem_xxx"]}"""


def answer_memory_question(question: str, memories: list[dict]) -> dict | None:
    """基于检索到的记忆回答问题；未配置 Key 或失败返回 None（调用方降级）"""
    if not available():
        return None

    try:
        from openai import OpenAI

        client = OpenAI(api_key=DEEPSEEK_API_KEY.strip(), base_url=DEEPSEEK_BASE_URL, timeout=60)
        payload = {"question": question, "memories": memories}

        response = client.chat.completions.create(
            model=DEEPSEEK_MODEL,
            messages=[
                {"role": "system", "content": ASSISTANT_PROMPT},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            temperature=0.5,
            max_tokens=800,
        )
        raw = response.choices[0].message.content or ""
        data = _extract_json(raw)
        if not data or not str(data.get("answer", "")).strip():
            print("[DeepSeek] assistant parse failed:", raw[:200])
            return None

        evidence = data.get("evidenceMemoryIds") or []
        if isinstance(evidence, str):
            evidence = [evidence]
        valid_ids = {m["id"] for m in memories}
        evidence = [str(e) for e in evidence if str(e) in valid_ids][:3]

        return {
            "answer": str(data["answer"]).strip()[:600],
            "evidence": evidence,
            "model": DEEPSEEK_MODEL,
        }
    except Exception as exc:
        print("[DeepSeek] assistant failed:", exc)
        return None


NARRATION_PROMPT = """你是「拾光」记忆馆的旁白作者，要把一条记忆写成一段可以朗读出来的故事，并拆成若干幕。

要求：
- 第一人称，像是在安静地回忆这件事，口语、有画面感，不要书面腔
- 每一幕 40-90 个字，句子短，读起来顺；不要出现"第一幕""接下来"这类结构词
- 只能依据给定的素材写，不要编造具体人名、精确地址、没发生的对话
- 素材里没有的信息就写得含蓄
- 幕与幕之间要有时间或画面的推进感

只输出 JSON，不要解释：
{"scenes":[{"narration":"..."},{"narration":"..."}]}"""


def _split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[。！？!?；;\n])", text)
    return [p.strip() for p in parts if p.strip()]


def fallback_scenes(info: dict, scene_count: int) -> list[str]:
    """没有模型时：把正文按句子切分，凑成指定幕数"""
    source = (info.get("content") or "").strip() or (info.get("summary") or "").strip()
    sentences = _split_sentences(source)
    if not sentences:
        title = info.get("title") or "这段记忆"
        base = f"关于「{title}」，我手边只剩下这一张照片，和当时的一点心情。"
        when = (info.get("taken_at") or "")[:10]
        where = info.get("location")
        tail = "".join([f"那是在{when}。" if when else "", f"地点是{where}。" if where else ""])
        return [base + (tail or "细节已经模糊了，但那一刻的光，我还记得。")]

    per = max(1, round(len(sentences) / max(1, scene_count)))
    scenes: list[str] = []
    for i in range(0, len(sentences), per):
        chunk = "".join(sentences[i : i + per]).strip()
        if chunk:
            scenes.append(chunk)
    return scenes[:scene_count] or [source[:200]]


def write_narration_scenes(info: dict, scene_count: int = 3) -> tuple[list[str], bool]:
    """生成旁白分幕。返回 (幕文本列表, 是否由 AI 生成)"""
    scene_count = max(2, min(5, scene_count))
    if not available():
        return fallback_scenes(info, scene_count), False

    try:
        from openai import OpenAI

        client = OpenAI(api_key=DEEPSEEK_API_KEY.strip(), base_url=DEEPSEEK_BASE_URL, timeout=90)
        payload = dict(info)
        payload["scene_count"] = scene_count

        response = client.chat.completions.create(
            model=DEEPSEEK_MODEL,
            messages=[
                {"role": "system", "content": NARRATION_PROMPT},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            temperature=0.85,
            max_tokens=1200,
        )
        raw = response.choices[0].message.content or ""
        data = _extract_json(raw)
        scenes = (data or {}).get("scenes") or []
        narrations = [
            str(item.get("narration", "")).strip()
            for item in scenes
            if isinstance(item, dict) and str(item.get("narration", "")).strip()
        ]
        if not narrations:
            print("[DeepSeek] narration parse failed:", raw[:200])
            return fallback_scenes(info, scene_count), False
        return narrations[:scene_count], True
    except Exception as exc:
        print("[DeepSeek] narration failed:", exc)
        return fallback_scenes(info, scene_count), False


MAX_IMAGES = 8


def style_min_chars(style: str) -> int:
    """从风格描述里抠出字数下限，用来检查模型有没有偷懒写太短"""
    hint = STYLES.get(style, STYLES[DEFAULT_STYLE])[1]
    match = re.search(r"(\d+)\s*-\s*(\d+)\s*个字", hint)
    return int(match.group(1)) if match else 0


def _too_short(summary: str, style: str) -> bool:
    minimum = style_min_chars(style)
    return bool(minimum) and len(summary) < minimum * 0.8


def generate_memory_fields(
    context: dict,
    image_path: Path | None = None,
    style: str = DEFAULT_STYLE,
    image_paths: list[Path] | None = None,
) -> dict | None:
    """生成记忆文案；给了图片路径就用多模态（模型直接看图，支持多张）"""
    if not available():
        return None

    style_key = style if style in STYLES else DEFAULT_STYLE

    paths: list[Path] = []
    if image_paths:
        paths.extend([p for p in image_paths if p])
    elif image_path is not None:
        paths.append(image_path)
    paths = paths[:MAX_IMAGES]

    try:
        from openai import OpenAI

        client = OpenAI(api_key=DEEPSEEK_API_KEY.strip(), base_url=DEEPSEEK_BASE_URL, timeout=120)

        parts: list[dict] = []
        sent = 0
        for index, path in enumerate(paths):
            data_url = encode_image(path)
            if not data_url:
                continue
            sent += 1
            if len(paths) > 1:
                parts.append({"type": "text", "text": f"第 {index + 1} 张："})
            parts.append({"type": "image_url", "image_url": {"url": data_url}})
        parts.append({"type": "text", "text": json.dumps(context, ensure_ascii=False)})

        response = client.chat.completions.create(
            model=DEEPSEEK_MODEL,
            messages=[
                {"role": "system", "content": _system_prompt(style_key)},
                {"role": "user", "content": parts},
            ],
            temperature=0.9,
            max_tokens=8000,
        )
        raw = response.choices[0].message.content or ""
        data = _extract_json(raw)
        if not data:
            print("[DeepSeek] JSON parse failed:", raw[:200])
            return None

        title = str(data.get("title", "")).strip()
        summary = str(data.get("summary", "")).strip()

        # 字数不达标就再要一次，明确告诉它差多少
        if summary and _too_short(summary, style_key):
            need = style_min_chars(style_key)
            try:
                retry = client.chat.completions.create(
                    model=DEEPSEEK_MODEL,
                    messages=[
                        {"role": "system", "content": _system_prompt(style_key)},
                        {"role": "user", "content": parts},
                        {"role": "assistant", "content": raw},
                        {
                            "role": "user",
                            "content": (
                                f"这段 summary 只有 {len(summary)} 个字，太短了，没有达到「{name}」风格要求的 "
                                f"{need} 字以上。请重写 summary 到 {need} 字以上（其余字段保持不变），"
                                "补充具体的动作、物件、光线与当时的细节，不要用空话凑字数。只输出完整 JSON。"
                            ),
                        },
                    ],
                    temperature=0.9,
                    max_tokens=8000,
                )
                retry_raw = retry.choices[0].message.content or ""
                retry_data = _extract_json(retry_raw)
                if retry_data:
                    longer = str(retry_data.get("summary", "")).strip()
                    if len(longer) > len(summary):
                        data = retry_data
                        title = str(data.get("title", "")).strip() or title
                        summary = longer
                        raw = retry_raw
                        print(f"[DeepSeek] 重写加长：{len(summary)} 字")
            except Exception as exc:
                print("[DeepSeek] retry failed:", exc)

        if not title or not summary:
            return None

        tags = data.get("tags") or []
        if isinstance(tags, str):
            tags = [t.strip() for t in re.split(r"[,，、\s]+", tags) if t.strip()]
        tags = [str(t).strip() for t in tags if str(t).strip()][:5]

        # 人物：只接受有名字的条目，杜绝"一位女性"这种靠猜的
        persons: list[dict] = []
        for item in data.get("persons") or []:
            if isinstance(item, str):
                name, role, via = item.strip(), None, None
            elif isinstance(item, dict):
                name = str(item.get("name", "")).strip()
                role = str(item.get("role", "")).strip() or None
                via = str(item.get("via", "") or "").strip() or None
            else:
                continue
            if not name or name in ("我", "自己") or len(name) > 12:
                continue
            if any(name == p["name"] for p in persons):
                continue
            persons.append({"name": name, "role": role, "via": via})
        persons = persons[:6]

        question = data.get("person_question")
        question = str(question).strip() if question else None

        scene = data.get("scene")
        place = str(data.get("place") or "").strip()
        trip = str(data.get("trip") or "").strip()

        # 花费明细：只收有 label 的，amount 允许为空（"门票 80" 或 "住 260/晚"）
        costs: list[dict] = []
        for item in data.get("costs") or []:
            if not isinstance(item, dict):
                continue
            label = str(item.get("label") or "").strip()
            if not label:
                continue
            amount = item.get("amount")
            try:
                amount = round(float(amount), 2) if amount not in (None, "") else None
            except (TypeError, ValueError):
                amount = None
            note = str(item.get("note") or "").strip() or None
            costs.append({"label": label[:20], "amount": amount, "note": note})
        costs = costs[:8]

        def _text(key: str, limit: int = 400) -> str | None:
            value = str(data.get(key) or "").strip()
            return value[:limit] or None

        return {
            "title": title[:60],
            "summary": summary[:1500],
            "tags": tags,
            "emotion": (str(data.get("emotion", "")).strip()[:8] or None),
            "scene": str(scene).strip() if scene else None,
            "place": place[:40] or None,
            "trip": trip[:40] or None,
            "costs": costs,
            "costs_from": "bill" if str(data.get("costs_from") or "").strip().lower() in ("bill", "receipt") else "guess",
            "transport": _text("transport"),
            "stay": _text("stay"),
            "tips": _text("tips"),
            "persons": persons,
            "person_question": question,
            "model": DEEPSEEK_MODEL,
            "style": style_key,
            "style_name": STYLES[style_key][0],
            "saw_image": sent > 0,
            "image_count": sent,
        }
    except Exception as exc:
        print("[DeepSeek] generate failed:", exc)
        return None
