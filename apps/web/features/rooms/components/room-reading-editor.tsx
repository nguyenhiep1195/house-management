"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Gauge, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { bulkUpdateReadings } from "@/features/rooms/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RoomReadingEditorProps {
  roomId: number;
  roomName: string;
  electricityReading: number;
  waterReading: number;
}

export function RoomReadingEditor({
  roomId,
  roomName,
  electricityReading,
  waterReading,
}: RoomReadingEditorProps) {
  const router = useRouter();
  const now = new Date();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [year, setYear] = React.useState(now.getFullYear());
  const [electricity, setElectricity] = React.useState("");
  const [water, setWater] = React.useState("");

  function handleSubmit() {
    const nextElectricity =
      electricity === "" ? electricityReading : Number(electricity);
    const nextWater = water === "" ? waterReading : Number(water);
    if (nextElectricity < electricityReading || nextWater < waterReading) {
      toast.error("Chỉ số mới phải lớn hơn hoặc bằng chỉ số hiện tại");
      return;
    }
    startTransition(async () => {
      const result = await bulkUpdateReadings(
        [
          {
            roomId,
            electricityReading: nextElectricity,
            waterReading: nextWater,
          },
        ],
        year,
        month,
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Đã cập nhật chỉ số");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Gauge className="size-4" />
          Cập nhật chỉ số
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cập nhật chỉ số phòng {roomName}</DialogTitle>
          <DialogDescription>
            Chỉ số được ghi vào kỳ đã chọn (mặc định tháng hiện tại).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="reading-month">Tháng</Label>
              <Input
                id="reading-month"
                type="number"
                min={1}
                max={12}
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="reading-year">Năm</Label>
              <Input
                id="reading-year"
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="reading-electricity">Chỉ số điện (kWh)</Label>
            <p className="text-xs text-muted-foreground tabular-nums">
              Chỉ số cũ: {electricityReading}
            </p>
            <Input
              id="reading-electricity"
              type="number"
              inputMode="numeric"
              min={electricityReading}
              placeholder="Chỉ số mới"
              value={electricity}
              onChange={(e) => setElectricity(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="reading-water">Chỉ số nước (m³)</Label>
            <p className="text-xs text-muted-foreground tabular-nums">
              Chỉ số cũ: {waterReading}
            </p>
            <Input
              id="reading-water"
              type="number"
              inputMode="numeric"
              min={waterReading}
              placeholder="Chỉ số mới"
              value={water}
              onChange={(e) => setWater(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
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
