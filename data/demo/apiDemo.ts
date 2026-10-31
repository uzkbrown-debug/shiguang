// 演示数据：后端未启动时，所有 /api/* 读取请求自动回退到这里的内容
// 结构完全对齐 app/api/*.ts 里声明的字段，页面代码无需改动

const IMG = [
  "/images/1.webp",
  "/images/2.webp",
  "/images/20.webp",
  "/images/34.webp",
  "/images/36.webp",
  "/images/39.webp",
  "/images/41.webp",
  "/images/42.webp",
  "/images/55.webp",
  "/images/57.webp",
  "/images/58.webp",
  "/images/60.webp",
  "/images/61.webp",
  "/images/63.webp",
  "/images/119.webp",
  "/images/121.webp",
  "/images/127.webp",
  "/images/130.webp",
  "/images/133.webp",
  "/images/134.webp",
];

const now = "2026-09-30T10:00:00";

// ── 文章 ─────────────────────────────────────────────

interface DemoPost {
  id: number;
  title: string;
  slug: string;
  description: string;
  cover: string;
  category: string;
  tags: string[];
  status: string;
  is_pinned: boolean;
  views: number;
  likes: number;
  word_count: number;
  reading_time: number;
  published_at: string;
  created_at: string;
  updated_at: string;
  content?: string;
}

export const demoPosts: DemoPost[] = [
  {
    id: 1,
    title: "Framer Motion 动效实践：从 52 个组件里总结的 11 种动画模式",
    slug: "framer-motion-patterns",
    description:
      "全面梳理项目中 52 个组件使用的 Framer Motion 动画模式，涵盖滚动出现、页面切换、布局动画、手势交互与时间线动效。",
    cover: IMG[0],
    category: "技术",
    tags: ["React", "Framer Motion", "动效"],
    status: "published",
    is_pinned: true,
    views: 1284,
    likes: 96,
    word_count: 4200,
    reading_time: 12,
    published_at: "2026-05-17T10:03:00",
    created_at: "2026-05-17T10:03:00",
    updated_at: "2026-05-17T10:03:00",
  },
  {
    id: 2,
    title: "从零搭建一个全栈博客：Next.js + FastAPI + Vue",
    slug: "fullstack-blog",
    description:
      "记录我用 Next.js 16、FastAPI 与 Vue3 搭建个人博客的全过程，包含前后端分离、鉴权、后台管理与部署。",
    cover: IMG[4],
    category: "技术",
    tags: ["Next.js", "FastAPI", "Vue3"],
    status: "published",
    is_pinned: false,
    views: 2331,
    likes: 106,
    word_count: 5600,
    reading_time: 16,
    published_at: "2026-05-15T18:20:00",
    created_at: "2026-05-15T18:20:00",
    updated_at: "2026-05-15T18:20:00",
  },
  {
    id: 3,
    title: "记一次让人崩溃的部署踩坑：Nginx 缓存引发的血案",
    slug: "nginx-cache-story",
    description:
      "上线后前端资源一直不更新，排查了三个小时才发现是 Nginx 缓存策略和 CDN 回源顺序的问题。",
    cover: IMG[7],
    category: "技术",
    tags: ["Nginx", "部署", "踩坑"],
    status: "published",
    is_pinned: false,
    views: 896,
    likes: 42,
    word_count: 2100,
    reading_time: 6,
    published_at: "2026-04-18T21:15:00",
    created_at: "2026-04-18T21:15:00",
    updated_at: "2026-04-18T21:15:00",
  },
  {
    id: 4,
    title: "大二这一年：从 Vue2 到 Vue3 的自学记录",
    slug: "vue2-to-vue3",
    description:
      "从 composition API 到 Pinia，再到用 Vite 重构整个项目，记录我这一年在 Vue 上的学习路径和踩过的坑。",
    cover: IMG[9],
    category: "随笔",
    tags: ["Vue3", "学习", "总结"],
    status: "published",
    is_pinned: false,
    views: 1542,
    likes: 88,
    word_count: 3200,
    reading_time: 9,
    published_at: "2026-03-02T20:40:00",
    created_at: "2026-03-02T20:40:00",
    updated_at: "2026-03-02T20:40:00",
  },
  {
    id: 5,
    title: "日语 N1 备考：三个月从 N3 到 N1 的方法与坑",
    slug: "jlpt-n1",
    description:
      "单词、语法、阅读、听力的时间分配，以及那些看起来有用其实浪费时间的复习方式。",
    cover: IMG[11],
    category: "生活",
    tags: ["日语", "N1", "学习"],
    status: "published",
    is_pinned: false,
    views: 732,
    likes: 51,
    word_count: 2800,
    reading_time: 8,
    published_at: "2026-01-20T19:05:00",
    created_at: "2026-01-20T19:05:00",
    updated_at: "2026-01-20T19:05:00",
  },
  {
    id: 6,
    title: "信息安全管理与评估省赛复盘：我们丢分丢在哪",
    slug: "security-contest-review",
    description:
      "从加固、渗透到应急响应三个模块，复盘省赛当天的失误和赛前准备中真正有用的部分。",
    cover: IMG[13],
    category: "学术",
    tags: ["信息安全", "竞赛", "复盘"],
    status: "published",
    is_pinned: false,
    views: 511,
    likes: 29,
    word_count: 2400,
    reading_time: 7,
    published_at: "2025-12-08T16:30:00",
    created_at: "2025-12-08T16:30:00",
    updated_at: "2025-12-08T16:30:00",
  },
];

