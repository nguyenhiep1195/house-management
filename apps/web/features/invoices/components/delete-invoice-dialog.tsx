"use client";

import * as React from "react";
import { toast } from "sonner";

import { deleteInvoice } from "@/features/invoices/actions";
import type { Invoice } from "@/features/invoices/types";
import { formatMonth } from "@/lib/format";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DeleteInvoiceDialogProps {
  invoice: Invoice | null;
  onOpenChange: (open: boolean) => void;
}

export function DeleteInvoiceDialog({
  invoice,
  onOpenChange,
}: DeleteInvoiceDialogProps) {
  const [pending, startTransition] = React.useTransition();

  function handleConfirm(e: React.MouseEvent) {
    e.preventDefault();
    if (!invoice) return;
    startTransition(async () => {
      const result = await deleteInvoice(invoice.id, invoice.roomId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Đã xoá hoá đơn");
        onOpenChange(false);
      }
    });
  }

  return (
    <AlertDialog open={!!invoice} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xoá hoá đơn?</AlertDialogTitle>
          <AlertDialogDescription>
            Hoá đơn{" "}
            <span className="font-medium">
              {invoice?.room?.name ? `phòng ${invoice.room.name} ` : ""}
              kỳ {invoice ? formatMonth(invoice.month, invoice.year) : ""}
            </span>{" "}
            sẽ bị xoá vĩnh viễn. Hành động này không thể hoàn tác.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Huỷ</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Xoá hoá đơn
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
