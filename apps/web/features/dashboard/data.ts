import {
  Building2,
  CircleDollarSign,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export interface Stat {
  title: string;
  value: string;
  change: string;
  icon: LucideIcon;
}

export interface Activity {
  id: string;
  resident: string;
  unit: string;
  action: string;
  status: "Hoàn thành" | "Đang xử lý" | "Chờ duyệt";
  date: string;
}

// Dữ liệu mẫu — thay bằng API thật khi có backend
export const STATS: Stat[] = [
  {
    title: "Toà nhà",
    value: "12",
    change: "+2 so với tháng trước",
    icon: Building2,
  },
  {
    title: "Cư dân",
    value: "1.284",
    change: "+56 so với tháng trước",
    icon: Users,
  },
  {
    title: "Doanh thu tháng",
    value: "842tr ₫",
    change: "+12,5% so với tháng trước",
    icon: CircleDollarSign,
  },
  {
    title: "Yêu cầu bảo trì",
    value: "23",
    change: "8 đang chờ xử lý",
    icon: Wrench,
  },
];

export const RECENT_ACTIVITIES: Activity[] = [
  {
    id: "YC-1042",
    resident: "Nguyễn Văn An",
    unit: "A-1203",
    action: "Yêu cầu sửa điều hoà",
    status: "Đang xử lý",
    date: "12/07/2026",
  },
  {
    id: "YC-1041",
    resident: "Trần Thị Bình",
    unit: "B-0805",
    action: "Thanh toán phí quản lý",
    status: "Hoàn thành",
    date: "11/07/2026",
  },
  {
    id: "YC-1040",
    resident: "Lê Minh Cường",
    unit: "A-0304",
    action: "Đăng ký thẻ xe",
    status: "Chờ duyệt",
    date: "11/07/2026",
  },
  {
    id: "YC-1039",
    resident: "Phạm Thu Dung",
    unit: "C-1506",
    action: "Báo hỏng thang máy",
    status: "Hoàn thành",
    date: "10/07/2026",
  },
  {
    id: "YC-1038",
    resident: "Hoàng Văn Em",
    unit: "B-1101",
    action: "Gia hạn hợp đồng thuê",
    status: "Chờ duyệt",
    date: "09/07/2026",
  },
];
