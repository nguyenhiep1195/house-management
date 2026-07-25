import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getCurrentUser, getSessionToken } from "@/features/auth/session";
import { FeeSettingsSection } from "@/features/settings/components/fee-settings-section";
import { SettingsTabs } from "@/features/settings/components/settings-tabs";
import type { FeeSetting, FeeSettingHistory } from "@/features/settings/types";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = {
  title: "Cài đặt",
};

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const token = await getSessionToken();
  let feeSettings: FeeSetting[] = [];
  let historyByType: Record<number, FeeSettingHistory[]> = {};
  if (token) {
    const settingsRes = await apiFetch<FeeSetting[]>("/settings", { token });
    feeSettings = settingsRes.data ?? [];
    const histories = await Promise.all(
      feeSettings.map((s) =>
        apiFetch<FeeSettingHistory[]>(`/settings/${s.id}/history`, { token }),
      ),
    );
    historyByType = Object.fromEntries(
      feeSettings.map((s, i) => [s.id, histories[i].data ?? []]),
    );
  }

  return (
    <>
      <PageHeader
        title="Cài đặt"
        description="Quản lý giao diện và thông tin tài khoản"
      />
      <Suspense fallback={null}>
        <SettingsTabs user={user} />
      </Suspense>
      {feeSettings.length > 0 ? (
        <Suspense fallback={null}>
          <FeeSettingsSection
            settings={feeSettings}
            historyByType={historyByType}
          />
        </Suspense>
      ) : null}
    </>
  );
}
