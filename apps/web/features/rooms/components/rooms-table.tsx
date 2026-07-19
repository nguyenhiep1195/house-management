"use client";

import * as React from "react";
import Link from "next/link";
import { DoorOpen, Gauge, MoreHorizontal, Plus } from "lucide-react";

import { ROOM_STATUS_LABEL, type Room } from "@/features/rooms/types";
import { formatCurrency } from "@/lib/format";
import { BulkReadingsDialog } from "./bulk-readings-dialog";
import { DeleteRoomDialog } from "./delete-room-dialog";
import { RoomFormDialog } from "./room-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function RoomsTable({ rooms }: { rooms: Room[] }) {
  const [createOpen, setCreateOpen] = React.useState(false);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [bulkKey, setBulkKey] = React.useState(0);
  const [editingRoom, setEditingRoom] = React.useState<Room | null>(null);
  const [deletingRoom, setDeletingRoom] = React.useState<Room | null>(null);

  return (
    <>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => { setBulkKey((k) => k + 1); setBulkOpen(true); }}
          disabled={rooms.length === 0}
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
                <TableHead>Giá phòng</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Số người</TableHead>
                <TableHead>Số xe máy</TableHead>
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
                      {formatCurrency(room.price)}
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
                    <TableCell className="tabular-nums">
                      {room.electricityReading}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {room.waterReading}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Thao tác với ${room.name}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/rooms/${room.id}`}>Xem chi tiết</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => setEditingRoom(room)}
                          >
                            Sửa
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => setDeletingRoom(room)}
                          >
                            Xoá
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
      />
      <RoomFormDialog
        key={editingRoom?.id ?? "edit-none"}
        open={!!editingRoom}
        onOpenChange={(open) => !open && setEditingRoom(null)}
        room={editingRoom ?? undefined}
      />
      <DeleteRoomDialog
        room={deletingRoom}
        onOpenChange={(open) => !open && setDeletingRoom(null)}
      />
      <BulkReadingsDialog
        key={bulkKey}
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        rooms={rooms}
      />
    </>
  );
}
