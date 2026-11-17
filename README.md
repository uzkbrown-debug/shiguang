<div align="center">

# 拾光 · AI 数字记忆与人生故事馆

**让散落的数字资料，重新变成可以被探索、被回忆、被讲述的人生故事。**

Next.js 16 · React 19 · Tailwind CSS 4 · FastAPI · MySQL

</div>

---

## 这是什么

拾光是一个「个人数字记忆馆」：把拍过的照片、写过的日记、去过的地方、认识的人，
重新整理成一条可以按**时间线**、**地图**和**人物**去探索的人生故事。

它不只是博客，更像一个属于自己的小型档案馆。

## 功能

| 模块 | 说明 |
| --- | --- |
| 🕰️ 时间长河 | 横向拖拽的时间线，年份牌沿河分布，支持搜索 / 人物 / 地点 / 标签筛选 |
| 🗺️ 记忆地图 | 每条记忆绑定地点，按地点聚合成光点，点击展开城市抽屉 |
| 🛣️ 旅行路线 | 路线不再站点直连：后端调高德驾车规划拿到沿公路的折线并缓存，地图上按真实道路画线，桌宠沿线走、到站停 |
| 👥 人物网络 | 人物节点环绕中心，连线粗细 = 共同记忆次数；支持**间接关系**（「某某的闺蜜小美」挂在某某外侧） |
| 🖼️ 记忆展示 | 大图查看、左右切换、缩略图条、全屏放大、整条记忆删除 |
| 📤 上传与解析 | 图片按内容哈希去重落盘；EXIF 提取拍摄时间 / 机型 / GPS；文本编码探测；视频自动抽关键帧 |
| 🤖 AI 分析 | 接入 DeepSeek 多模态，直接把照片交给模型生成标题 / 摘要 / 标签 / 情绪（未配置 Key 时走本地推断） |
| 🔊 配音故事 | AI 写分幕旁白 → edge-tts 逐幕合成 → 词级字幕同步播放 |
| 🎬 回忆模式 | 按年份把记忆演成一段短片 |
| 💬 小拾 AI | 右下角可拖拽浮球，基于真实记忆检索问答，答案附证据卡片 |
| ✍️ 创作 | 文章 / 相册，Markdown 写作，RSS 订阅（`/feed`） |
| 🎵 音乐 | 云音乐播放器，支持网易云 / QQ / 酷狗 / 酷我 / 百度 / 本地 |
| 🧰 花园 | 一堆小工具：颜色、数学、二维码、地图、Markdown、Python、生命游戏、烟花…… |
| 🎨 界面 | 玻璃拟态、暗色模式、背景图 / 视频、季节特效、自定义光标、开场动画 |

## 技术栈

**前端**

- Next.js 16（App Router）+ React 19 + TypeScript
- Tailwind CSS 4
- framer-motion / lucide-react / recharts
- three.js + @react-three/fiber（3D 与粒子）
- Leaflet + react-leaflet（地图）
- CodeMirror 6（在线编辑器）、marked（Markdown）
- @meting/core（音乐播放）

**后端**

- FastAPI + SQLAlchemy 2.0 + PyMySQL
- MySQL（`utf8mb4`）
- Pillow（EXIF）、ffmpeg（视频抽帧）
- edge-tts（语音合成）
- OpenAI SDK 兼容接口 → DeepSeek（AI 分析）

## 快速开始

### 环境要求

- Node.js ≥ 18
- Python ≥ 3.10
- MySQL ≥ 8.0（本地或远程都行）
- ffmpeg（处理视频时需要，可选）

### 启动前端

```bash
npm install
cp .env.example .env.local     # 然后按需修改
npm run dev
```

打开 http://localhost:3000

### 启动后端

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate         # Windows
# source .venv/bin/activate    # macOS / Linux

