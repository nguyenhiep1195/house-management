import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = {
  title: "Cư dân",
};

export default function ResidentsPage() {
  return (
    <PlaceholderPage
      title="Cư dân"
      description="Quản lý thông tin cư dân trong hệ thống"
    />
  );
}
