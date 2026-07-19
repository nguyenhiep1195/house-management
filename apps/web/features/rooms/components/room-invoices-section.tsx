"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { CreateInvoiceDialog } from "@/features/invoices/components/create-invoice-dialog";
import { InvoiceList } from "@/features/invoices/components/invoice-list";
import type { Invoice } from "@/features/invoices/types";
import { Button } from "@/components/ui/button";

export function RoomInvoicesSection({
  roomId,
  roomName,
  invoices,
}: {
  roomId: number;
  roomName: string;
  invoices: Invoice[];
}) {
  const [createOpen, setCreateOpen] = React.useState(false);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Hoá đơn</h2>
        <Button variant="outline" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Tạo hoá đơn
        </Button>
      </div>
      <InvoiceList invoices={invoices} />
      <CreateInvoiceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        roomId={roomId}
        roomName={roomName}
      />
    </section>
  );
}