pip install -r requirements.txt
cp .env.example .env           # 填 MySQL 密码，可选填 DeepSeek Key
python main.py
```

后端默认跑在 http://127.0.0.1:8000 ，接口文档见 `/docs`。

### 灌入演示数据（可选）

```bash
cd backend
python seed.py
```

### 一键启动（Windows）

```bash
start.bat
```

会依次检查构建 → 起后端 → 开浏览器。

## 环境变量

所有配置都走环境变量，仓库里不含任何真实地址或密钥。
复制 `.env.example` → `.env.local`（前端）和 `backend/.env.example` → `backend/.env`（后端）。

**前端（`.env.local`）**

| 变量 | 说明 |
| --- | --- |
| `NEXT_PUBLIC_SITE_TITLE` | 站点标题 |
| `NEXT_PUBLIC_SITE_URL` | 站点地址，RSS 里会用到 |
| `NEXT_PUBLIC_SITE_AUTHOR` | 作者名 |
| `NEXT_PUBLIC_SITE_AUTH_ENABLED` | 是否开启访问密码（演示级） |
| `NEXT_PUBLIC_SITE_AUTH_USER` / `_PASS` / `_TOKEN` | 访问账号密码与登录 Cookie 值 |
| `NEXT_PUBLIC_SOCIAL_GITHUB` / `_GITEE` / `_EMAIL` | 社交链接 |
| `NEXT_PUBLIC_ICP_NAME` / `NEXT_PUBLIC_MOE_ICP_NAME` | 备案信息，留空则不显示 |
| `BACKEND_URL` | 后端地址，前端 `/api/*` 由 rewrites 转发到这里 |

**后端（`backend/.env`）**

| 变量 | 说明 |
| --- | --- |
| `MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_DATABASE` | 数据库连接 |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` | AI 分析，留空则走本地降级逻辑 |
| `TTS_VOICE` / `TTS_RATE` / `TTS_VOLUME` | 配音音色，默认 `zh-CN-XiaoxiaoNeural` |
| `FFMPEG_PATH` / `VIDEO_KEYFRAMES` / `MAX_VIDEO_MB` | 视频处理参数（封面抽帧、关键帧、体积上限） |
| `AMAP_KEY` | 高德 Web 服务 key：路线沿真实道路绘制、城市地理编码（留空则退化为站点直连 + 内置城市表） |
| `DEMO_OWNER_USER` / `DEMO_OWNER_PASS` | 种子脚本往演示账号写内容时使用的账号密码 |
| `NETEASE_COOKIE` / `TENCENT_COOKIE` / `KUGOU_COOKIE` | 音乐平台 Cookie（可选，仅服务端使用） |

## 目录结构

```
.
├── app/                    # Next.js App Router
│   ├── timeline/           # 时间长河
│   ├── map/                # 记忆地图
│   ├── people/             # 人物网络
│   ├── memories/           # 记忆展示
│   ├── upload/  pending/   # 上传与待分析
│   ├── recall/  stories/   # 回忆模式与配音故事
│   ├── garden/             # 工具箱
│   └── api/                # 前端数据访问层
├── components/             # UI 组件
│   ├── shiguang/           # 记忆模块组件
│   ├── layout/  ui/        # 布局与基础组件
│   └── widgets/  music/    # 小组件与播放器
├── data/                   # 演示数据与本地回退数据
├── backend/                # FastAPI 后端
│   ├── main.py             # 入口与基础查询接口
│   ├── models.py           # SQLAlchemy 模型
│   ├── routes_upload.py    # 上传 / 记忆增删改查 / AI 分析
│   ├── routes_narration.py # 配音故事
│   ├── routes_assistant.py # 记忆助手问答
│   ├── ingest.py           # 落盘与元数据提取
│   ├── llm.py              # DeepSeek 封装
│   └── tts.py              # edge-tts 封装
├── public/                 # 静态资源
├── content/posts/          # Markdown 文章
├── siteConfig.ts           # 站点配置
└── next.config.ts          # rewrites / 图片域名
```

## 部署

大致思路是 Nginx 反向代理统一到 80/443：

```
用户 → 域名/api/xxx   → Nginx → FastAPI (8000)
用户 → 域名/          → Nginx → Next.js (3000)
```

```bash
npm run build
npm run start
```

## 安全说明

账号体系已经落地：密码走 PBKDF2 加盐存储，登录下发会话令牌（`sg_auth` Cookie），
记忆 / 攻略 / 路线都有 `private ↔ friends ↔ public` 三档可见性，删除类接口一律校验归属。

仍需注意的几点：

- 会话 Cookie 是 `httponly=False`（前端要读），生产环境建议改为后端下发 + HttpOnly；
- 语音弹幕依赖浏览器安全上下文，**站点必须走 HTTPS**，否则麦克风接口不可用（界面会明确提示）；
- 音乐平台 Cookie 等同于账号凭证，只放 `backend/.env`（已被 `.gitignore` 忽略）；
- 数据库账号请只授权本库、只监听 `127.0.0.1`，不要对公网开放 3306。

## 线上实例

| 项 | 值 |
| --- | --- |
| 地址 | <http://139.196.36.166>（HTTPS：<https://139.196.36.166>，自签证书需点一次「继续访问」） |
| 环境 | 阿里云 ECS，2 核 2 GB，Ubuntu 22.04 |
| 组成 | nginx（静态直出 + 反代）→ Next.js :3000 → FastAPI :8000 → MySQL 8 |
| 运维细节 | 见 [`DEPLOY.md`](./DEPLOY.md)：为什么不在这台机器上 `next build`、MySQL 小内存参数、日志位置 |

## 技术文档

- [`docs/技术文档-拾光.pdf`](./docs/技术文档-拾光.pdf)：完整技术文档（25 页，含架构图、AI 方案、测试与部署、创新点）
- [`docs/环境配置.md`](./docs/环境配置.md)：环境变量说明 + 依赖清单 + 常见启动问题

## License

MIT
