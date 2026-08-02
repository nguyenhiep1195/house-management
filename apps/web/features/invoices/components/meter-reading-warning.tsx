"use client";

import { TriangleAlert } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Flags an invoice billed before its meter reading was entered — electricity
 * and water came out at zero consumption. The reason is spelled out in text
 * (tooltip + sr-only) so the warning never rests on colour alone, and the
 * trigger is focusable so the tooltip is reachable by keyboard.
 */
export function MeterReadingWarning({
  month,
  year,
}: {
  month: number;
  year: number;
}) {
  const label = `Chưa cập nhật chỉ số điện nước tháng ${month}/${year}`;
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={label}
        className="inline-flex rounded-sm align-middle text-amber-600 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:text-amber-500"
      >
        <TriangleAlert className="size-4" aria-hidden />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
