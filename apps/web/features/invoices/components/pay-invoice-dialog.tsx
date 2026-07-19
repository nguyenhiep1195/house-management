"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { payInvoice } from "@/features/invoices/actions";
import {
  PAYMENT_METHOD_LABEL,
  type Invoice,
  type PaymentMethod,
} from "@/features/invoices/types";
import { formatCurrency, formatMonth } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface PayInvoiceDialogProps {
  invoice: Invoice | null;
  onOpenChange: (open: boolean) => void;
}

export function PayInvoiceDialog({
  invoice,
  onOpenChange,
}: PayInvoiceDialogProps) {
  const [pending, startTransition] = React.useTransition();
  const [method, setMethod] = React.useState<PaymentMethod>("CASH");

  function handleConfirm() {
    if (!invoice) return;
    startTransition(async () => {
      const result = await payInvoice(invoice.id, method, invoice.roomId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Đã xác nhận thanh toán");
        onOpenChange(false);
      }
    });
  }

  return (
    <Dialog open={!!invoice} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Xác nhận thanh toán</DialogTitle>
          <DialogDescription>
            {invoice
              ? `Hoá đơn ${formatMonth(invoice.month, invoice.year)} — ${formatCurrency(invoice.totalAmount)}`
              : null}
          </DialogDescription>
        </DialogHeader>
        <RadioGroup
          value={method}
          onValueChange={(value) => setMethod(value as PaymentMethod)}
          className="grid gap-3"
        >
          {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((key) => (
            <div key={key} className="flex items-center gap-2">
              <RadioGroupItem id={`pay-${key}`} value={key} />
              <Label htmlFor={`pay-${key}`}>{PAYMENT_METHOD_LABEL[key]}</Label>
            </div>
          ))}
        </RadioGroup>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Huỷ
          </Button>
          <Button onClick={handleConfirm} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Xác nhận đã thanh toán
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
