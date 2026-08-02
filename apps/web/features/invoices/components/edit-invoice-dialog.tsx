"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  updateInvoice,
  type InvoiceEditable,
} from "@/features/invoices/actions";
import type { Invoice } from "@/features/invoices/types";
import { formatMonth } from "@/lib/format";
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

const FIELDS: { key: keyof InvoiceEditable; label: string }[] = [
  { key: "roomPrice", label: "Tiền phòng" },
  { key: "electricityPrev", label: "Chỉ số điện cũ" },
  { key: "electricityCurrent", label: "Chỉ số điện mới" },
  { key: "electricityUnitPrice", label: "Đơn giá điện" },
  { key: "waterPrev", label: "Chỉ số nước cũ" },
  { key: "waterCurrent", label: "Chỉ số nước mới" },
  { key: "waterUnitPrice", label: "Đơn giá nước" },
  { key: "internetFee", label: "Internet" },
  { key: "elevatorFee", label: "Thang máy" },
  { key: "cleaningFee", label: "Vệ sinh" },
  { key: "motorbikeFee", label: "Xe máy" },
  { key: "otherFee", label: "Phí khác" },
  { key: "occupantCount", label: "Số người" },
  { key: "motorbikeCount", label: "Số xe" },
];

function buildDraft(invoice: Invoice): Record<string, string> {
  return Object.fromEntries(
    FIELDS.map((f) => [f.key, String(invoice[f.key] ?? 0)]),
  );
}

// Inner form is keyed by invoice.id so state resets automatically when a
// different invoice is selected — avoids setState-in-effect and ref-in-render.
function EditInvoiceForm({
  invoice,
  onOpenChange,
}: {
  invoice: Invoice;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const [draft, setDraft] = React.useState<Record<string, string>>(() =>
    buildDraft(invoice),
  );

  function handleSubmit() {
    const data: Partial<InvoiceEditable> = {};
    for (const f of FIELDS) {
      const raw = draft[f.key];
      if (raw === "" || raw === undefined) continue;
      const num = Number(raw);
      if (Number.isNaN(num) || num < 0) {
        toast.error(`Giá trị "${f.label}" không hợp lệ`);
        return;
      }
      data[f.key] = num;
    }
    startTransition(async () => {
      const result = await updateInvoice(invoice.id, data, invoice.roomId);
      if (result.error) toast.error(result.error);
      else {
        toast.success("Đã cập nhật hoá đơn");
        onOpenChange(false);
      }
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Sửa hoá đơn</DialogTitle>
        <DialogDescription>
          {invoice.room?.name ? `${invoice.room.name} · ` : ""}
          {formatMonth(invoice.month, invoice.year)} — tổng tiền sẽ được tính
          lại.
        </DialogDescription>
      </DialogHeader>
      {/* Only the field grid scrolls, so the title and the save button stay
          reachable on short viewports. */}
      <div className="grid min-w-0 flex-1 gap-3 overflow-y-auto sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} className="grid gap-1.5">
            <Label htmlFor={`edit-${f.key}`}>{f.label}</Label>
            <Input
              id={`edit-${f.key}`}
              type="number"
              min={0}
              inputMode="numeric"
              value={draft[f.key] ?? ""}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, [f.key]: e.target.value }))
              }
            />
          </div>
        ))}
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
          Lưu
        </Button>
      </DialogFooter>
    </>
  );
}

export function EditInvoiceDialog({
  invoice,
  onOpenChange,
}: {
  invoice: Invoice | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={invoice !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        {invoice ? (
          <EditInvoiceForm
            key={invoice.id}
            invoice={invoice}
            onOpenChange={onOpenChange}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
