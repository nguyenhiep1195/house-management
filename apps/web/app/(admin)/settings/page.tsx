import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppearanceSettings } from "@/features/settings/components/appearance-settings";
import { ProfileSettings } from "@/features/settings/components/profile-settings";

export const metadata: Metadata = {
  title: "Cài đặt",
};

export default function SettingsPage() {
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
    </>
  );
}
