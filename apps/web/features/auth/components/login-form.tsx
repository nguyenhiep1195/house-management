"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { login, type AuthFormState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthFormState = { error: null };

export function LoginForm({ next }: { next: string }) {
  const [showPassword, setShowPassword] = React.useState(false);
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Đăng nhập</CardTitle>
        <CardDescription>
          Nhập tên đăng nhập và mật khẩu để truy cập trang quản trị
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="next" value={next} />
          <div className="grid gap-2">
            <Label htmlFor="username">Tên đăng nhập</Label>
            <Input
              id="username"
              name="username"
              type="text"
              placeholder="admin"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
            />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Mật khẩu</Label>
              <Link
                href="/forgot-password"
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Quên mật khẩu?
              </Link>
            </div>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </div>
          {state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <Checkbox id="remember" name="remember" />
            <Label htmlFor="remember" className="font-normal">
              Ghi nhớ đăng nhập
            </Label>
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Đăng nhập
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
