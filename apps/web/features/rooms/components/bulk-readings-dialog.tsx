"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { bulkUpdateReadings } from "@/features/rooms/actions";
import type { MeterReadingItem, RoomPeriodReading } from "@/features/rooms/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
  readings: RoomPeriodReading[];
  year: number;
  month: number;
}

type Draft = Record<number, { electricity: string; water: string }>;

function initialDraft(readings: RoomPeriodReading[]): Draft {
  const draft: Draft = {};
  for (const row of readings) {
    draft[row.roomId] = {
      electricity: row.electricityReading?.toString() ?? "",
      water: row.waterReading?.toString() ?? "",
    };
  }
  return draft;
}

export function BulkReadingsDialog({
  open,
  onOpenChange,
  readings,
  year,
  month,
}: BulkReadingsDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [draft, setDraft] = React.useState<Draft>(() => initialDraft(readings));

  // Rooms still missing a reading come first — they are what the operator
  // opened this dialog to deal with.
  const ordered = React.useMemo(
    () =>
      [...readings].sort((a, b) => {
        if (a.recorded !== b.recorded) return a.recorded ? 1 : -1;
        return a.roomName.localeCompare(b.roomName, "vi");
      }),
    [readings],
  );
  const missingCount = readings.filter((r) => !r.recorded).length;

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
    const items: MeterReadingItem[] = [];
    for (const row of readings) {
      if (!row.editable) continue;
      const d = draft[row.roomId];
      if (!d || (d.electricity === "" && d.water === "")) continue;

      const electricityReading =
        d.electricity === ""
          ? (row.electricityReading ?? row.prevElectricity)
          : Number(d.electricity);
      const waterReading =
        d.water === "" ? (row.waterReading ?? row.prevWater) : Number(d.water);

      // Unchanged rows would only add history noise.
      if (
        electricityReading === row.electricityReading &&
        waterReading === row.waterReading
      ) {
        continue;
      }
      if (
        electricityReading < row.prevElectricity ||
        waterReading < row.prevWater
      ) {
        toast.error(
          `Chỉ số mới của phòng ${row.roomName} phải lớn hơn hoặc bằng chỉ số kỳ trước`,
        );
        return;
      }
      items.push({ roomId: row.roomId, electricityReading, waterReading });
    }

    if (items.length === 0) {
      toast.error("Chưa nhập chỉ số mới cho phòng nào");
      return;
    }

    startTransition(async () => {
      const result = await bulkUpdateReadings(items, year, month);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Đã cập nhật chỉ số cho ${items.length} phòng`);
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cập nhật chỉ số điện nước</DialogTitle>
          <DialogDescription>
            {missingCount > 0
              ? `${missingCount}/${readings.length} phòng chưa có chỉ số kỳ ${month}/${year}. Phòng bỏ trống sẽ không thay đổi.`
              : `Tất cả ${readings.length} phòng đã có chỉ số kỳ ${month}/${year}. Sửa lại nếu cần.`}
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 flex-1 overflow-y-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phòng</TableHead>
                <TableHead>Chỉ số điện (kWh)</TableHead>
                <TableHead>Chỉ số nước (m³)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordered.map((row) => {
                const statusId = `reading-status-${row.roomId}`;
                return (
                  <TableRow
                    key={row.roomId}
                    className={cn(
                      !row.recorded &&
                        row.editable &&
                        "bg-amber-50/70 hover:bg-amber-50/70 dark:bg-amber-950/20 dark:hover:bg-amber-950/20",
                    )}
                  >
                    <TableCell className="font-medium">
                      <div className="flex flex-col gap-1">
                        <span className="break-words">{row.roomName}</span>
                        {/* The state is spelled out in text, so the amber tint
                            is never the only signal. */}
                        <span id={statusId} className="text-xs font-normal">
                          {!row.editable ? (
                            <Badge variant="outline">{row.lockReason}</Badge>
                          ) : row.recorded ? (
                            <span className="text-muted-foreground">
                              Đã nhập
                            </span>
                          ) : (
                            <Badge variant="destructive">Chưa nhập</Badge>
                          )}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="mb-1 text-xs text-muted-foreground tabular-nums">
                        Kỳ trước: {row.prevElectricity}
                      </p>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={row.prevElectricity}
                        placeholder="Chỉ số mới"
                        aria-label={`Chỉ số điện mới phòng ${row.roomName}`}
                        aria-describedby={statusId}
                        disabled={!row.editable}
                        value={draft[row.roomId]?.electricity ?? ""}
                        onChange={(e) =>
                          setValue(row.roomId, "electricity", e.target.value)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <p className="mb-1 text-xs text-muted-foreground tabular-nums">
                        Kỳ trước: {row.prevWater}
                      </p>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={row.prevWater}
                        placeholder="Chỉ số mới"
                        aria-label={`Chỉ số nước mới phòng ${row.roomName}`}
                        aria-describedby={statusId}
                        disabled={!row.editable}
                        value={draft[row.roomId]?.water ?? ""}
                        onChange={(e) =>
                          setValue(row.roomId, "water", e.target.value)
                        }
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
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
