"""ORM 模型：记忆 / 媒体 / 人物 / 地点 / 故事 / 场景"""
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base


def _now() -> datetime:
    return datetime.now()


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(64))
    city: Mapped[str | None] = mapped_column(String(64))
    region: Mapped[str | None] = mapped_column(String(64))
    country: Mapped[str | None] = mapped_column(String(64))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    precision: Mapped[str | None] = mapped_column(String(16), default="city")


class Person(Base):
    __tablename__ = "persons"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(64))
    relation_label: Mapped[str | None] = mapped_column(String(32))
    avatar: Mapped[str | None] = mapped_column(String(255))
    aliases: Mapped[str | None] = mapped_column(Text)  # JSON 数组


class PersonRelation(Base):
    """人物之间的关系：A 的 B 是 C。
    比如「王盈芳的闺蜜是小美」，就存 from=王盈芳, to=小美, label=闺蜜。
    这样间接关系能挂在正确的那个人下面，而不是全都算成"我"的朋友。
    """

    __tablename__ = "person_relations"
    __table_args__ = (UniqueConstraint("from_person_id", "to_person_id", name="uq_person_relation"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    from_person_id: Mapped[str] = mapped_column(String(64), ForeignKey("persons.id", ondelete="CASCADE"))
    to_person_id: Mapped[str] = mapped_column(String(64), ForeignKey("persons.id", ondelete="CASCADE"))
    label: Mapped[str | None] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Memory(Base):
    __tablename__ = "memories"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    summary: Mapped[str | None] = mapped_column(Text)
    content: Mapped[str | None] = mapped_column(Text)
    happened_at: Mapped[str | None] = mapped_column(String(32))  # ISO 字符串，便于排序
    time_precision: Mapped[str | None] = mapped_column(String(16), default="day")
    location_id: Mapped[str | None] = mapped_column(String(64), ForeignKey("locations.id"))
    tags: Mapped[str | None] = mapped_column(Text)  # JSON 数组
    emotion: Mapped[str | None] = mapped_column(String(32))
    importance: Mapped[int] = mapped_column(Integer, default=3)
    source_type: Mapped[str | None] = mapped_column(String(16), default="photo")
    # 可见范围：private 仅自己 / friends 好友可见 / public 公开
    visibility: Mapped[str] = mapped_column(String(16), default="friends")
    # 旅行攻略那几块：消费明细（JSON）、交通、住宿、提醒
    cost_json: Mapped[str | None] = mapped_column(Text)
    transport_info: Mapped[str | None] = mapped_column(Text)
    stay_info: Mapped[str | None] = mapped_column(Text)
    tips: Mapped[str | None] = mapped_column(Text)
    cover: Mapped[str | None] = mapped_column(String(255))
    media_count: Mapped[int] = mapped_column(Integer, default=0)
    ai_status: Mapped[str | None] = mapped_column(String(16), default="confirmed")
    confidence: Mapped[float | None] = mapped_column(Float, default=0.8)
    ai_generated: Mapped[bool] = mapped_column(Boolean, default=False)
    user_id: Mapped[str] = mapped_column(String(64), default="local")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

    media: Mapped[list["MemoryMedia"]] = relationship(
        back_populates="memory", cascade="all, delete-orphan", order_by="MemoryMedia.sort"
    )
    person_links: Mapped[list["MemoryPerson"]] = relationship(
        back_populates="memory", cascade="all, delete-orphan"
    )


class MemoryPerson(Base):
    __tablename__ = "memory_persons"
    __table_args__ = (UniqueConstraint("memory_id", "person_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    memory_id: Mapped[str] = mapped_column(String(64), ForeignKey("memories.id", ondelete="CASCADE"))
    person_id: Mapped[str] = mapped_column(String(64), ForeignKey("persons.id", ondelete="CASCADE"))

    memory: Mapped[Memory] = relationship(back_populates="person_links")


class MemoryMedia(Base):
    __tablename__ = "memory_media"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    memory_id: Mapped[str] = mapped_column(String(64), ForeignKey("memories.id", ondelete="CASCADE"))
    url: Mapped[str] = mapped_column(String(512))
    caption: Mapped[str | None] = mapped_column(String(255))
    sort: Mapped[int] = mapped_column(Integer, default=0)
    # 这张图自己的拍摄时间（'YYYY-MM-DD' 开头），用来把一次上传拆成好几天
    captured_at: Mapped[str | None] = mapped_column(String(32), nullable=True)

    memory: Mapped[Memory] = relationship(back_populates="media")


class Story(Base):
    __tablename__ = "stories"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    # 归属：故事由谁的记忆生成；演示数据为 NULL，列表里不会展示给任何人
    user_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    title: Mapped[str] = mapped_column(String(255))
    subtitle: Mapped[str | None] = mapped_column(String(255))
    cover: Mapped[str | None] = mapped_column(String(512))
    style: Mapped[str] = mapped_column(String(32), default="warm")
    status: Mapped[str] = mapped_column(String(16), default="draft")  # draft / voiced / done
    voice: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

    scenes: Mapped[list["StoryScene"]] = relationship(
        back_populates="story", cascade="all, delete-orphan", order_by="StoryScene.sort"
    )


class StoryScene(Base):
    __tablename__ = "story_scenes"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    story_id: Mapped[str] = mapped_column(String(64), ForeignKey("stories.id", ondelete="CASCADE"))
    sort: Mapped[int] = mapped_column(Integer, default=0)
    narration: Mapped[str | None] = mapped_column(Text)  # 旁白文本
    image_url: Mapped[str | None] = mapped_column(String(512))  # 配图
    memory_ids: Mapped[str | None] = mapped_column(Text)  # JSON 数组（证据）
    audio_url: Mapped[str | None] = mapped_column(String(512))  # 配音文件
    subtitle_json: Mapped[str | None] = mapped_column(Text)  # 词级时间轴
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    story: Mapped[Story] = relationship(back_populates="scenes")


# ============ 账号 / 好友 ============

class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    nickname: Mapped[str] = mapped_column(String(64))
    password_hash: Mapped[str] = mapped_column(String(128))
    salt: Mapped[str] = mapped_column(String(64))
    avatar: Mapped[str | None] = mapped_column(String(512))
    bio: Mapped[str | None] = mapped_column(Text)
    # 主页横幅（个人页顶部那张大图）
    banner: Mapped[str | None] = mapped_column(String(512))
    # 主页正文：自己写的，支持极简 markdown（## 小标题 / - 列表 / > 引用 / **加粗**）
    about: Mapped[str | None] = mapped_column(Text)
    home_city: Mapped[str | None] = mapped_column(String(64))
    # 首页天气卡看哪座城市（空就用常驻城市）
    weather_city: Mapped[str | None] = mapped_column(String(32))
    # 硬币余额（给别人的攻略投币用），每天自动补几枚
    coin_balance: Mapped[int] = mapped_column(Integer, default=0)
    coin_day: Mapped[str | None] = mapped_column(String(10))
    # 密保问题（找回密码用）
    security_question: Mapped[str | None] = mapped_column(String(64))
    answer_hash: Mapped[str | None] = mapped_column(String(128))
    answer_salt: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class UserSession(Base):
    __tablename__ = "user_sessions"

    token: Mapped[str] = mapped_column(String(96), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    expires_at: Mapped[datetime] = mapped_column(DateTime)


class FriendRequest(Base):
    """好友申请：搜索到人 → 发申请 → 对方同意"""

    __tablename__ = "friend_requests"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    from_user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"))
    to_user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending/accepted/rejected
    message: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    handled_at: Mapped[datetime | None] = mapped_column(DateTime)


class Friendship(Base):
    """双向存两条，查询好友列表最省事"""

    __tablename__ = "friendships"
    __table_args__ = (UniqueConstraint("user_id", "friend_user_id", name="uq_friendship"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"))
    friend_user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"))
    remark: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


# ============ 旅行路线 / 攻略 ============

class TravelRoute(Base):
    """一条旅行路线：按顺序串起来的几个地点，地图上连成折线"""

    __tablename__ = "travel_routes"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(255))
    summary: Mapped[str | None] = mapped_column(Text)
    cover: Mapped[str | None] = mapped_column(String(512))
    start_date: Mapped[str | None] = mapped_column(String(32))
    end_date: Mapped[str | None] = mapped_column(String(32))
    tags: Mapped[str | None] = mapped_column(Text)  # JSON 数组
    visibility: Mapped[str] = mapped_column(String(16), default="friends")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

    points: Mapped[list["RoutePoint"]] = relationship(
        back_populates="route", cascade="all, delete-orphan", order_by="RoutePoint.sort"
    )


class RoutePoint(Base):
    __tablename__ = "route_points"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    route_id: Mapped[str] = mapped_column(String(64), ForeignKey("travel_routes.id", ondelete="CASCADE"))
    sort: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(String(128))
    location_id: Mapped[str | None] = mapped_column(String(64))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    arrive_date: Mapped[str | None] = mapped_column(String(32))
    stay_days: Mapped[int] = mapped_column(Integer, default=1)
    transport: Mapped[str | None] = mapped_column(String(32))
    note: Mapped[str | None] = mapped_column(Text)
    memory_id: Mapped[str | None] = mapped_column(String(64))

    route: Mapped[TravelRoute] = relationship(back_populates="points")


class TravelGuide(Base):
    """旅游攻略：长文形态，封面 + 分天行程 + 交通住宿花费 + 图集"""

    __tablename__ = "travel_guides"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(255))
    subtitle: Mapped[str | None] = mapped_column(String(255))
    cover: Mapped[str | None] = mapped_column(String(512))
    destination: Mapped[str | None] = mapped_column(String(128))
    day_count: Mapped[int] = mapped_column(Integer, default=1)
    budget: Mapped[str | None] = mapped_column(String(64))
    best_season: Mapped[str | None] = mapped_column(String(64))
    transport_info: Mapped[str | None] = mapped_column(Text)
    stay_info: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    tips: Mapped[str | None] = mapped_column(Text)
    route_id: Mapped[str | None] = mapped_column(String(64))
    visibility: Mapped[str] = mapped_column(String(16), default="friends")
    status: Mapped[str] = mapped_column(String(16), default="published")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

    days_plan: Mapped[list["GuideDay"]] = relationship(
        back_populates="guide", cascade="all, delete-orphan", order_by="GuideDay.sort"
    )
    media: Mapped[list["GuideMedia"]] = relationship(
        back_populates="guide", cascade="all, delete-orphan", order_by="GuideMedia.sort"
    )


class GuideDay(Base):
    __tablename__ = "guide_days"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    guide_id: Mapped[str] = mapped_column(String(64), ForeignKey("travel_guides.id", ondelete="CASCADE"))
    sort: Mapped[int] = mapped_column(Integer, default=0)
    title: Mapped[str] = mapped_column(String(255))
    content: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(512))  # 每天配一张图（图文攻略）
    transport: Mapped[str | None] = mapped_column(String(64))
    cost: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    guide: Mapped[TravelGuide] = relationship(back_populates="days_plan")


class GuideMedia(Base):
    __tablename__ = "guide_media"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    guide_id: Mapped[str] = mapped_column(String(64), ForeignKey("travel_guides.id", ondelete="CASCADE"))
    url: Mapped[str] = mapped_column(String(512))
    caption: Mapped[str | None] = mapped_column(String(255))
    sort: Mapped[int] = mapped_column(Integer, default=0)

    guide: Mapped[TravelGuide] = relationship(back_populates="media")


class MemoryVisit(Base):
    """巡礼打卡：我在这个点「去过 / 想去」的标记"""

    __tablename__ = "memory_visits"
    __table_args__ = (UniqueConstraint("user_id", "memory_id", name="uq_memory_visit"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"))
    memory_id: Mapped[str] = mapped_column(String(64), ForeignKey("memories.id", ondelete="CASCADE"))
    state: Mapped[str] = mapped_column(String(16), default="visited")  # visited / wish
    note: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class MediaComment(Base):
    """照片留言：可以给某张照片留一句话或一段语音，前端以弹幕形式滚过

    照片可能属于三种东西：记忆（memories）、旅行攻略（travel_guides）、路线（travel_routes）。
    所以用 target_type + target_id 定位，memory_id 只是历史字段（记忆下的留言仍然填它）。
    """

    __tablename__ = "media_comments"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    # memory / guide / route
    target_type: Mapped[str] = mapped_column(String(16), default="memory", index=True)
    target_id: Mapped[str | None] = mapped_column(String(64), index=True)
    # 这条留言属于谁的内容：同一张图被不同用户上传时要各算各的，不能混在一起
    owner_id: Mapped[str | None] = mapped_column(String(64), index=True)
    memory_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("memories.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # 对应 MemoryMedia.url（同一张照片的所有留言归到一起）
    media_url: Mapped[str] = mapped_column(String(512), index=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(8), default="text")  # text / voice
    content: Mapped[str | None] = mapped_column(Text)
    audio_url: Mapped[str | None] = mapped_column(String(512))
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class RouteGeometry(Base):
    """路线的「真实道路折线」缓存（高德驾车规划的结果）

    地图上一条线原来是站点直连，看着像直接飞过去。这里存一份沿公路的折线：
    站点坐标一变（signature 跟着变），下次读就自动重算；坐标没动就直接拿缓存，
    不重复请求高德。source 记这组点是怎么来的：amap 全段沿路 / mixed 部分沿路 /
    none 一段都没拿到（境外或者没网，前端自己退到平滑曲线）。
    """

    __tablename__ = "route_geometry"

    route_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("travel_routes.id", ondelete="CASCADE"), primary_key=True
    )
    mode: Mapped[str] = mapped_column(String(16), primary_key=True, default="driving")
    signature: Mapped[str] = mapped_column(String(64), default="")
    polyline: Mapped[str | None] = mapped_column(Text)  # JSON [[lat, lng], ...]
    distance_m: Mapped[int | None] = mapped_column(Integer)
    source: Mapped[str | None] = mapped_column(String(16))  # amap / mixed / none
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)


class GuideReaction(Base):
    """攻略的点赞 / 投币（一个人对一篇攻略只有一行）

    点赞是开关；投币是「这个人一共给这篇投了几枚」（0~2，跟哔哩哔哩一样），
    投出去的币从自己的余额里扣。计数按所有账号一起算，谁打开都看到同一个数。
    """

    __tablename__ = "guide_reactions"
    __table_args__ = (UniqueConstraint("guide_id", "user_id", name="uq_guide_reaction"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    guide_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("travel_guides.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    liked: Mapped[int] = mapped_column(Integer, default=0)
    coins: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)
