"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Gauge, Loader2, RefreshCw, Zap } from "lucide-react";
import { toast } from "sonner";

import { generateInvoices, refreshInvoices } from "@/features/invoices/actions";
import type { Invoice } from "@/features/invoices/types";
import { BulkReadingsDialog } from "@/features/rooms/components/bulk-readings-dialog";
import type { Room, RoomPeriodReading } from "@/features/rooms/types";
import { GenerateInvoicesDialog } from "./generate-invoices-dialog";
import { MonthPicker } from "./month-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function InvoicesToolbar({
  month,
  year,
  rooms,
  readings,
  invoices,
}: {
  month: number;
  year: number;
  rooms: Room[];
  readings: RoomPeriodReading[];
  invoices: Invoice[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [refreshing, startRefresh] = React.useTransition();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [readingsOpen, setReadingsOpen] = React.useState(false);
  const [readingsKey, setReadingsKey] = React.useState(0);
  // Narrows the readings dialog to the rooms a generate run reported as
  // missing; null means "every occupied room" (the standalone button).
  const [readingsRoomIds, setReadingsRoomIds] = React.useState<number[] | null>(
    null,
  );

  const occupiedRooms = rooms.filter((r) => r.status === "OCCUPIED");
  // The readings endpoint already returns occupied rooms only; narrow further
  // when a generate run named specific rooms.
  const dialogReadings = readingsRoomIds
    ? readings.filter((r) => readingsRoomIds.includes(r.roomId))
    : readings;

  function navigate(nextMonth: number, nextYear: number) {
    router.push(`/invoices?month=${nextMonth}&year=${nextYear}`);
  }

  function openReadings(roomIds: number[] | null = null) {
    setReadingsRoomIds(roomIds);
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
      setConfirmOpen(false);
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
          `${missing.length} phòng chưa có chỉ số tháng ${month}/${year}: ${missing
            .map((m) => m.roomName)
            .join(", ")}. Hoá đơn đã tạo với tiền điện nước bằng 0 — vui lòng nhập chỉ số.`,
        );
        openReadings(missing.map((m) => m.roomId));
      }
      router.refresh();
    });
  }

  function handleRefresh() {
    startRefresh(async () => {
      const result = await refreshInvoices(month, year);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if ((result.updated ?? 0) > 0) {
        toast.success(`Đã cập nhật ${result.updated} hoá đơn`);
      } else {
        toast.info("Không có hoá đơn nào cần cập nhật");
      }
      const missing = result.missingReadings ?? [];
      if (missing.length > 0) {
        toast.warning(
          `Chưa nhập chỉ số cho ${missing.length} phòng: ${missing
            .map((m) => m.roomName)
            .join(", ")}. Vui lòng cập nhật chỉ số điện nước.`,
        );
      }
      router.refresh();
    });
  }

  return (
    <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
      <div className="grid gap-1.5">
        <Label>Kỳ hoá đơn</Label>
        <MonthPicker month={month} year={year} onChange={navigate} />
      </div>
      <div className="flex min-w-0 flex-wrap items-end gap-2">
        <Button
          variant="outline"
          onClick={() => openReadings()}
          disabled={readings.length === 0}
        >
          <Gauge className="size-4" />
          Cập nhật chỉ số điện nước
        </Button>
        <Button onClick={() => setConfirmOpen(true)} disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Zap className="size-4" />
          )}
          Tạo hoá đơn tháng {month}/{year}
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label="Cập nhật lại các thông tin mới nhất"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Cập nhật lại các thông tin mới nhất</TooltipContent>
        </Tooltip>
      </div>
      <GenerateInvoicesDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={handleGenerate}
        pending={pending}
        month={month}
        year={year}
        invoices={invoices}
        occupiedRooms={occupiedRooms}
      />
      <BulkReadingsDialog
        key={readingsKey}
        open={readingsOpen}
        onOpenChange={setReadingsOpen}
        readings={dialogReadings}
        year={year}
        month={month}
      />
    </div>
  );
}
