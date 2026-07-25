"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Gauge, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";

import { generateInvoices } from "@/features/invoices/actions";
import { BulkReadingsDialog } from "@/features/rooms/components/bulk-readings-dialog";
import type { Room } from "@/features/rooms/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function InvoicesToolbar({
  month,
  year,
  rooms,
}: {
  month: number;
  year: number;
  rooms: Room[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [readingsOpen, setReadingsOpen] = React.useState(false);
  const [readingsKey, setReadingsKey] = React.useState(0);

  const occupiedRooms = rooms.filter((r) => r.status === "OCCUPIED");

  function navigate(nextMonth: number, nextYear: number) {
    router.push(`/invoices?month=${nextMonth}&year=${nextYear}`);
  }

  function openReadings() {
    setReadingsKey((k) => k + 1);
    setReadingsOpen(true);
  }

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateInvoices(month, year);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const missing = result.missingReadings ?? [];
      const skipped = result.skippedRooms ?? [];
      toast.success(
        `Đã tạo ${result.created ?? 0} hoá đơn tháng ${month}/${year}`,
      );
      if (skipped.length > 0) {
        toast.info(
          `${skipped.length} phòng đã có hoá đơn tháng này: ${skipped
            .map((s) => s.roomName)
            .join(", ")}`,
        );
      }
      if (missing.length > 0) {
        toast.warning(
          `Chưa nhập chỉ số cho ${missing.length} phòng: ${missing
            .map((m) => m.roomName)
            .join(", ")}. Vui lòng cập nhật chỉ số điện nước.`,
        );
        openReadings();
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="filter-month">Tháng</Label>
          <Input
            id="filter-month"
            type="number"
            min={1}
            max={12}
            className="w-20"
            value={month}
            onChange={(e) => navigate(Number(e.target.value), year)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="filter-year">Năm</Label>
          <Input
            id="filter-year"
            type="number"
            min={2000}
            max={2100}
            className="w-28"
            value={year}
            onChange={(e) => navigate(month, Number(e.target.value))}
          />
        </div>
      </div>
      <div className="flex items-end gap-2">
        <Button
          variant="outline"
          onClick={openReadings}
          disabled={occupiedRooms.length === 0}
        >
          <Gauge className="size-4" />
          Cập nhật chỉ số điện nước
        </Button>
        <Button onClick={handleGenerate} disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Zap className="size-4" />
          )}
          Tạo hoá đơn tháng {month}/{year}
        </Button>
      </div>
      <BulkReadingsDialog
        key={readingsKey}
        open={readingsOpen}
        onOpenChange={setReadingsOpen}
        rooms={occupiedRooms}
        year={year}
        month={month}
      />
    </div>
  );
}
