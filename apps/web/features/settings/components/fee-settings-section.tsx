"use client";

import type { FeeSetting, FeeSettingHistory } from "@/features/settings/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FeeHistoryTable } from "./fee-history-table";
import { FeeSettingsForm } from "./fee-settings-form";

export function FeeSettingsSection({
  setting,
  history,
}: {
  setting: FeeSetting;
  history: FeeSettingHistory[];
}) {
  return (
    <Tabs defaultValue="edit" className="gap-4">
      <TabsList>
        <TabsTrigger value="edit">Cài đặt phí</TabsTrigger>
        <TabsTrigger value="history">Lịch sử</TabsTrigger>
      </TabsList>
      <TabsContent value="edit">
        <FeeSettingsForm setting={setting} />
      </TabsContent>
      <TabsContent value="history">
        <FeeHistoryTable history={history} />
      </TabsContent>
    </Tabs>
  );
}
