import type { Metadata } from "next";

import { getCurrentUser, getSessionToken } from "@/features/auth/session";
import { FeeSettingsSection } from "@/features/settings/components/fee-settings-section";
import type { FeeSetting, FeeSettingHistory } from "@/features/settings/types";
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
  let feeHistory: FeeSettingHistory[] = [];
  if (user?.role === "ADMIN" && token) {
    const [settingRes, historyRes] = await Promise.all([
      apiFetch<FeeSetting>("/settings", { token }),
      apiFetch<FeeSettingHistory[]>("/settings/history", { token }),
    ]);
    feeSetting = settingRes.data;
    feeHistory = historyRes.data ?? [];
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
      {feeSetting ? (
        <FeeSettingsSection setting={feeSetting} history={feeHistory} />
      ) : null}
    </>
  );
}
