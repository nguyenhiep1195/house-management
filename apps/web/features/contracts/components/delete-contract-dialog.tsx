"use client";

import * as React from "react";
import { toast } from "sonner";

import { deleteContract } from "@/features/contracts/actions";
import type { Contract } from "@/features/contracts/types";
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

interface DeleteContractDialogProps {
  contract: Contract | null;
  onOpenChange: (open: boolean) => void;
}

export function DeleteContractDialog({
  contract,
  onOpenChange,
}: DeleteContractDialogProps) {
  const [pending, startTransition] = React.useTransition();

  function handleConfirm(e: React.MouseEvent) {
    e.preventDefault();
    if (!contract) return;
    startTransition(async () => {
      const result = await deleteContract(contract.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Đã xoá hợp đồng");
        onOpenChange(false);
      }
    });
  }

  return (
    <AlertDialog open={!!contract} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xoá hợp đồng?</AlertDialogTitle>
          <AlertDialogDescription>
            Hợp đồng của phòng{" "}
            <span className="font-medium">{contract?.room.name}</span> sẽ bị
            xoá vĩnh viễn. Hợp đồng đang hiệu lực không thể xoá.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Huỷ</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Xoá hợp đồng
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
