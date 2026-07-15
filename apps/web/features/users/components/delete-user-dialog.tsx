"use client";

import * as React from "react";
import { toast } from "sonner";

import { deleteUser } from "@/features/users/actions";
import type { ManagedUser } from "@/features/users/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DeleteUserDialogProps {
  user: ManagedUser | null;
  onOpenChange: (open: boolean) => void;
}

export function DeleteUserDialog({ user, onOpenChange }: DeleteUserDialogProps) {
  const [pending, startTransition] = React.useTransition();

  function handleConfirm(e: React.MouseEvent) {
    e.preventDefault();
    if (!user) return;
    startTransition(async () => {
      const result = await deleteUser(user.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Đã xoá tài khoản");
        onOpenChange(false);
      }
    });
  }

  return (
    <AlertDialog open={!!user} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xoá tài khoản quản lý?</AlertDialogTitle>
          <AlertDialogDescription>
            Tài khoản <span className="font-medium">{user?.email}</span> sẽ bị
            xoá vĩnh viễn. Hành động này không thể hoàn tác.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Huỷ</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Xoá tài khoản
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
