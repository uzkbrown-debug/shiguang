// siteConfig.ts - 全站配置中心

export const siteConfig = {
  // 网站标题与博主信息
  title: process.env.NEXT_PUBLIC_SITE_TITLE || "拾光 · AI 数字记忆与人生故事馆",
  url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  authorName: process.env.NEXT_PUBLIC_SITE_AUTHOR || "YourName",
  bio: "让散落的数字资料，重新变成可以被探索、被回忆、被讲述的人生故事。",

  // 登录保护（演示级：账号密码来自环境变量，仅用于挡一下访客，不等于真实安全）
  // 在 .env.local 里配置，不要写进代码：
  //   NEXT_PUBLIC_SITE_AUTH_USER / NEXT_PUBLIC_SITE_AUTH_PASS / NEXT_PUBLIC_SITE_AUTH_TOKEN
  auth: {
    enabled: process.env.NEXT_PUBLIC_SITE_AUTH_ENABLED !== "false",
    username: process.env.NEXT_PUBLIC_SITE_AUTH_USER || "admin",
    password: process.env.NEXT_PUBLIC_SITE_AUTH_PASS || "admin",
    cookieName: "sg_auth",
    token: process.env.NEXT_PUBLIC_SITE_AUTH_TOKEN || "dev-auth-token", // 登录成功后写入 Cookie 的值
  },

  // 头像设置
  avatarUrl: "/images/hong.jpg",

  // 背景设置
  useGradient: false,
  // 「拾光」主题色：由记忆的暖调到叙事的靛蓝
  themeColors: ["#5b8def", "#8b5cf6", "#ec4899", "#fbbf24"],
  bgImages: [
    "/images/wall_mushoku.jpg",
    "/images/1.webp",
    "/images/42.webp",
    "/images/20.webp",
    "/images/36.webp",
    "/images/39.webp",
    "/images/41.webp",
  ],

  // 背景视频（可选）：把 mp4 / webm 放进 public/videos/，这里填路径
  // 例：["/videos/bg-mushoku.mp4"]
  // 填了视频就优先播视频；手机端会自动退回上面的图片背景（省流量）
  bgVideos: [] as string[],

  // 默认封面图
  defaultPostCover: "/images/default-cover.jpg",

  // 照片墙预览图
  photoWallImage: "/images/photo-wall.jpg",

  // 云音乐配置
  // server 可选：netease（网易云）| tencent（QQ音乐）| kugou（酷狗）| kuwo（酷我）| baidu（百度）| local（本地音乐）
  // 填歌单 ID 则自动拉取整个歌单，填歌曲 ID 列表则只播放指定歌曲
  cloudMusicServer: "netease",          // 音乐平台
  cloudMusicPlaylistId: process.env.NEXT_PUBLIC_MUSIC_PLAYLIST_ID || "",  // 歌单 ID（留空则只播下面的单曲）
  // 追加的单曲（会和上面的歌单合并播放）
  cloudMusicIds: [
    "488388942", // 當山みれい - 願い～あの頃のキミへ～
    "22746816", // 松下優也 - Mr. "Broken Heart"
    "618325", // miu-clips - 絆
    "1472480890", // YOASOBI - 群青
    "39224533", // Sou - 心做し
    "3403344548", // 小雪 - Cry for me
    "496869422", // DAOKO × 米津玄師 - 打上花火
    "1311427648", // She Her Her Hers - Episode 33
    "1317285056", // 松原みき - 真夜中のドア〜stay with me
    "674499", // 八神純子 - みずいろの雨
    "1973593792", // imase - NIGHT DANCER
    "1500152660", // YOASOBI - たぶん
    "812400", // ラムジ - PLANET
    "26440351", // sasakure.UK × 初音ミク - 蜘蛛糸モノポリー
    "1882027031", // あたらよ - 嘘つき
    "424262056", // Yunomi × nicamoq - インドア系ならトラックメイカー
  ],

  // 后端 API 地址（留空，开发通过 next.config.ts rewrites 代理，生产通过 Nginx 反代）
  apiBaseUrl: "",

  // 社交链接（改成你自己的）
  social: {
    github: process.env.NEXT_PUBLIC_SOCIAL_GITHUB || "https://github.com/yourname",
    gitee: process.env.NEXT_PUBLIC_SOCIAL_GITEE || "",
    google: "mailto:you@example.com",
    email: process.env.NEXT_PUBLIC_SOCIAL_EMAIL || "you@example.com",
    qq: "",
    wechat: "",
  },

  // 站点信息
  buildDate: "2026-05-07T12:00:00",
  // 备案信息：不需要就把两项留空
  icpConfig: {
    name: process.env.NEXT_PUBLIC_ICP_NAME || "",
    link: "https://beian.miit.gov.cn/",
  },
  moeIcpConfig: {
    name: process.env.NEXT_PUBLIC_MOE_ICP_NAME || "",
    link: "https://icp.gov.moe/",
  },
};
