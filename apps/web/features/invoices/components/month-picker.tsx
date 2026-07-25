"use client";

import * as React from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export function MonthPicker({
  month,
  year,
  onChange,
}: {
  month: number;
  year: number;
  onChange: (month: number, year: number) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [viewYear, setViewYear] = React.useState(year);

  function handleOpenChange(next: boolean) {
    if (next) setViewYear(year);
    setOpen(next);
  }

  function select(nextMonth: number) {
    onChange(nextMonth, viewYear);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-40 justify-start font-normal">
          <CalendarDays className="size-4 text-muted-foreground" />
          Tháng {month}/{year}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="start">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Năm trước"
            onClick={() => setViewYear((y) => y - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm font-medium tabular-nums">{viewYear}</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Năm sau"
            onClick={() => setViewYear((y) => y + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {MONTHS.map((m) => {
            const isSelected = m === month && viewYear === year;
            return (
              <Button
                key={m}
                variant={isSelected ? "default" : "ghost"}
                size="sm"
                className={cn("font-normal", isSelected && "font-medium")}
                onClick={() => select(m)}
              >
                Tháng {m}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
