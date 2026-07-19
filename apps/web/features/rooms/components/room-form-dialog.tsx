"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  createRoom,
  updateRoom,
  type RoomFormState,
} from "@/features/rooms/actions";
import { ROOM_STATUS_LABEL, type Room, type RoomStatus } from "@/features/rooms/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

const initialState: RoomFormState = { error: null };

interface RoomFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this room; otherwise it creates a new one. */
  room?: Room;
}

export function RoomFormDialog({ open, onOpenChange, room }: RoomFormDialogProps) {
  const isEdit = !!room;
  const action = isEdit ? updateRoom : createRoom;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [status, setStatus] = React.useState<RoomStatus>(
    room?.status ?? "AVAILABLE",
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
      toast.success(isEdit ? "Đã cập nhật phòng" : "Đã tạo phòng");
      onOpenChange(false);
    }
    if (!state.success) lastSuccess.current = false;
  }, [state, isEdit, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Sửa phòng" : "Thêm phòng"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Cập nhật thông tin phòng. Chỉ số điện nước cập nhật ở nút riêng ngoài danh sách."
              : "Nhập thông tin phòng và chỉ số điện nước ban đầu."}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          {isEdit ? <input type="hidden" name="id" value={room.id} /> : null}
          {isEdit ? <input type="hidden" name="status" value={status} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="room-name">
                Tên phòng <span className="text-destructive">*</span>
              </Label>
              <Input id="room-name" name="name" defaultValue={room?.name} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="room-price">
                Giá phòng (đ/tháng) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="room-price"
                name="price"
                type="number"
                min={0}
                step={1000}
                defaultValue={room?.price}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="room-occupantCount">Số người</Label>
              <Input
                id="room-occupantCount"
                name="occupantCount"
                type="number"
                min={0}
                defaultValue={room?.occupantCount ?? 0}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="room-motorbikeCount">Số xe máy</Label>
              <Input
                id="room-motorbikeCount"
                name="motorbikeCount"
                type="number"
                min={0}
                defaultValue={room?.motorbikeCount ?? 0}
                required
              />
              <p className="text-xs text-muted-foreground">
                Miễn phí 2 xe, từ xe thứ 3 tính phí theo cài đặt.
              </p>
            </div>
            {isEdit ? (
              <div className="grid gap-2">
                <Label>Trạng thái</Label>
                <Select
                  value={status}
                  onValueChange={(value) => setStatus(value as RoomStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.keys(ROOM_STATUS_LABEL) as RoomStatus[]
                    ).map((key) => (
                      <SelectItem key={key} value={key}>
                        {ROOM_STATUS_LABEL[key].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="room-initialElectricityReading">
                    Chỉ số điện ban đầu (kWh)
                  </Label>
                  <Input
                    id="room-initialElectricityReading"
                    name="initialElectricityReading"
                    type="number"
                    min={0}
                    defaultValue={0}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="room-initialWaterReading">
                    Chỉ số nước ban đầu (m³)
                  </Label>
                  <Input
                    id="room-initialWaterReading"
                    name="initialWaterReading"
                    type="number"
                    min={0}
                    defaultValue={0}
                    required
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="room-internetEnabled"
              name="internetEnabled"
              defaultChecked={room?.internetEnabled ?? true}
            />
            <Label htmlFor="room-internetEnabled">Sử dụng internet</Label>
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
              {isEdit ? "Lưu thay đổi" : "Tạo phòng"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
