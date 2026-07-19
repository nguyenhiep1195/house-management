"use client";

import * as React from "react";
import { toast } from "sonner";

import { deleteTenant } from "@/features/tenants/actions";
import type { Tenant } from "@/features/tenants/types";
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

interface DeleteTenantDialogProps {
  tenant: Tenant | null;
  onOpenChange: (open: boolean) => void;
}

export function DeleteTenantDialog({
  tenant,
  onOpenChange,
}: DeleteTenantDialogProps) {
  const [pending, startTransition] = React.useTransition();

  function handleConfirm(e: React.MouseEvent) {
    e.preventDefault();
    if (!tenant) return;
    startTransition(async () => {
      const result = await deleteTenant(tenant.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Đã xoá người thuê");
        onOpenChange(false);
      }
    });
  }

  return (
    <AlertDialog open={!!tenant} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xoá người thuê?</AlertDialogTitle>
          <AlertDialogDescription>
            Người thuê <span className="font-medium">{tenant?.fullName}</span>{" "}
            sẽ bị xoá vĩnh viễn. Hành động này không thể hoàn tác.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Huỷ</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Xoá người thuê
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
