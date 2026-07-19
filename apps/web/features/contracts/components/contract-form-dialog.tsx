"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  createContract,
  updateContract,
  type ContractFormState,
} from "@/features/contracts/actions";
import {
  CONTRACT_STATUS_LABEL,
  type Contract,
  type ContractRoomOption,
  type ContractStatus,
} from "@/features/contracts/types";
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

const initialState: ContractFormState = { error: null };

interface ContractFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rooms: ContractRoomOption[];
  /** When set, the dialog edits this contract; otherwise it creates a new one. */
  contract?: Contract;
}

export function ContractFormDialog({
  open,
  onOpenChange,
  rooms,
  contract,
}: ContractFormDialogProps) {
  const isEdit = !!contract;
  const action = isEdit ? updateContract : createContract;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [roomId, setRoomId] = React.useState<string>(
    contract?.roomId.toString() ?? "",
  );
  const [price, setPrice] = React.useState<string>(
    contract?.price.toString() ?? "",
  );
  const [status, setStatus] = React.useState<ContractStatus>(
    contract?.status ?? "ACTIVE",
  );
  const [startDate, setStartDate] = React.useState<string>(
    contract?.startDate?.slice(0, 10) ?? "",
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
      toast.success(isEdit ? "Đã cập nhật hợp đồng" : "Đã tạo hợp đồng");
      onOpenChange(false);
    }
    if (!state.success) lastSuccess.current = false;
  }, [state, isEdit, onOpenChange]);

  function handleRoomChange(value: string) {
    setRoomId(value);
    // giá thuê mặc định lấy theo giá phòng hiện tại
    const room = rooms.find((r) => r.id.toString() === value);
    if (room && !isEdit) setPrice(room.price.toString());
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Sửa hợp đồng" : "Tạo hợp đồng"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Cập nhật thông tin hợp đồng. Giá thuê sẽ đồng bộ sang giá phòng khi hợp đồng đang hiệu lực."
              : "Chọn phòng — giá thuê tự điền theo giá phòng, có thể sửa lại."}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          {isEdit ? (
            <input type="hidden" name="id" value={contract.id} />
          ) : (
            <input type="hidden" name="roomId" value={roomId} />
          )}
          {isEdit ? (
            <input type="hidden" name="status" value={status} />
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label>
                Phòng <span className="text-destructive">*</span>
              </Label>
              {isEdit ? (
                <Input value={contract.room.name} disabled />
              ) : (
                <Select value={roomId} onValueChange={handleRoomChange} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn phòng" />
                  </SelectTrigger>
                  <SelectContent>
                    {rooms.map((room) => (
                      <SelectItem key={room.id} value={room.id.toString()}>
                        {room.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contract-price">
                Giá thuê (đ/tháng) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="contract-price"
                name="price"
                type="number"
                min={0}
                step={1000}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contract-deposit">Tiền cọc (đ)</Label>
              <Input
                id="contract-deposit"
                name="deposit"
                type="number"
                min={0}
                step={1000}
                defaultValue={contract?.deposit ?? 0}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contract-startDate">
                Từ ngày <span className="text-destructive">*</span>
              </Label>
              <Input
                id="contract-startDate"
                name="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contract-endDate">
                Đến ngày <span className="text-destructive">*</span>
              </Label>
              <Input
                id="contract-endDate"
                name="endDate"
                type="date"
                defaultValue={contract?.endDate?.slice(0, 10)}
                min={startDate}
                required
              />
            </div>
            {isEdit ? (
              <div className="grid gap-2">
                <Label>Trạng thái</Label>
                <Select
                  value={status}
                  onValueChange={(value) => setStatus(value as ContractStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.keys(CONTRACT_STATUS_LABEL) as ContractStatus[]
                    ).map((key) => (
                      <SelectItem key={key} value={key}>
                        {CONTRACT_STATUS_LABEL[key].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="contract-note">Ghi chú</Label>
              <Input
                id="contract-note"
                name="note"
                defaultValue={contract?.note ?? ""}
              />
            </div>
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
            <Button type="submit" disabled={pending || (!isEdit && !roomId)}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? "Lưu thay đổi" : "Tạo hợp đồng"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
