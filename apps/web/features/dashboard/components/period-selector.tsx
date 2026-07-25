"use client";

import { useRouter } from "next/navigation";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export function PeriodSelector({
  year,
  month,
  years,
}: {
  year: number;
  month: number;
  years: number[];
}) {
  const router = useRouter();

  function go(nextYear: number, nextMonth: number) {
    router.push(`/?year=${nextYear}&month=${nextMonth}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="period-month" className="text-xs text-muted-foreground">
          Tháng
        </Label>
        <Select
          value={String(month)}
          onValueChange={(v) => go(year, Number(v))}
        >
          <SelectTrigger id="period-month" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((m) => (
              <SelectItem key={m} value={String(m)}>
                Tháng {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="period-year" className="text-xs text-muted-foreground">
          Năm
        </Label>
        <Select value={String(year)} onValueChange={(v) => go(Number(v), month)}>
          <SelectTrigger id="period-year" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
