"use client";

import * as React from "react";
import { Eye, Pencil, Receipt, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { unpayInvoice } from "@/features/invoices/actions";
import { type Invoice } from "@/features/invoices/types";
import { computeFeeLines } from "@/features/invoices/lib/fee-lines";
import { formatCurrency, formatMonth } from "@/lib/format";
import { InvoiceDetailDialog } from "./invoice-detail-dialog";
import { EditInvoiceDialog } from "./edit-invoice-dialog";
import { PayInvoiceDialog } from "./pay-invoice-dialog";
import { DeleteInvoiceDialog } from "./delete-invoice-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function InvoiceGrid({ invoices }: { invoices: Invoice[] }) {
  const [payingInvoice, setPayingInvoice] = React.useState<Invoice | null>(
    null,
  );
  const [detailInvoice, setDetailInvoice] = React.useState<Invoice | null>(
    null,
  );
  const [editingInvoice, setEditingInvoice] = React.useState<Invoice | null>(
    null,
  );
  const [deletingInvoice, setDeletingInvoice] = React.useState<Invoice | null>(
    null,
  );
  const [, startTransition] = React.useTransition();

  function handleUnpay(invoice: Invoice) {
    startTransition(async () => {
      const result = await unpayInvoice(invoice.id, invoice.roomId);
      if (result.error) toast.error(result.error);
      else toast.success("Đã chuyển về chưa thanh toán");
    });
  }

  if (invoices.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
        <Receipt className="size-8 text-muted-foreground" />
        <p className="font-medium">Chưa có hoá đơn nào</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {invoices.map((invoice) => {
          const { electricityAmount, waterAmount, extraFees } =
            computeFeeLines(invoice);
          return (
            <Card key={invoice.id} className="flex flex-col">
              <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
                <div>
                  <CardTitle className="text-base">
                    {invoice.room?.name ?? "—"}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {formatMonth(invoice.month, invoice.year)}
                  </p>
                </div>
                {invoice.status === "PAID" ? (
                  <Badge variant="outline">Đã thanh toán</Badge>
                ) : (
                  <Badge variant="destructive">Chưa thanh toán</Badge>
                )}
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <dl className="grid gap-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Tiền phòng</dt>
                    <dd className="tabular-nums">
                      {formatCurrency(invoice.roomPrice)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Điện</dt>
                    <dd className="tabular-nums">
                      {formatCurrency(electricityAmount)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Nước</dt>
                    <dd className="tabular-nums">
                      {formatCurrency(waterAmount)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Phí khác</dt>
                    <dd className="tabular-nums">
                      {formatCurrency(extraFees)}
                    </dd>
                  </div>
                  <div className="mt-1 flex justify-between border-t pt-1 font-semibold">
                    <dt>Tổng cộng</dt>
                    <dd className="tabular-nums">
                      {formatCurrency(invoice.totalAmount)}
                    </dd>
                  </div>
                </dl>
                <div className="mt-auto flex items-center gap-1">
                  {invoice.status === "UNPAID" ? (
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => setPayingInvoice(invoice)}
                    >
                      Thanh toán
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleUnpay(invoice)}
                    >
                      Huỷ TT
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Xem chi tiết"
                    title="Xem chi tiết"
                    onClick={() => setDetailInvoice(invoice)}
                  >
                    <Eye className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Sửa hoá đơn"
                    title="Sửa hoá đơn"
                    disabled={invoice.status === "PAID"}
                    onClick={() => setEditingInvoice(invoice)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Xoá hoá đơn"
                    title="Xoá hoá đơn"
                    disabled={invoice.status === "PAID"}
                    onClick={() => setDeletingInvoice(invoice)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <PayInvoiceDialog
        invoice={payingInvoice}
        onOpenChange={(open) => !open && setPayingInvoice(null)}
      />
      <InvoiceDetailDialog
        invoice={detailInvoice}
        onOpenChange={(open) => !open && setDetailInvoice(null)}
      />
      <EditInvoiceDialog
        invoice={editingInvoice}
        onOpenChange={(open) => !open && setEditingInvoice(null)}
      />
      <DeleteInvoiceDialog
        invoice={deletingInvoice}
        onOpenChange={(open) => !open && setDeletingInvoice(null)}
      />
    </>
  );
}
