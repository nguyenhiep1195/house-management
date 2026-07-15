import { Construction } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";

interface PlaceholderPageProps {
  title: string;
  description?: string;
}

/** Empty state for routes that are planned but not yet implemented. */
export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-10 text-center">
        <Construction className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Tính năng đang được phát triển
        </p>
      </div>
    </>
  );
}