const postContent = (title: string, body: string) => `# ${title}

${body}

## 为什么要写这篇

写下这些主要是给自己留个备份。技术迭代太快，很多当时觉得理所当然的细节，半年后就会忘干净。如果你刚好也在做类似的事情，希望它能帮你少走一点弯路。

## 具体做法

\`\`\`tsx
export default function Demo() {
  const [open, setOpen] = useState(false);
  return (
    <button onClick={() => setOpen((v) => !v)}>
      {open ? "收起" : "展开"}
    </button>
  );
}
\`\`\`

上面这段是项目里最常用的写法，简单但足够稳定。

## 踩过的坑

- 一开始把所有状态都塞进全局 store，结果组件之间互相触发更新
- 动效的时长不能凭感觉，200—450ms 是比较舒服的区间
- 别在滚动容器里做 layout 动画，掉帧非常明显

## 小结

> 先把功能跑通，再考虑怎么让它好看。

如果后面还有新的心得，我会继续更新这篇。`;

export const demoPostDetails: DemoPost[] = demoPosts.map((p) => ({
  ...p,
  content: postContent(p.title, p.description),
}));

// ── 分类 ─────────────────────────────────────────────

export const demoCategories = [
  { id: 1, name: "技术", slug: "tech", description: "前端、后端与部署相关", sort: 1, post_count: 3 },
  { id: 2, name: "随笔", slug: "essay", description: "学习记录与生活碎片", sort: 2, post_count: 1 },
  { id: 3, name: "生活", slug: "life", description: "日常与兴趣", sort: 3, post_count: 1 },
  { id: 4, name: "学术", slug: "academic", description: "课程与竞赛", sort: 4, post_count: 1 },
];

// ── 说说 ─────────────────────────────────────────────

export const demoChatters = [
  {
    id: 1,
    content: "把博客首页重写完了，玻璃拟态加上漂浮的照片碎片，看着终于顺眼一点了。",
    images: [IMG[3]],
    mood: "开心",
    likes: 24,
    comments_count: 2,
    status: "published",
    created_at: "2026-05-19T22:10:00",
    updated_at: "2026-05-19T22:10:00",
  },
  {
    id: 2,
    content: "调了一晚上的滚动动画，最后发现只要把 duration 从 1.2 改到 0.4 就对了。",
    images: [],
    mood: "疲惫",
    likes: 18,
    comments_count: 1,
    status: "published",
    created_at: "2026-05-16T01:32:00",
    updated_at: "2026-05-16T01:32:00",
  },
  {
    id: 3,
    content: "江城的雨下了整整一周，宿舍楼下的积水可以养鱼了。",
    images: [IMG[6], IMG[8]],
    mood: "无奈",
    likes: 31,
    comments_count: 3,
    status: "published",
    created_at: "2026-05-12T18:05:00",
    updated_at: "2026-05-12T18:05:00",
  },
  {
    id: 4,
    content: "第一次用 Vite 重构完老项目，启动时间从 26 秒变成 1.8 秒，值得纪念。",
    images: [],
    mood: "畅快",
    likes: 42,
    comments_count: 2,
    status: "published",
    created_at: "2026-05-06T21:20:00",
    updated_at: "2026-05-06T21:20:00",
  },
  {
    id: 5,
    content: "N1 出分了，压线过。听力比想象中简单，阅读差点没写完。",
    images: [IMG[12]],
    mood: "激动",
    likes: 56,
    comments_count: 4,
    status: "published",
    created_at: "2026-04-28T12:00:00",
    updated_at: "2026-04-28T12:00:00",
  },
  {
    id: 6,
    content: "今天心血来潮把桌面整理了一遍，然后发现找不到东西了。",
    images: [],
    mood: "惆怅",
    likes: 12,
    comments_count: 0,
    status: "published",
    created_at: "2026-04-20T23:45:00",
    updated_at: "2026-04-20T23:45:00",
  },
];

