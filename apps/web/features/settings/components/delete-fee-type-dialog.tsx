"use client";

import * as React from "react";
import { toast } from "sonner";

import { deleteFeeType } from "@/features/settings/actions";
import type { FeeSetting } from "@/features/settings/types";
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

export function DeleteFeeTypeDialog({
  feeType,
  onOpenChange,
  onDeleted,
}: {
  feeType: FeeSetting | null;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const [pending, startTransition] = React.useTransition();

  function handleConfirm(e: React.MouseEvent) {
    e.preventDefault();
    if (!feeType) return;
    startTransition(async () => {
      const result = await deleteFeeType(feeType.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Đã xoá loại phí");
        onOpenChange(false);
        onDeleted?.();
      }
    });
  }

  return (
    <AlertDialog open={!!feeType} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xoá loại phí?</AlertDialogTitle>
          <AlertDialogDescription>
            Loại phí <span className="font-medium">{feeType?.name}</span> cùng
            lịch sử thay đổi của nó sẽ bị xoá vĩnh viễn. Không thể xoá nếu vẫn
            còn phòng đang dùng loại phí này.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Huỷ</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Xoá loại phí
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
