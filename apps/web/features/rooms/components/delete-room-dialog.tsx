"use client";

import * as React from "react";
import { toast } from "sonner";

import { deleteRoom } from "@/features/rooms/actions";
import type { Room } from "@/features/rooms/types";
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

interface DeleteRoomDialogProps {
  room: Room | null;
  onOpenChange: (open: boolean) => void;
}

export function DeleteRoomDialog({ room, onOpenChange }: DeleteRoomDialogProps) {
  const [pending, startTransition] = React.useTransition();

  function handleConfirm(e: React.MouseEvent) {
    e.preventDefault();
    if (!room) return;
    startTransition(async () => {
      const result = await deleteRoom(room.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Đã xoá phòng");
        onOpenChange(false);
      }
    });
  }

  return (
    <AlertDialog open={!!room} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xoá phòng?</AlertDialogTitle>
          <AlertDialogDescription>
            Phòng <span className="font-medium">{room?.name}</span> cùng toàn
            bộ hợp đồng và hoá đơn của phòng sẽ bị xoá vĩnh viễn. Hành động này
            không thể hoàn tác.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Huỷ</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Xoá phòng
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
