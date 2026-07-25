"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  createFeeType,
  type FeeSettingFormState,
} from "@/features/settings/actions";
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

const initialState: FeeSettingFormState = { error: null };

export function CreateFeeTypeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, formAction, pending] = useActionState(
    createFeeType,
    initialState,
  );
  const wasPending = React.useRef(false);

  React.useEffect(() => {
    if (wasPending.current && !pending && state.success) {
      toast.success("Đã tạo loại phí");
      onOpenChange(false);
    }
    wasPending.current = pending;
  }, [pending, state, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Thêm loại phí</DialogTitle>
          <DialogDescription>
            Tạo một loại phí mới với đơn giá mặc định. Bạn có thể chỉnh đơn giá
            ngay sau khi tạo.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="fee-type-name">Tên loại phí</Label>
            <Input
              id="fee-type-name"
              name="name"
              placeholder="VD: Loại II"
              maxLength={50}
              required
            />
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
              disabled={pending}
            >
              Huỷ
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Tạo loại phí
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
