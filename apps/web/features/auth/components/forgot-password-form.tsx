"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordForm() {
  const [submitting, setSubmitting] = React.useState(false);
  const [sentTo, setSentTo] = React.useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "");

    setSubmitting(true);
    // TODO: gọi API gửi email đặt lại mật khẩu ở đây
    await new Promise((resolve) => setTimeout(resolve, 800));
    setSubmitting(false);
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MailCheck className="size-6" />
          </div>
          <CardTitle className="text-xl">Kiểm tra email của bạn</CardTitle>
          <CardDescription>
            Chúng tôi đã gửi liên kết đặt lại mật khẩu tới{" "}
            <span className="font-medium text-foreground">{sentTo}</span>. Vui
            lòng kiểm tra hộp thư (kể cả mục spam).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <Button variant="outline" onClick={() => setSentTo(null)}>
            Gửi lại với email khác
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/login">
              <ArrowLeft className="size-4" />
              Quay lại đăng nhập
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Quên mật khẩu</CardTitle>
        <CardDescription>
          Nhập email đã đăng ký, chúng tôi sẽ gửi liên kết đặt lại mật khẩu
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="ban@example.com"
              autoComplete="email"
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Gửi liên kết đặt lại
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/login">
              <ArrowLeft className="size-4" />
              Quay lại đăng nhập
            </Link>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
