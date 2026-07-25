"use client";

import {
  PAYMENT_METHOD_LABEL,
  type Invoice,
} from "@/features/invoices/types";
import { computeFeeLines } from "@/features/invoices/lib/fee-lines";
import { formatCurrency, formatDate, formatMonth } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function InvoiceDetailDialog({
  invoice,
  onOpenChange,
}: {
  invoice: Invoice | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={invoice !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {invoice ? (
          <>
            <DialogHeader>
              <DialogTitle>
                Hoá đơn {invoice.room?.name ? `${invoice.room.name} · ` : ""}
                {formatMonth(invoice.month, invoice.year)}
              </DialogTitle>
              <DialogDescription>
                {invoice.status === "PAID" ? (
                  <Badge variant="outline">
                    Đã thanh toán
                    {invoice.paymentMethod
                      ? ` · ${PAYMENT_METHOD_LABEL[invoice.paymentMethod]}`
                      : ""}
                    {invoice.paidAt ? ` · ${formatDate(invoice.paidAt)}` : ""}
                  </Badge>
                ) : (
                  <Badge variant="destructive">Chưa thanh toán</Badge>
                )}
              </DialogDescription>
            </DialogHeader>
            <dl className="divide-y text-sm">
              {computeFeeLines(invoice).lines.map((line) => (
                <div
                  key={line.label}
                  className="flex items-center justify-between gap-4 py-2"
                >
                  <dt className="text-muted-foreground">
                    {line.label}
                    {line.hint ? (
                      <span className="block text-xs">{line.hint}</span>
                    ) : null}
                  </dt>
                  <dd className="tabular-nums">{formatCurrency(line.value)}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-4 py-2 font-semibold">
                <dt>Tổng cộng</dt>
                <dd className="tabular-nums">
                  {formatCurrency(invoice.totalAmount)}
                </dd>
              </div>
            </dl>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
