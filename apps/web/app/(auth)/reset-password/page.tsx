import type { Metadata } from "next";
import Link from "next/link";

import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Đặt lại mật khẩu" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Liên kết không hợp lệ</CardTitle>
          <CardDescription>
            Liên kết đặt lại mật khẩu bị thiếu hoặc không đúng. Vui lòng yêu cầu
            liên kết mới.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" asChild>
            <Link href="/forgot-password">Yêu cầu liên kết mới</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <ResetPasswordForm token={token} />;
}
