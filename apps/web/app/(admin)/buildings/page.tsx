import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = {
  title: "Toà nhà",
};

export default function BuildingsPage() {
  return (
    <PlaceholderPage
      title="Toà nhà"
      description="Danh sách và thông tin các toà nhà"
    />
  );
}
