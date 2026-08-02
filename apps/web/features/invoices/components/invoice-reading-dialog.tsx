"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { Invoice } from "@/features/invoices/types";
import { bulkUpdateReadings } from "@/features/rooms/actions";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Updates one room's meter reading for the period of a single invoice, and
 * shows what that does to the total before it is saved.
 *
 * The preview mirrors the server's resyncFromPeriod: consumption times the
 * invoice's own stored unit price, plus the stored fixed fees. Everything it
 * needs is already on the invoice, so the dialog never fetches.
 */
export function InvoiceReadingDialog({
  invoice,
  onOpenChange,
}: {
  invoice: Invoice | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!invoice} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Keyed so opening a different invoice remounts with a fresh draft
            instead of carrying the previous room's numbers over. */}
        {invoice ? (
          <ReadingForm
            key={invoice.id}
            invoice={invoice}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ReadingForm({
  invoice,
  onDone,
}: {
  invoice: Invoice;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [electricity, setElectricity] = React.useState(
    String(invoice.electricityCurrent),
  );
  const [water, setWater] = React.useState(String(invoice.waterCurrent));

  const nextElectricity =
    electricity === "" ? invoice.electricityPrev : Number(electricity);
  const nextWater = water === "" ? invoice.waterPrev : Number(water);
  const electricityValid =
    Number.isInteger(nextElectricity) &&
    nextElectricity >= invoice.electricityPrev;
  const waterValid =
    Number.isInteger(nextWater) && nextWater >= invoice.waterPrev;

  const electricityUsed = nextElectricity - invoice.electricityPrev;
  const waterUsed = nextWater - invoice.waterPrev;
  const electricityAmount = electricityUsed * invoice.electricityUnitPrice;
  const waterAmount = waterUsed * invoice.waterUnitPrice;
  const nextTotal =
    invoice.roomPrice +
    electricityAmount +
    waterAmount +
    invoice.internetFee +
    invoice.elevatorFee +
    invoice.cleaningFee +
    invoice.motorbikeFee +
    invoice.otherFee;

  function handleSubmit() {
    if (!electricityValid || !waterValid) {
      toast.error(
        "Chỉ số mới phải là số nguyên và không nhỏ hơn chỉ số kỳ trước",
      );
      return;
    }
    startTransition(async () => {
      const result = await bulkUpdateReadings(
        [
          {
            roomId: invoice.roomId,
            electricityReading: nextElectricity,
            waterReading: nextWater,
          },
        ],
        invoice.year,
        invoice.month,
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Đã cập nhật chỉ số và tính lại hoá đơn");
      onDone();
      router.refresh();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="break-words">
          Chỉ số phòng {invoice.room?.name ?? "—"} ·{" "}
          {formatMonth(invoice.month, invoice.year)}
        </DialogTitle>
        <DialogDescription>
          Lưu chỉ số sẽ tính lại tiền điện nước của hoá đơn kỳ này.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="invoice-reading-electricity">
            Chỉ số điện (kWh)
          </Label>
          <p className="text-xs text-muted-foreground tabular-nums">
            Kỳ trước: {invoice.electricityPrev}
          </p>
          <Input
            id="invoice-reading-electricity"
            type="number"
            inputMode="numeric"
            min={invoice.electricityPrev}
            value={electricity}
            onChange={(e) => setElectricity(e.target.value)}
            aria-invalid={!electricityValid}
            aria-describedby={
              electricityValid ? undefined : "invoice-reading-electricity-error"
            }
          />
          {/* Errors sit under the field they belong to, not only in a toast. */}
          {electricityValid ? null : (
            <p
              id="invoice-reading-electricity-error"
              role="alert"
              className="text-xs text-destructive"
            >
              Phải là số nguyên và không nhỏ hơn {invoice.electricityPrev}
            </p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="invoice-reading-water">Chỉ số nước (m³)</Label>
          <p className="text-xs text-muted-foreground tabular-nums">
            Kỳ trước: {invoice.waterPrev}
          </p>
          <Input
            id="invoice-reading-water"
            type="number"
            inputMode="numeric"
            min={invoice.waterPrev}
            value={water}
            onChange={(e) => setWater(e.target.value)}
            aria-invalid={!waterValid}
            aria-describedby={
              waterValid ? undefined : "invoice-reading-water-error"
            }
          />
          {waterValid ? null : (
            <p
              id="invoice-reading-water-error"
              role="alert"
              className="text-xs text-destructive"
            >
              Phải là số nguyên và không nhỏ hơn {invoice.waterPrev}
            </p>
          )}
        </div>

        <dl
          aria-live="polite"
          className="grid gap-1 rounded-lg border bg-muted/30 p-3 text-sm"
        >
          <div className="flex items-baseline justify-between gap-4">
            <dt className="min-w-0 text-muted-foreground">
              Điện
              <span className="ml-1 text-xs tabular-nums">
                {electricityValid ? `${electricityUsed} kWh` : "—"}
              </span>
            </dt>
            <dd className="shrink-0 tabular-nums">
              {electricityValid ? formatCurrency(electricityAmount) : "—"}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="min-w-0 text-muted-foreground">
              Nước
              <span className="ml-1 text-xs tabular-nums">
                {waterValid ? `${waterUsed} m³` : "—"}
              </span>
            </dt>
            <dd className="shrink-0 tabular-nums">
              {waterValid ? formatCurrency(waterAmount) : "—"}
            </dd>
          </div>
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 border-t pt-2 font-semibold">
            <dt>Tổng cộng</dt>
            <dd className="tabular-nums">
              <span className="mr-2 text-xs font-normal text-muted-foreground line-through">
                {formatCurrency(invoice.totalAmount)}
              </span>
              {electricityValid && waterValid ? formatCurrency(nextTotal) : "—"}
            </dd>
          </div>
        </dl>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onDone}
          disabled={pending}
        >
          Huỷ
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={pending || !electricityValid || !waterValid}
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Lưu chỉ số
        </Button>
      </DialogFooter>
    </>
  );
}
