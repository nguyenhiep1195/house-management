"use client";

import * as React from "react";
import Link from "next/link";
import { DoorOpen, Eye, Gauge, Pencil, Plus, Trash2 } from "lucide-react";

import {
  ROOM_STATUS_LABEL,
  type Room,
  type RoomPeriodReading,
} from "@/features/rooms/types";
import type { FeeSetting } from "@/features/settings/types";
import { formatCurrency } from "@/lib/format";
import { BulkReadingsDialog } from "./bulk-readings-dialog";
import { DeleteRoomDialog } from "./delete-room-dialog";
import { RoomFormDialog } from "./room-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function RoomsTable({
  rooms,
  feeSettings,
  readings,
  year,
  month,
}: {
  rooms: Room[];
  feeSettings: FeeSetting[];
  readings: RoomPeriodReading[];
  year: number;
  month: number;
}) {
  const [createOpen, setCreateOpen] = React.useState(false);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [bulkKey, setBulkKey] = React.useState(0);
  const [editingRoom, setEditingRoom] = React.useState<Room | null>(null);
  const [deletingRoom, setDeletingRoom] = React.useState<Room | null>(null);
  const feeNameById = React.useMemo(
    () => new Map(feeSettings.map((s) => [s.id, s.name])),
    [feeSettings],
  );

  return (
    <>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => { setBulkKey((k) => k + 1); setBulkOpen(true); }}
          disabled={readings.length === 0}
        >
          <Gauge className="size-4" />
          Cập nhật chỉ số điện nước
        </Button>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Thêm phòng
        </Button>
      </div>

      {rooms.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
          <DoorOpen className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">Chưa có phòng nào</p>
            <p className="text-sm text-muted-foreground">
              Thêm phòng đầu tiên để bắt đầu quản lý.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Thêm phòng
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên phòng</TableHead>
                <TableHead>Giá thuê</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Số người</TableHead>
                <TableHead>Số xe máy</TableHead>
                <TableHead>Loại phí</TableHead>
                <TableHead>Chỉ số điện</TableHead>
                <TableHead>Chỉ số nước</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rooms.map((room) => {
                const status = ROOM_STATUS_LABEL[room.status];
                return (
                  <TableRow key={room.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/rooms/${room.id}`}
                        className="hover:underline"
                      >
                        {room.name}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {room.status === "OCCUPIED" ? (
                        <Link
                          href={`/contracts?roomId=${room.id}`}
                          className="hover:underline"
                          title="Sửa giá thuê trong hợp đồng"
                        >
                          {formatCurrency(room.price)}
                        </Link>
                      ) : (
                        <Link
                          href={`/contracts?roomId=${room.id}`}
                          className="text-muted-foreground hover:underline"
                        >
                          Chưa có hợp đồng
                        </Link>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {room.occupantCount}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {room.motorbikeCount}
                    </TableCell>
                    <TableCell>
                      {room.feeSettingId
                        ? (feeNameById.get(room.feeSettingId) ?? "—")
                        : "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {room.electricityReading}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {room.waterReading}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Xem chi tiết ${room.name}`}
                          title="Xem chi tiết"
                          asChild
                        >
                          <Link href={`/rooms/${room.id}`}>
                            <Eye className="size-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Sửa ${room.name}`}
                          title="Sửa"
                          onClick={() => setEditingRoom(room)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Xoá ${room.name}`}
                          title="Xoá"
                          onClick={() => setDeletingRoom(room)}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <RoomFormDialog
        key="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        feeSettings={feeSettings}
      />
      <RoomFormDialog
        key={editingRoom?.id ?? "edit-none"}
        open={!!editingRoom}
        onOpenChange={(open) => !open && setEditingRoom(null)}
        room={editingRoom ?? undefined}
        feeSettings={feeSettings}
      />
      <DeleteRoomDialog
        room={deletingRoom}
        onOpenChange={(open) => !open && setDeletingRoom(null)}
      />
      <BulkReadingsDialog
        key={bulkKey}
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        readings={readings}
        year={year}
        month={month}
      />
    </>
  );
}