const reply = (id: number, content: string, login: string, likes = 0): Record<string, unknown> => ({
  id: id + 100,
  parent_id: id,
  content,
  likes,
  status: "published",
  created_at: "2026-05-20T09:00:00",
  github_user: { id: id + 900, login, avatar: "/images/hong.jpg", bio: "" },
  replies: [],
});

export const demoChatterComments: Record<number, unknown[]> = {
  1: [
    {
      id: 101,
      chatter_id: 1,
      parent_id: null,
      content: "照片碎片那个效果好看，求个实现思路！",
      likes: 5,
      status: "published",
      created_at: "2026-05-20T09:20:00",
      github_user: { id: 901, login: "lin-yi", avatar: IMG[4], bio: "前端同行" },
      replies: [reply(101, "其实就是几张绝对定位的图加上循环的 y 轴位移，回头写篇文章。", "demo-user", 2)],
    },
  ],
  3: [
    {
      id: 103,
      chatter_id: 3,
      parent_id: null,
      content: "我们这边也是，伞都吹坏两把了。",
      likes: 3,
      status: "published",
      created_at: "2026-05-13T08:40:00",
      github_user: { id: 903, login: "ajie", avatar: IMG[7], bio: "" },
      replies: [],
    },
  ],
  5: [
    {
      id: 105,
      chatter_id: 5,
      parent_id: null,
      content: "恭喜！N1 过了之后看文档是真的爽。",
      likes: 8,
      status: "published",
      created_at: "2026-04-28T13:10:00",
      github_user: { id: 905, login: "qing", avatar: IMG[16], bio: "" },
      replies: [],
    },
  ],
};

// ── 相册 / 照片墙 ────────────────────────────────────

export const demoAlbums = [
  {
    id: 1,
    title: "校园日常",
    description: "示例大学的四季与随手拍",
    cover: IMG[1],
    photo_count: 6,
    sort: 1,
    created_at: "2025-09-01T09:00:00",
    updated_at: now,
  },
  {
    id: 2,
    title: "旅行与远方",
    description: "厦门、青岛、东京，几次说走就走的旅行",
    cover: IMG[5],
    photo_count: 6,
    sort: 2,
    created_at: "2025-10-02T09:00:00",
    updated_at: now,
  },
  {
    id: 3,
    title: "二次元收藏",
    description: "喜欢的插画与壁纸",
    cover: IMG[14],
    photo_count: 6,
    sort: 3,
    created_at: "2025-11-11T09:00:00",
    updated_at: now,
  },
];

export const demoPhotos = demoAlbums.flatMap((a, ai) =>
  Array.from({ length: 6 }).map((_, i) => ({
    id: a.id * 100 + i,
    album_id: a.id,
    url: IMG[(ai * 6 + i) % IMG.length],
    caption: `${a.title} · ${i + 1}`,
    orientation: i % 3 === 0 ? "vertical" : "horizontal",
    sort: i,
    created_at: a.created_at,
  })),
);

// ── 友链 ─────────────────────────────────────────────

export const demoFriends = [
  { id: 1, name: "小林の笔记本", url: "https://example.com/linyi", avatar: IMG[4], description: "前端与算法笔记，更新很勤", sort: 1, is_approved: true, created_at: now },
  { id: 2, name: "阿杰的后院", url: "https://example.com/ajie", avatar: IMG[7], description: "折腾服务器和家庭网络", sort: 2, is_approved: true, created_at: now },
  { id: 3, name: "苏晴的相册", url: "https://example.com/qing", avatar: IMG[16], description: "摄影与旅行记录", sort: 3, is_approved: true, created_at: now },
  { id: 4, name: "陈老师的课", url: "https://example.com/chen", avatar: IMG[18], description: "软件工程课程资料整理", sort: 4, is_approved: true, created_at: now },
  { id: 5, name: "拾光实验室", url: "https://example.com/shiguang", avatar: IMG[10], description: "AI 与个人数据可视化实验", sort: 5, is_approved: true, created_at: now },
  { id: 6, name: "Vue 中文社区", url: "https://example.com/vue", avatar: IMG[2], description: "Vue 生态中文资料", sort: 6, is_approved: true, created_at: now },
];

