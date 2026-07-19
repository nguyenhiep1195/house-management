"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Zap } from "lucide-react";
import { toast } from "sonner";

import { generateInvoices } from "@/features/invoices/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function InvoicesToolbar({
  month,
  year,
}: {
  month: number;
  year: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function navigate(nextMonth: number, nextYear: number) {
    router.push(`/invoices?month=${nextMonth}&year=${nextYear}`);
  }

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateInvoices(month, year);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(
          `Đã tạo ${result.created ?? 0} hoá đơn, bỏ qua ${result.skipped ?? 0} phòng đã có hoá đơn`,
        );
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="filter-month">Tháng</Label>
          <Input
            id="filter-month"
            type="number"
            min={1}
            max={12}
            className="w-20"
            value={month}
            onChange={(e) => navigate(Number(e.target.value), year)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="filter-year">Năm</Label>
          <Input
            id="filter-year"
            type="number"
            min={2000}
            max={2100}
            className="w-28"
            value={year}
            onChange={(e) => navigate(month, Number(e.target.value))}
          />
        </div>
      </div>
      <Button onClick={handleGenerate} disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Zap className="size-4" />
        )}
        Tạo hoá đơn tháng {month}/{year}
      </Button>
    </div>
  );
}
