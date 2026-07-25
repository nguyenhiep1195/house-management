"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createInvoice } from "@/features/invoices/actions";
import type { FeeSetting } from "@/features/settings/types";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CreateInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: number;
  roomName: string;
  feeSettings: FeeSetting[];
  /** The room's assigned fee type; used as the default selection. */
  defaultFeeSettingId?: number | null;
}

export function CreateInvoiceDialog({
  open,
  onOpenChange,
  roomId,
  roomName,
  feeSettings,
  defaultFeeSettingId,
}: CreateInvoiceDialogProps) {
  const [pending, startTransition] = React.useTransition();
  const now = new Date();
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [year, setYear] = React.useState(now.getFullYear());
  const initialFeeId =
    defaultFeeSettingId ??
    feeSettings.find((s) => s.isDefault)?.id ??
    feeSettings[0]?.id;
  const [feeSettingId, setFeeSettingId] = React.useState<number | undefined>(
    initialFeeId,
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createInvoice(roomId, month, year, feeSettingId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Đã tạo hoá đơn");
        onOpenChange(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Tạo hoá đơn thủ công</DialogTitle>
          <DialogDescription>
            Tạo hoá đơn cho phòng {roomName}. Mỗi phòng chỉ có 1 hoá đơn mỗi
            tháng.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="invoice-month">Tháng</Label>
              <Input
                id="invoice-month"
                type="number"
                min={1}
                max={12}
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="invoice-year">Năm</Label>
              <Input
                id="invoice-year"
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                required
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Loại phí</Label>
            <Select
              value={feeSettingId ? String(feeSettingId) : undefined}
              onValueChange={(v) => setFeeSettingId(Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn loại phí" />
              </SelectTrigger>
              <SelectContent>
                {feeSettings.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                    {s.isDefault ? " (mặc định)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Tạo hoá đơn
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
