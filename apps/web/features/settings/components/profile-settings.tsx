"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import type { SessionUser } from "@/features/auth/types";

export function ProfileSettings({ user }: { user: SessionUser }) {
  const [saving, setSaving] = React.useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    // TODO: gọi API cập nhật hồ sơ ở đây
    await new Promise((resolve) => setTimeout(resolve, 800));
    setSaving(false);
    toast.success("Đã lưu thông tin hồ sơ");
  }

  return (
    <Card>
      <form onSubmit={onSubmit}>
        <CardHeader>
          <CardTitle>Hồ sơ</CardTitle>
          <CardDescription>
            Thông tin tài khoản quản trị của bạn
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 py-6 sm:max-w-md">
          <div className="grid gap-2">
            <Label htmlFor="username">Tên đăng nhập</Label>
            <Input
              id="username"
              name="username"
              defaultValue={user.username}
              readOnly
              disabled
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="name">Họ và tên</Label>
            <Input id="name" name="name" defaultValue={user.name} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={user.email ?? ""}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="phone">Số điện thoại</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={user.phone ?? ""}
              placeholder="0912 345 678"
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Lưu thay đổi
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
