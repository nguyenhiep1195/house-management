import type { Metadata } from "next";

import { getCurrentUser, getSessionToken } from "@/features/auth/session";
import { FeeSettingsForm } from "@/features/settings/components/fee-settings-form";
import type { FeeSetting } from "@/features/settings/types";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppearanceSettings } from "@/features/settings/components/appearance-settings";
import { ProfileSettings } from "@/features/settings/components/profile-settings";

export const metadata: Metadata = {
  title: "Cài đặt",
};

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const token = await getSessionToken();
  let feeSetting: FeeSetting | null = null;
  if (user?.role === "ADMIN" && token) {
    const res = await apiFetch<FeeSetting>("/settings", { token });
    feeSetting = res.data;
  }

  return (
    <>
      <PageHeader
        title="Cài đặt"
        description="Quản lý giao diện và thông tin tài khoản"
      />
      <Tabs defaultValue="appearance" className="gap-6">
        <TabsList>
          <TabsTrigger value="appearance">Giao diện</TabsTrigger>
          <TabsTrigger value="profile">Hồ sơ</TabsTrigger>
        </TabsList>
        <TabsContent value="appearance">
          <AppearanceSettings />
        </TabsContent>
        <TabsContent value="profile">
          <ProfileSettings />
        </TabsContent>
      </Tabs>
      {feeSetting ? <FeeSettingsForm setting={feeSetting} /> : null}
    </>
  );
}
