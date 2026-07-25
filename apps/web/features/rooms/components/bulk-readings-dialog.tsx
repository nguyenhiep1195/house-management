"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { bulkUpdateReadings } from "@/features/rooms/actions";
import type { Room } from "@/features/rooms/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface BulkReadingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rooms: Room[];
  year: number;
  month: number;
}

type Draft = Record<number, { electricity: string; water: string }>;

export function BulkReadingsDialog({
  open,
  onOpenChange,
  rooms,
  year,
  month,
}: BulkReadingsDialogProps) {
  const [pending, startTransition] = React.useTransition();
  const [draft, setDraft] = React.useState<Draft>({});

  function setValue(
    roomId: number,
    field: "electricity" | "water",
    value: string,
  ) {
    setDraft((prev) => ({
      ...prev,
      [roomId]: {
        electricity: prev[roomId]?.electricity ?? "",
        water: prev[roomId]?.water ?? "",
        [field]: value,
      },
    }));
  }

  function handleSubmit() {
    const items = rooms.flatMap((room) => {
      const d = draft[room.id];
      if (!d || (d.electricity === "" && d.water === "")) return [];
      const electricityReading =
        d.electricity === "" ? room.electricityReading : Number(d.electricity);
      const waterReading =
        d.water === "" ? room.waterReading : Number(d.water);
      return [{ roomId: room.id, electricityReading, waterReading }];
    });

    if (items.length === 0) {
      toast.error("Chưa nhập chỉ số mới cho phòng nào");
      return;
    }
    for (const item of items) {
      const room = rooms.find((r) => r.id === item.roomId);
      if (!room) continue;
      if (
        item.electricityReading < room.electricityReading ||
        item.waterReading < room.waterReading
      ) {
        toast.error(
          `Chỉ số mới của phòng ${room.name} phải lớn hơn hoặc bằng chỉ số cũ`,
        );
        return;
      }
    }

    startTransition(async () => {
      const result = await bulkUpdateReadings(items, year, month);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`Đã cập nhật chỉ số cho ${items.length} phòng`);
        onOpenChange(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cập nhật chỉ số điện nước</DialogTitle>
          <DialogDescription>
            Nhập chỉ số mới cho kỳ {month}/{year}. Phòng bỏ trống sẽ không thay
            đổi.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phòng</TableHead>
                <TableHead>Chỉ số điện (kWh)</TableHead>
                <TableHead>Chỉ số nước (m³)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rooms.map((room) => (
                <TableRow key={room.id}>
                  <TableCell className="font-medium">{room.name}</TableCell>
                  <TableCell>
                    <p className="mb-1 text-xs text-muted-foreground tabular-nums">
                      Chỉ số cũ: {room.electricityReading}
                    </p>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={room.electricityReading}
                      placeholder="Chỉ số mới"
                      aria-label={`Chỉ số điện mới phòng ${room.name}`}
                      value={draft[room.id]?.electricity ?? ""}
                      onChange={(e) =>
                        setValue(room.id, "electricity", e.target.value)
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <p className="mb-1 text-xs text-muted-foreground tabular-nums">
                      Chỉ số cũ: {room.waterReading}
                    </p>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={room.waterReading}
                      placeholder="Chỉ số mới"
                      aria-label={`Chỉ số nước mới phòng ${room.name}`}
                      value={draft[room.id]?.water ?? ""}
                      onChange={(e) =>
                        setValue(room.id, "water", e.target.value)
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Huỷ
          </Button>
          <Button onClick={handleSubmit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Lưu chỉ số
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
