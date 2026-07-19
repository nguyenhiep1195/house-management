"use client";

import * as React from "react";
import { MoreHorizontal, Receipt } from "lucide-react";
import { toast } from "sonner";

import { deleteInvoice, unpayInvoice } from "@/features/invoices/actions";
import {
  PAYMENT_METHOD_LABEL,
  type Invoice,
} from "@/features/invoices/types";
import { formatCurrency, formatMonth } from "@/lib/format";
import { PayInvoiceDialog } from "./pay-invoice-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const [, startTransition] = React.useTransition();

  function handleUnpay(invoice: Invoice) {
    startTransition(async () => {
      const result = await unpayInvoice(invoice.id, invoice.roomId);
      if (result.error) toast.error(result.error);
      else toast.success("Đã chuyển về chưa thanh toán");
    });
  }

  function handleDelete(invoice: Invoice) {
    startTransition(async () => {
      const result = await deleteInvoice(invoice.id, invoice.roomId);
      if (result.error) toast.error(result.error);
      else toast.success("Đã xoá hoá đơn");
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
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kỳ</TableHead>
              {showRoom ? <TableHead>Phòng</TableHead> : null}
              <TableHead>Tiền phòng</TableHead>
              <TableHead>Điện</TableHead>
              <TableHead>Nước</TableHead>
              <TableHead>Phí khác</TableHead>
              <TableHead>Tổng cộng</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => {
              const electricityAmount =
                (invoice.electricityCurrent - invoice.electricityPrev) *
                invoice.electricityUnitPrice;
              const waterAmount =
                (invoice.waterCurrent - invoice.waterPrev) *
                invoice.waterUnitPrice;
              const extraFees =
                invoice.internetFee +
                invoice.elevatorFee +
                invoice.cleaningFee +
                invoice.motorbikeFee +
                invoice.otherFee;
              return (
                <TableRow key={invoice.id}>
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
                          Xác nhận đã thanh toán
                        </Button>
                      ) : null}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Thao tác với hoá đơn"
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {invoice.status === "PAID" ? (
                            <DropdownMenuItem
                              onSelect={() => handleUnpay(invoice)}
                            >
                              Chuyển về chưa thanh toán
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={invoice.status === "PAID"}
                            onSelect={() => handleDelete(invoice)}
                          >
                            Xoá hoá đơn
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <PayInvoiceDialog
        invoice={payingInvoice}
        onOpenChange={(open) => !open && setPayingInvoice(null)}
      />
    </>
  );
}
