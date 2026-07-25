"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { setDefaultFeeType } from "@/features/settings/actions";
import type { FeeSetting, FeeSettingHistory } from "@/features/settings/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateFeeTypeDialog } from "./create-fee-type-dialog";
import { DeleteFeeTypeDialog } from "./delete-fee-type-dialog";
import { FeeHistoryTable } from "./fee-history-table";
import { FeeSettingsForm } from "./fee-settings-form";

type FeeTab = "edit" | "history";

function parseFeeTab(value: string | null): FeeTab {
  return value === "history" ? "history" : "edit";
}

export function FeeSettingsSection({
  settings,
  historyByType,
}: {
  settings: FeeSetting[];
  historyByType: Record<number, FeeSettingHistory[]>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const feeTab = parseFeeTab(searchParams.get("feeTab"));

  const [createOpen, setCreateOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<FeeSetting | null>(null);
  const [settingDefaultId, setSettingDefaultId] = React.useState<number | null>(
    null,
  );

  // Active fee type from the URL, falling back to the default (first) type.
  const paramId = Number(searchParams.get("feeType"));
  const activeId =
    settings.find((s) => s.id === paramId)?.id ?? settings[0]?.id ?? 0;

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.push(`/settings?${params.toString()}`, { scroll: false });
  }

  function handleSetDefault(id: number) {
    setSettingDefaultId(id);
    void setDefaultFeeType(id)
      .then((res) => {
        if (res.error) toast.error(res.error);
        else toast.success("Đã đặt loại phí mặc định");
      })
      .finally(() => setSettingDefaultId(null));
  }

  return (
    <Tabs
      value={String(activeId)}
      onValueChange={(v) => setParam("feeType", v)}
      className="gap-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList>
          {settings.map((s) => (
            <TabsTrigger key={s.id} value={String(s.id)}>
              {s.name}
            </TabsTrigger>
          ))}
        </TabsList>
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Thêm loại
        </Button>
      </div>

      {settings.map((s) => (
        <TabsContent
          key={s.id}
          value={String(s.id)}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-medium">{s.name}</span>
              {s.isDefault ? <Badge variant="secondary">Mặc định</Badge> : null}
            </div>
            <div className="flex items-center gap-2">
              {!s.isDefault ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSetDefault(s.id)}
                  disabled={settingDefaultId === s.id}
                >
                  {settingDefaultId === s.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Star className="size-4" />
                  )}
                  Đặt mặc định
                </Button>
              ) : null}
              {!s.isDefault ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleting(s)}
                >
                  <Trash2 className="size-4" />
                  Xoá
                </Button>
              ) : null}
            </div>
          </div>

          <Tabs
            value={feeTab}
            onValueChange={(v) => setParam("feeTab", v)}
            className="gap-4"
          >
            <TabsList>
              <TabsTrigger value="edit">Cài đặt phí</TabsTrigger>
              <TabsTrigger value="history">Lịch sử</TabsTrigger>
            </TabsList>
            <TabsContent value="edit">
              <FeeSettingsForm setting={s} />
            </TabsContent>
            <TabsContent value="history">
              <FeeHistoryTable history={historyByType[s.id] ?? []} />
            </TabsContent>
          </Tabs>
        </TabsContent>
      ))}

      <CreateFeeTypeDialog open={createOpen} onOpenChange={setCreateOpen} />
      <DeleteFeeTypeDialog
        feeType={deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        onDeleted={() => setParam("feeType", String(settings[0]?.id ?? 0))}
      />
    </Tabs>
  );
}
