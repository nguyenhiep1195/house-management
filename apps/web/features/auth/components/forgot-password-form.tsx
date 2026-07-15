"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";

import {
  forgotPassword,
  type AuthFormState,
} from "@/features/auth/actions";
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

const initialState: AuthFormState = { error: null };

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    forgotPassword,
    initialState,
  );

  if (state.success) {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MailCheck className="size-6" />
          </div>
          <CardTitle className="text-xl">Kiểm tra email của bạn</CardTitle>
          <CardDescription>
            Nếu email tồn tại trong hệ thống, chúng tôi đã gửi liên kết đặt lại
            mật khẩu. Vui lòng kiểm tra hộp thư (kể cả mục spam).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
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
        <form action={formAction} className="grid gap-4">
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
          {state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
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
