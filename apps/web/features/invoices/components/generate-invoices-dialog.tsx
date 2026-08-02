"use client";

import { Loader2 } from "lucide-react";

import type { Invoice } from "@/features/invoices/types";
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

interface GenerateInvoicesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
  month: number;
  year: number;
  /** Invoices already recorded for this period. */
  invoices: Invoice[];
  /** Rooms eligible for billing (status OCCUPIED). */
  occupiedRooms: Room[];
}

export function GenerateInvoicesDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
  month,
  year,
  invoices,
  occupiedRooms,
}: GenerateInvoicesDialogProps) {
  const billedRoomIds = new Set(invoices.map((invoice) => invoice.roomId));
  const existingNames = invoices.map(
    (invoice) => invoice.room?.name ?? `#${invoice.roomId}`,
  );
  const newCount = occupiedRooms.filter(
    (room) => !billedRoomIds.has(room.id),
  ).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Tạo hoá đơn tháng {month}/{year}
          </DialogTitle>
          <DialogDescription>
            Bạn có chắc muốn tạo hoá đơn cho tháng {month}/{year}?
          </DialogDescription>
        </DialogHeader>

        {existingNames.length > 0 ? (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="font-medium">
              Đã có {existingNames.length} hoá đơn trong tháng này
            </p>
            <p className="mt-1 text-muted-foreground">
              {existingNames.join(" · ")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Các phòng này sẽ được bỏ qua.
            </p>
          </div>
        ) : null}

        <p className="text-sm">
          {newCount > 0 ? (
            <>
              Sẽ tạo mới cho <span className="font-medium">{newCount}</span>{" "}
              phòng.
            </>
          ) : (
            "Tất cả phòng đang thuê đều đã có hoá đơn cho tháng này."
          )}
        </p>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Huỷ
          </Button>
          <Button onClick={onConfirm} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Xác nhận
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
