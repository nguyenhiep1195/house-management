"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { CreateInvoiceDialog } from "@/features/invoices/components/create-invoice-dialog";
import { InvoiceList } from "@/features/invoices/components/invoice-list";
import type { Invoice } from "@/features/invoices/types";
import type { FeeSetting } from "@/features/settings/types";
import { Button } from "@/components/ui/button";

export function RoomInvoicesSection({
  roomId,
  roomName,
  invoices,
  feeSettings,
  defaultFeeSettingId,
}: {
  roomId: number;
  roomName: string;
  invoices: Invoice[];
  feeSettings: FeeSetting[];
  defaultFeeSettingId?: number | null;
}) {
  const [createOpen, setCreateOpen] = React.useState(false);
  const [dialogKey, setDialogKey] = React.useState(0);

  function openCreateDialog() {
    setDialogKey((k) => k + 1);
    setCreateOpen(true);
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Hoá đơn</h2>
        <Button variant="outline" onClick={openCreateDialog}>
          <Plus className="size-4" />
          Tạo hoá đơn
        </Button>
      </div>
      <InvoiceList invoices={invoices} />
      <CreateInvoiceDialog
        key={dialogKey}
        open={createOpen}
        onOpenChange={setCreateOpen}
        roomId={roomId}
        roomName={roomName}
        feeSettings={feeSettings}
        defaultFeeSettingId={defaultFeeSettingId}
      />
    </section>
  );
}
