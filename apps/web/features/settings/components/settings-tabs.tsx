"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SessionUser } from "@/features/auth/types";
import { AppearanceSettings } from "@/features/settings/components/appearance-settings";
import { ProfileSettings } from "@/features/settings/components/profile-settings";

function parseTab(value: string | null): "appearance" | "profile" {
  return value === "profile" ? "profile" : "appearance";
}

export function SettingsTabs({ user }: { user: SessionUser }) {
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
        <TabsTrigger value="profile">Hồ sơ</TabsTrigger>
      </TabsList>
      <TabsContent value="appearance">
        <AppearanceSettings />
      </TabsContent>
      <TabsContent value="profile">
        <ProfileSettings user={user} />
      </TabsContent>
    </Tabs>
  );
}
