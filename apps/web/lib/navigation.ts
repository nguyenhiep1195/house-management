import {
  Building2,
  LayoutDashboard,
  Settings,
  UserCog,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Only rendered for ADMIN users. */
  adminOnly?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const ADMIN_NAV: NavGroup[] = [
  {
    label: "Tổng quan",
    items: [{ title: "Trang chủ", href: "/", icon: LayoutDashboard }],
  },
  {
    label: "Quản lý",
    items: [
      { title: "Toà nhà", href: "/buildings", icon: Building2 },
      { title: "Cư dân", href: "/residents", icon: Users },
      { title: "Bảo trì", href: "/maintenance", icon: Wrench },
      { title: "Người dùng", href: "/users", icon: UserCog, adminOnly: true },
    ],
  },
  {
    label: "Hệ thống",
    items: [{ title: "Cài đặt", href: "/settings", icon: Settings }],
  },
];

/** Returns the nav item matching a pathname, for breadcrumbs/titles. */
export function findNavItem(pathname: string): NavItem | undefined {
  return ADMIN_NAV.flatMap((group) => group.items).find((item) =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href),
  );
}
