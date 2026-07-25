"use client";

import { useRouter } from "next/navigation";
import { LayoutGrid, List } from "lucide-react";

import { Button } from "@/components/ui/button";

export function InvoiceViewToggle({
  view,
  month,
  year,
}: {
  view: "list" | "grid";
  month: number;
  year: number;
}) {
  const router = useRouter();
  function go(next: "list" | "grid") {
    router.push(`/invoices?month=${month}&year=${year}&view=${next}`);
  }
  return (
    <div className="inline-flex rounded-md border">
      <Button
        type="button"
        variant={view === "list" ? "secondary" : "ghost"}
        size="icon"
        aria-label="Dạng danh sách"
        aria-pressed={view === "list"}
        className="rounded-r-none"
        onClick={() => go("list")}
      >
        <List className="size-4" />
      </Button>
      <Button
        type="button"
        variant={view === "grid" ? "secondary" : "ghost"}
        size="icon"
        aria-label="Dạng lưới"
        aria-pressed={view === "grid"}
        className="rounded-l-none"
        onClick={() => go("grid")}
      >
        <LayoutGrid className="size-4" />
      </Button>
    </div>
  );
}