// ── 项目 ─────────────────────────────────────────────

export const demoProjects = [
  {
    id: 1,
    name: "Shiguang 个人博客",
    slug: "shiguang",
    description: "Next.js 16 + React 19 + Tailwind 4 的玻璃拟态博客",
    long_description:
      "全站采用玻璃拟态设计，包含文章、说说、照片墙、音乐播放器与左下角工具箱；支持暗色主题、背景切换与多种氛围特效。",
    cover_image: IMG[0],
    tech_stack: ["Next.js", "React", "TypeScript", "Tailwind CSS"],
    link_github: "https://github.com/yourname/your-repo",
    link_gitee: "",
    link_live: "",
    link_docs: "",
    status: "active",
    status_label: "持续维护",
    is_featured: true,
    sort: 1,
    created_at: "2026-01-01T10:00:00",
  },
  {
    id: 2,
    name: "拾光 · AI 数字记忆与人生故事馆",
    slug: "shiguang",
    description: "把照片与日记组织成时间线、地图、人物网络与故事",
    long_description:
      "上传照片或文字后由 AI 提取时间、地点、人物与场景，自动进入时间长河与记忆地图；Memory-RAG 支持用自然语言探索自己的过去，并驱动页面定位与故事生成。",
    cover_image: IMG[14],
    tech_stack: ["Next.js", "React", "Framer Motion", "Memory-RAG"],
    link_github: "https://github.com/yourname",
    link_gitee: "",
    link_live: "",
    link_docs: "",
    status: "active",
    status_label: "开发中",
    is_featured: true,
    sort: 2,
    created_at: "2026-03-20T10:00:00",
  },
  {
    id: 3,
    name: "尚品汇电商平台",
    slug: "shop-hui",
    description: "Vue3 + Pinia + Axios 实现的电商前端",
    long_description: "包含首页、搜索、商品详情与购物车模块，接口按文档联调，使用 Pinia 管理购物车与用户状态。",
    cover_image: IMG[9],
    tech_stack: ["Vue3", "Pinia", "Axios", "Vite"],
    link_github: "",
    link_gitee: "",
    link_live: "",
    link_docs: "",
    status: "done",
    status_label: "已完成",
    is_featured: false,
    sort: 3,
    created_at: "2025-10-15T10:00:00",
  },
  {
    id: 4,
    name: "小兔鲜生鲜电商",
    slug: "xiaotu-fresh",
    description: "Vue3 + Vite + Pinia 的生鲜电商前端",
    long_description: "商品展示、分类筛选与订单结算流程，重点练习组件拆分与状态管理。",
    cover_image: IMG[17],
    tech_stack: ["Vue3", "Vite", "Pinia"],
    link_github: "",
    link_gitee: "",
    link_live: "",
    link_docs: "",
    status: "done",
    status_label: "已完成",
    is_featured: false,
    sort: 4,
    created_at: "2025-11-20T10:00:00",
  },
  {
    id: 5,
    name: "学生信息管理系统",
    slug: "student-manager",
    description: "C 语言链表实现增删改查、成绩统计与排序",
    long_description: "课程设计项目，用单向链表管理学生数据，支持按成绩排序、统计与文件读写。",
    cover_image: IMG[12],
    tech_stack: ["C", "数据结构"],
    link_github: "",
    link_gitee: "",
    link_live: "",
    link_docs: "",
    status: "done",
    status_label: "课程项目",
    is_featured: false,
    sort: 5,
    created_at: "2025-06-10T10:00:00",
  },
  {
    id: 6,
    name: "动漫网站（前后端分离）",
    slug: "anime-site",
    description: "Spring Boot + MyBatis 提供接口，Vue3 开发前端",
    long_description: "练习前后端联调：后端用 Spring Boot 提供动漫列表与详情接口，前端用 Vue3 渲染并处理分页。",
    cover_image: IMG[19],
    tech_stack: ["Spring Boot", "MyBatis", "MySQL", "Vue3"],
    link_github: "",
    link_gitee: "",
    link_live: "",
    link_docs: "",
    status: "done",
    status_label: "已完成",
    is_featured: false,
    sort: 6,
    created_at: "2025-12-25T10:00:00",
  },
];

