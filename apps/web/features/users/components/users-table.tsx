"use client";

import * as React from "react";
import { Lock, Pencil, Plus, Trash2, Unlock, UserCog } from "lucide-react";
import { toast } from "sonner";

import { toggleUserActive } from "@/features/users/actions";
import type { ManagedUser } from "@/features/users/types";
import { DeleteUserDialog } from "./delete-user-dialog";
import { UserFormDialog } from "./user-form-dialog";
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

export function UsersTable({ users }: { users: ManagedUser[] }) {
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editingUser, setEditingUser] = React.useState<ManagedUser | null>(null);
  const [deletingUser, setDeletingUser] = React.useState<ManagedUser | null>(null);
  const [, startTransition] = React.useTransition();

  function handleToggleActive(user: ManagedUser) {
    startTransition(async () => {
      const result = await toggleUserActive(user.id, !user.isActive);
      if (result.error) toast.error(result.error);
      else
        toast.success(
          user.isActive ? "Đã khoá tài khoản" : "Đã mở khoá tài khoản",
        );
    });
  }

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Thêm quản lý
        </Button>
      </div>

      {users.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
          <UserCog className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">Chưa có tài khoản quản lý nào</p>
            <p className="text-sm text-muted-foreground">
              Thêm tài khoản quản lý đầu tiên để bắt đầu.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Thêm quản lý
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Họ tên</TableHead>
                <TableHead>Tên đăng nhập</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Số điện thoại</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Ngày tạo</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.username}</TableCell>
                  <TableCell>{user.email ?? "—"}</TableCell>
                  <TableCell>{user.phone ?? "—"}</TableCell>
                  <TableCell>
                    {user.isActive ? (
                      <Badge variant="outline">Đang hoạt động</Badge>
                    ) : (
                      <Badge variant="destructive">Đã khoá</Badge>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {new Date(user.createdAt).toLocaleDateString("vi-VN")}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Sửa ${user.name}`}
                        title="Sửa"
                        onClick={() => setEditingUser(user)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={
                          user.isActive
                            ? `Khoá tài khoản ${user.name}`
                            : `Mở khoá tài khoản ${user.name}`
                        }
                        title={user.isActive ? "Khoá tài khoản" : "Mở khoá tài khoản"}
                        onClick={() => handleToggleActive(user)}
                      >
                        {user.isActive ? (
                          <Lock className="size-4" />
                        ) : (
                          <Unlock className="size-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Xoá ${user.name}`}
                        title="Xoá"
                        onClick={() => setDeletingUser(user)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <UserFormDialog
        key="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
      <UserFormDialog
        key={editingUser?.id ?? "edit-none"}
        open={!!editingUser}
        onOpenChange={(open) => !open && setEditingUser(null)}
        user={editingUser ?? undefined}
      />
      <DeleteUserDialog
        user={deletingUser}
        onOpenChange={(open) => !open && setDeletingUser(null)}
      />
    </>
  );
}
