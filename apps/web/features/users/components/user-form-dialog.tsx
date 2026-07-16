"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  createUser,
  updateUser,
  type UserFormState,
} from "@/features/users/actions";
import type { ManagedUser } from "@/features/users/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: UserFormState = { error: null };

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this user; otherwise it creates a new one. */
  user?: ManagedUser;
}

export function UserFormDialog({ open, onOpenChange, user }: UserFormDialogProps) {
  const isEdit = !!user;
  const action = isEdit ? updateUser : createUser;
  const [state, formAction, pending] = useActionState(action, initialState);
  const lastSuccess = React.useRef(false);

  // Snapshot state.success at the moment the dialog opens so that a success
  // that happened in a *previous* session doesn't immediately fire the
  // toast+close effect when the dialog is reopened.
  React.useEffect(() => {
    if (open) lastSuccess.current = state.success === true;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- snapshot stale success on open only

  React.useEffect(() => {
    if (state.success && !lastSuccess.current) {
      lastSuccess.current = true;
      toast.success(isEdit ? "Đã cập nhật tài khoản" : "Đã tạo tài khoản quản lý");
      onOpenChange(false);
    }
    if (!state.success) lastSuccess.current = false;
  }, [state, isEdit, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Sửa tài khoản quản lý" : "Thêm tài khoản quản lý"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Cập nhật thông tin tài khoản. Để trống mật khẩu nếu không đổi."
              : "Tài khoản mới sẽ có vai trò Quản lý."}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          {isEdit ? <input type="hidden" name="id" value={user.id} /> : null}
          <div className="grid gap-2">
            <Label htmlFor="user-name">
              Họ tên <span className="text-destructive">*</span>
            </Label>
            <Input
              id="user-name"
              name="name"
              defaultValue={user?.name}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="user-email">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="user-email"
              name="email"
              type="email"
              defaultValue={user?.email}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="user-phone">Số điện thoại</Label>
            <Input
              id="user-phone"
              name="phone"
              type="tel"
              defaultValue={user?.phone ?? ""}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="user-password">
              Mật khẩu {isEdit ? "" : <span className="text-destructive">*</span>}
            </Label>
            <Input
              id="user-password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required={!isEdit}
            />
            <p className="text-xs text-muted-foreground">
              Tối thiểu 8 ký tự.
              {isEdit ? " Đổi mật khẩu sẽ đăng xuất người dùng này." : ""}
            </p>
          </div>
          {state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Huỷ
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? "Lưu thay đổi" : "Tạo tài khoản"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
