import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { SiteHeader } from "@/components/layout/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getCurrentUser } from "@/features/auth/session";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) {
    // stale/invalid cookie — the clear route deletes it and sends us to /login
    redirect("/api/session/clear");
  }

  return (
    <SidebarProvider>
      <AppSidebar role={user.role} />
      <SidebarInset>
        <SiteHeader user={{ name: user.name, email: user.email }} />
        <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
