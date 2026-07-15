import { Home } from "lucide-react";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-4 sm:p-6">
      <div className="flex items-center gap-2 font-semibold">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Home className="size-4" />
        </div>
        House Management
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
