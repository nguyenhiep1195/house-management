"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  Pencil,
  Receipt,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { unpayInvoice } from "@/features/invoices/actions";
import {
  PAYMENT_METHOD_LABEL,
  type Invoice,
} from "@/features/invoices/types";
import { computeFeeLines } from "@/features/invoices/lib/fee-lines";
import { formatCurrency, formatDate, formatMonth } from "@/lib/format";
import { InvoiceDetailDialog } from "./invoice-detail-dialog";
import { EditInvoiceDialog } from "./edit-invoice-dialog";
import { PayInvoiceDialog } from "./pay-invoice-dialog";
import { DeleteInvoiceDialog } from "./delete-invoice-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function InvoiceList({
  invoices,
  showRoom = false,
}: {
  invoices: Invoice[];
  showRoom?: boolean;
}) {
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
  const [expanded, setExpanded] = React.useState<number | null>(null);
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

  const colSpan = showRoom ? 9 : 8;

  return (
    <>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Kỳ</TableHead>
              {showRoom ? <TableHead>Phòng</TableHead> : null}
              <TableHead>Tiền phòng</TableHead>
              <TableHead>Điện</TableHead>
              <TableHead>Nước</TableHead>
              <TableHead>Phí khác</TableHead>
              <TableHead>Tổng cộng</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => {
              const { electricityAmount, waterAmount, extraFees, lines } =
                computeFeeLines(invoice);
              const isOpen = expanded === invoice.id;
              return (
                <React.Fragment key={invoice.id}>
                  <TableRow>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={isOpen ? "Thu gọn" : "Xem thêm"}
                        onClick={() =>
                          setExpanded(isOpen ? null : invoice.id)
                        }
                      >
                        {isOpen ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatMonth(invoice.month, invoice.year)}
                    </TableCell>
                    {showRoom ? (
                      <TableCell>{invoice.room?.name ?? "—"}</TableCell>
                    ) : null}
                    <TableCell className="tabular-nums">
                      {formatCurrency(invoice.roomPrice)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatCurrency(electricityAmount)}
                      <span className="block text-xs text-muted-foreground">
                        {invoice.electricityPrev} → {invoice.electricityCurrent}
                      </span>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatCurrency(waterAmount)}
                      <span className="block text-xs text-muted-foreground">
                        {invoice.waterPrev} → {invoice.waterCurrent}
                      </span>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatCurrency(extraFees)}
                    </TableCell>
                    <TableCell className="font-medium tabular-nums">
                      {formatCurrency(invoice.totalAmount)}
                    </TableCell>
                    <TableCell>
                      {invoice.status === "PAID" ? (
                        <Badge variant="outline">
                          Đã thanh toán
                          {invoice.paymentMethod
                            ? ` · ${PAYMENT_METHOD_LABEL[invoice.paymentMethod]}`
                            : ""}
                        </Badge>
                      ) : (
                        <Badge variant="destructive">Chưa thanh toán</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {invoice.status === "UNPAID" ? (
                          <Button
                            size="sm"
                            onClick={() => setPayingInvoice(invoice)}
                          >
                            Thanh toán
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
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
                    </TableCell>
                  </TableRow>
                  {isOpen ? (
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell />
                      <TableCell colSpan={colSpan - 1}>
                        <dl className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
                          {lines.map((line) => (
                            <div
                              key={line.label}
                              className="flex items-center justify-between gap-4 py-0.5 text-sm"
                            >
                              <dt className="text-muted-foreground">
                                {line.label}
                                {line.hint ? (
                                  <span className="ml-1 text-xs">
                                    ({line.hint})
                                  </span>
                                ) : null}
                              </dt>
                              <dd className="tabular-nums">
                                {formatCurrency(line.value)}
                              </dd>
                            </div>
                          ))}
                          <div className="mt-1 flex items-center justify-between gap-4 border-t pt-2 font-semibold sm:col-span-2">
                            <dt>Tổng cộng</dt>
                            <dd className="tabular-nums">
                              {formatCurrency(invoice.totalAmount)}
                            </dd>
                          </div>
                        </dl>
                        {invoice.status === "PAID" && invoice.paidAt ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Thanh toán ngày {formatDate(invoice.paidAt)}
                          </p>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
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
