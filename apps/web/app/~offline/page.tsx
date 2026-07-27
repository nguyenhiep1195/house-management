import type { Metadata } from "next";
import { WifiOff } from "lucide-react";

export const metadata: Metadata = {
  title: "Ngoại tuyến",
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <WifiOff className="size-12 text-muted-foreground" aria-hidden />
      <h1 className="text-xl font-semibold">Bạn đang ngoại tuyến</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Không có kết nối mạng nên không thể tải trang này. Vui lòng kiểm tra kết
        nối và thử lại.
      </p>
    </main>
  );
}
