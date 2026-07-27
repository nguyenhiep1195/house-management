"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SessionUser } from "@/features/auth/types";
import { AppearanceSettings } from "@/features/settings/components/appearance-settings";
import { FeeSettingsSection } from "@/features/settings/components/fee-settings-section";
import { ProfileSettings } from "@/features/settings/components/profile-settings";
import type { FeeSetting, FeeSettingHistory } from "@/features/settings/types";

type SettingsTab = "appearance" | "fee" | "profile";

function parseTab(value: string | null): SettingsTab {
  if (value === "fee") return "fee";
  if (value === "profile") return "profile";
  return "appearance";
}

export function SettingsTabs({
  user,
  feeSettings,
  historyByType,
}: {
  user: SessionUser;
  feeSettings: FeeSetting[];
  historyByType: Record<number, FeeSettingHistory[]>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  function onTabChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    router.push(`/settings?${params.toString()}`, { scroll: false });
  }

  return (
    <Tabs value={tab} onValueChange={onTabChange} className="gap-6">
      <TabsList>
        <TabsTrigger value="appearance">Giao diện</TabsTrigger>
        <TabsTrigger value="fee">Cài đặt phí</TabsTrigger>
        <TabsTrigger value="profile">Hồ sơ</TabsTrigger>
      </TabsList>
      <TabsContent value="appearance">
        <AppearanceSettings />
      </TabsContent>
      <TabsContent value="fee">
        <FeeSettingsSection
          settings={feeSettings}
          historyByType={historyByType}
        />
      </TabsContent>
      <TabsContent value="profile">
        <ProfileSettings user={user} />
      </TabsContent>
    </Tabs>
  );
}
