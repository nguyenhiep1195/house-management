import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RECENT_ACTIVITIES, type Activity } from "@/features/dashboard/data";

const STATUS_VARIANT: Record<
  Activity["status"],
  React.ComponentProps<typeof Badge>["variant"]
> = {
  "Hoàn thành": "default",
  "Đang xử lý": "secondary",
  "Chờ duyệt": "outline",
};

export function RecentActivities() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Hoạt động gần đây</CardTitle>
        <CardDescription>
          Các yêu cầu và giao dịch mới nhất của cư dân
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mã</TableHead>
              <TableHead>Cư dân</TableHead>
              <TableHead className="hidden sm:table-cell">Căn hộ</TableHead>
              <TableHead className="hidden md:table-cell">Nội dung</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="hidden sm:table-cell text-right">
                Ngày
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {RECENT_ACTIVITIES.map((activity) => (
              <TableRow key={activity.id}>
                <TableCell className="font-medium">{activity.id}</TableCell>
                <TableCell>{activity.resident}</TableCell>
                <TableCell className="hidden sm:table-cell">
                  {activity.unit}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {activity.action}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[activity.status]}>
                    {activity.status}
                  </Badge>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-right text-muted-foreground">
                  {activity.date}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
