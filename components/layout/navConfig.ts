// 全站导航配置：导航条与 Tab 径向菜单共用同一份数据
// 「人物」模块已整体移除（人物网络页面下架），记忆里的人物标签作为内容保留。
import { Home, MapPin, BookOpen, Music, Inbox, Route, UserPlus, Images } from "lucide-react";

// 拾光 · 一级入口
// 「时间」不再单独占一个导航位：时间长河挪进了 /travel 的「时间轴」页签里。
export const navLinks = [
  { href: "/", label: "首页", icon: Home },
  { href: "/map", label: "地图", icon: MapPin },
  { href: "/travel", label: "旅行", icon: Route },
  { href: "/gallery", label: "相册", icon: Images },
  { href: "/stories", label: "故事", icon: BookOpen },
  { href: "/friends", label: "好友", icon: UserPlus },
];

// 站内其它入口（放在导航条的「更多」里）
// 文章 / 项目 / 照片墙是旧博客系统的残留模块，已经下架，不再出现在导航里。
export const moreLinks = [
  { href: "/pending", label: "待分析", icon: Inbox },
  { href: "/music", label: "音乐", icon: Music },
];

export const allLinks = [...navLinks, ...moreLinks];
