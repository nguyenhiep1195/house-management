import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = {
  title: "Bảo trì",
};

export default function MaintenancePage() {
  return (
    <PlaceholderPage
      title="Bảo trì"
      description="Theo dõi và xử lý các yêu cầu bảo trì"
    />
  );
}
