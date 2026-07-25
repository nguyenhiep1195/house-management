"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  updateFeeSettings,
  type FeeSettingFormState,
} from "@/features/settings/actions";
import type { FeeSetting } from "@/features/settings/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: FeeSettingFormState = { error: null };

const FIELDS: { name: keyof FeeSetting; label: string; hint?: string }[] = [
  { name: "electricityUnitPrice", label: "Đơn giá điện (đ/kWh)" },
  { name: "waterUnitPrice", label: "Đơn giá nước (đ/m³)" },
  { name: "internetFee", label: "Phí internet (đ/phòng/tháng)" },
  { name: "elevatorFeePerPerson", label: "Phí thang máy (đ/người/tháng)" },
  { name: "cleaningFeePerPerson", label: "Phí vệ sinh (đ/người/tháng)" },
  {
    name: "motorbikeFeePerExtra",
    label: "Phí xe máy vượt định mức (đ/xe/tháng)",
  },
  {
    name: "freeMotorbikeCount",
    label: "Số xe máy miễn phí (xe/phòng)",
    hint: "Mặc định 2 xe đầu miễn phí",
  },
  { name: "otherFee", label: "Phí khác (đ/phòng/tháng)" },
];

export function FeeSettingsForm({ setting }: { setting: FeeSetting }) {
  const [state, formAction, pending] = useActionState(
    updateFeeSettings,
    initialState,
  );

  React.useEffect(() => {
    if (state.success) toast.success("Đã lưu cài đặt phí");
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cài đặt phí</CardTitle>
        <CardDescription>
          Đơn giá dùng để tính hoá đơn hàng tháng. Hoá đơn đã tạo không bị ảnh
          hưởng.
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <input type="hidden" name="id" value={setting.id} />
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor={`fee-name-${setting.id}`}>Tên loại phí</Label>
            <Input
              id={`fee-name-${setting.id}`}
              name="name"
              defaultValue={setting.name}
              maxLength={50}
              required
            />
          </div>
          {FIELDS.map((field) => (
            <div key={field.name} className="grid gap-2">
              <Label htmlFor={`fee-${field.name}`}>{field.label}</Label>
              <Input
                id={`fee-${field.name}`}
                name={field.name}
                type="number"
                min={0}
                step={1}
                defaultValue={setting[field.name] as number}
                required
              />
              {field.hint ? (
                <p className="text-xs text-muted-foreground">{field.hint}</p>
              ) : null}
            </div>
          ))}
          {state.error ? (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {state.error}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Lưu cài đặt
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