// ── 收藏夹 ───────────────────────────────────────────

export const demoBookmarks = [
  {
    id: 1,
    name: "开发工具",
    icon: "🛠️",
    description: "写代码时会用到的常用工具",
    sort: 1,
    created_at: now,
    sites: [
      { id: 11, category_id: 1, name: "GitHub", url: "https://github.com", icon: "", description: "代码托管与开源项目", platforms: ["web"], sort: 1, created_at: now },
      { id: 12, category_id: 1, name: "MDN Web Docs", url: "https://developer.mozilla.org", icon: "", description: "Web 标准文档，查 API 首选", platforms: ["web"], sort: 2, created_at: now },
      { id: 13, category_id: 1, name: "Can I use", url: "https://caniuse.com", icon: "", description: "浏览器兼容性查询", platforms: ["web"], sort: 3, created_at: now },
      { id: 14, category_id: 1, name: "Vue 3 文档", url: "https://cn.vuejs.org", icon: "", description: "中文文档，写起来顺手", platforms: ["web"], sort: 4, created_at: now },
    ],
  },
  {
    id: 2,
    name: "学习资源",
    icon: "📚",
    description: "课程、题库与笔记",
    sort: 2,
    created_at: now,
    sites: [
      { id: 21, category_id: 2, name: "菜鸟教程", url: "https://www.runoob.com", icon: "", description: "入门速查", platforms: ["web"], sort: 1, created_at: now },
      { id: 22, category_id: 2, name: "LeetCode", url: "https://leetcode.cn", icon: "", description: "刷题", platforms: ["web"], sort: 2, created_at: now },
      { id: 23, category_id: 2, name: "JLPT 官方", url: "https://www.jlpt.jp", icon: "", description: "日语能力考试信息", platforms: ["web"], sort: 3, created_at: now },
    ],
  },
  {
    id: 3,
    name: "设计灵感",
    icon: "🎨",
    description: "配色、字体与动效参考",
    sort: 3,
    created_at: now,
    sites: [
      { id: 31, category_id: 3, name: "Dribbble", url: "https://dribbble.com", icon: "", description: "界面设计参考", platforms: ["web"], sort: 1, created_at: now },
      { id: 32, category_id: 3, name: "Coolors", url: "https://coolors.co", icon: "", description: "配色方案生成", platforms: ["web"], sort: 2, created_at: now },
      { id: 33, category_id: 3, name: "Motion 参考站", url: "https://motion.dev", icon: "", description: "动效实现参考", platforms: ["web"], sort: 3, created_at: now },
    ],
  },
];

// ── 留言板 ───────────────────────────────────────────

const guest = (id: number, login: string, avatar: string, bio = "") => ({ id, login, avatar, bio });

export const demoMessages = [
  {
    id: 1,
    github_user_id: 901,
    parent_id: null,
    content: "博客风格很舒服，尤其是时间线那一块，回头也照着做一个。",
    status: "published",
    likes: 6,
    created_at: "2026-05-18T20:12:00",
    github_user: guest(901, "lin-yi", IMG[4], "前端同行"),
    replies: [
      {
        id: 11,
        github_user_id: 900,
        parent_id: 1,
        content: "随意抄，回头我把实现拆成文章发出来。",
        status: "published",
        likes: 2,
        created_at: "2026-05-18T21:03:00",
        github_user: guest(900, "demo-user", "/images/hong.jpg", "本站主人"),
        replies: [],
      },
    ],
  },
  {
    id: 2,
    github_user_id: 902,
    parent_id: null,
    content: "鼠标轨迹和点击特效是怎么做的？看着很轻，不烦人。",
    status: "published",
    likes: 4,
    created_at: "2026-05-14T15:40:00",
    github_user: guest(902, "ajie", IMG[7]),
    replies: [],
  },
  {
    id: 3,
    github_user_id: 903,
    parent_id: null,
    content: "N1 恭喜！我也是日语专业，看到备考那篇很有共鸣。",
    status: "published",
    likes: 9,
    created_at: "2026-05-02T09:25:00",
    github_user: guest(903, "qing", IMG[16]),
    replies: [],
  },
  {
    id: 4,
    github_user_id: null,
    parent_id: null,
    content: "路过留个脚印，加油。",
    status: "published",
    likes: 1,
    created_at: "2026-04-22T22:10:00",
    github_user: null,
    replies: [],
  },
];

