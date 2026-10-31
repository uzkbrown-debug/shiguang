// 全站导航配置：导航条与 Tab 径向菜单共用同一份数据
import {
  Home,
  Clock,
  MapPin,
  Users,
  BookOpen,
  FolderGit2,
  Camera,
  Music,
  Inbox,
  Route,
  UserPlus,
} from "lucide-react";

// 拾光 · 一级入口
// 「时间」不再单独占一个导航位：时间长河挪进了 /travel 的「时间轴」页签里。
export const navLinks = [
  { href: "/", label: "首页", icon: Home },
  { href: "/map", label: "地图", icon: MapPin },
  { href: "/travel", label: "旅行", icon: Route },
  { href: "/people", label: "人物", icon: Users },
  { href: "/stories", label: "故事", icon: BookOpen },
  { href: "/friends", label: "好友", icon: UserPlus },
];

// 站内其它入口（放在导航条的「更多」里）
export const moreLinks = [
  { href: "/pending", label: "待分析", icon: Inbox },
  { href: "/posts", label: "文章", icon: BookOpen },
  { href: "/projects", label: "项目", icon: FolderGit2 },
  { href: "/photowall", label: "照片墙", icon: Camera },
  { href: "/music", label: "音乐", icon: Music },
];

export const allLinks = [...navLinks, ...moreLinks];
