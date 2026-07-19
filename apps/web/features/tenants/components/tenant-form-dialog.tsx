"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  createTenant,
  updateTenant,
  type TenantFormState,
} from "@/features/tenants/actions";
import type { RoomOption, Tenant } from "@/features/tenants/types";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialState: TenantFormState = { error: null };
const NO_ROOM = "none";

interface TenantFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rooms: RoomOption[];
  /** When set, the dialog edits this tenant; otherwise it creates a new one. */
  tenant?: Tenant;
  /** Preselect a room (used from the room-detail page). */
  defaultRoomId?: number;
}

export function TenantFormDialog({
  open,
  onOpenChange,
  rooms,
  tenant,
  defaultRoomId,
}: TenantFormDialogProps) {
  const isEdit = !!tenant;
  const action = isEdit ? updateTenant : createTenant;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [roomId, setRoomId] = React.useState<string>(
    tenant?.roomId?.toString() ?? defaultRoomId?.toString() ?? NO_ROOM,
  );
  const lastSuccess = React.useRef(false);

  React.useEffect(() => {
    if (open) lastSuccess.current = state.success === true;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- snapshot stale success on open only

  React.useEffect(() => {
    if (pending) lastSuccess.current = false;
  }, [pending]);

  React.useEffect(() => {
    if (state.success && !lastSuccess.current) {
      lastSuccess.current = true;
      toast.success(isEdit ? "Đã cập nhật người thuê" : "Đã thêm người thuê");
      onOpenChange(false);
    }
    if (!state.success) lastSuccess.current = false;
  }, [state, isEdit, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Sửa người thuê" : "Thêm người thuê"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Cập nhật thông tin người thuê."
              : "Nhập thông tin người thuê mới."}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          {isEdit ? <input type="hidden" name="id" value={tenant.id} /> : null}
          <input
            type="hidden"
            name="roomId"
            value={roomId === NO_ROOM ? "" : roomId}
          />
          <div className="grid gap-2">
            <Label htmlFor="tenant-fullName">
              Họ tên <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tenant-fullName"
              name="fullName"
              defaultValue={tenant?.fullName}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tenant-idCardNumber">
              Số CCCD <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tenant-idCardNumber"
              name="idCardNumber"
              inputMode="numeric"
              pattern="\d{9,12}"
              title="Gồm 9-12 chữ số"
              defaultValue={tenant?.idCardNumber}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tenant-dateOfBirth">
              Ngày sinh <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tenant-dateOfBirth"
              name="dateOfBirth"
              type="date"
              defaultValue={tenant?.dateOfBirth?.slice(0, 10)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tenant-hometown">
              Quê quán <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tenant-hometown"
              name="hometown"
              defaultValue={tenant?.hometown}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label>Phòng</Label>
            <Select value={roomId} onValueChange={setRoomId}>
              <SelectTrigger>
                <SelectValue placeholder="Chưa xếp phòng" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ROOM}>Chưa xếp phòng</SelectItem>
                {rooms.map((room) => (
                  <SelectItem key={room.id} value={room.id.toString()}>
                    {room.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              {isEdit ? "Lưu thay đổi" : "Thêm người thuê"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