// ── 文章评论 ─────────────────────────────────────────

export const demoPostComments = [
  {
    id: 1,
    post_id: 1,
    parent_id: null,
    content: "第 7 种模式正好解决了我现在的需求，谢谢整理。",
    likes: 7,
    status: "published",
    created_at: "2026-05-18T11:20:00",
    github_user: guest(905, "lin-yi", IMG[4]),
    replies: [],
  },
  {
    id: 2,
    post_id: 1,
    parent_id: null,
    content: "建议补一节关于 reduced motion 的处理，无障碍也很重要。",
    likes: 12,
    status: "published",
    created_at: "2026-05-19T08:05:00",
    github_user: guest(906, "chen", IMG[18], "课程老师"),
    replies: [],
  },
  {
    id: 3,
    post_id: 2,
    parent_id: null,
    content: "部署那部分写得很细，收藏了。",
    likes: 5,
    status: "published",
    created_at: "2026-05-16T19:30:00",
    github_user: guest(907, "qing", IMG[16]),
    replies: [],
  },
];

// ── 站点配置 ─────────────────────────────────────────

export const demoSiteConfig: Record<string, string> = {
  site_name: "拾光",
  site_description: "AI 数字记忆与人生故事馆",
  announcement: "后端暂未启动，当前展示的是本地演示数据。",
};

// ── 路由匹配 ─────────────────────────────────────────

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function demoResponse(path: string, method = "GET"): unknown {
  if (method !== "GET") return undefined;
  const clean = path.split("?")[0];

  if (clean === "/api/posts") return clone(demoPosts);
  if (clean === "/api/posts/count") return { count: demoPosts.length };
  if (clean.startsWith("/api/posts/detail/")) {
    const id = Number(clean.split("/").pop());
    return clone(demoPostDetails.find((p) => p.id === id) ?? demoPostDetails[0]);
  }
  if (clean.startsWith("/api/posts/")) {
    const slug = decodeURIComponent(clean.replace("/api/posts/", ""));
    const found = demoPostDetails.find((p) => p.slug === slug);
    if (found) return clone(found);
    return undefined;
  }

  if (clean === "/api/categories") return clone(demoCategories);

  if (clean === "/api/chatters") return clone(demoChatters);
  if (clean === "/api/chatters/count") return { count: demoChatters.length };
  if (/^\/api\/chatters\/\d+\/comments$/.test(clean)) {
    const id = Number(clean.split("/")[3]);
    return clone(demoChatterComments[id] ?? []);
  }
  if (/^\/api\/chatters\/\d+$/.test(clean)) {
    const id = Number(clean.split("/").pop());
    return clone(demoChatters.find((c) => c.id === id) ?? demoChatters[0]);
  }

  if (/^\/api\/comments\/post\/\d+$/.test(clean)) {
    const postId = Number(clean.split("/").pop());
    const list = demoPostComments.filter((c) => c.post_id === postId);
    return clone(list.length ? list : demoPostComments);
  }

  if (clean === "/api/albums") return clone(demoAlbums);
  if (/^\/api\/albums\/\d+\/photos$/.test(clean)) {
    const id = Number(clean.split("/")[3]);
    return clone(demoPhotos.filter((p) => p.album_id === id));
  }
  if (/^\/api\/albums\/\d+$/.test(clean)) {
    const id = Number(clean.split("/").pop());
    return clone(demoAlbums.find((a) => a.id === id) ?? demoAlbums[0]);
  }

  if (clean === "/api/friend-links") return clone(demoFriends);
  if (clean === "/api/bookmarks") return clone(demoBookmarks);
  if (clean === "/api/projects") return clone(demoProjects);
  if (clean.startsWith("/api/projects/")) {
    const slug = decodeURIComponent(clean.replace("/api/projects/", ""));
    const found = demoProjects.find((p) => p.slug === slug);
    return found ? clone(found) : undefined;
  }

  if (clean === "/api/messages") return clone(demoMessages);
  if (clean === "/api/messages/count") return { count: demoMessages.length };

  if (clean === "/api/site-config") return clone(demoSiteConfig);

  return undefined;
}
