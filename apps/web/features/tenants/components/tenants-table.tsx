"use client";

import * as React from "react";
import { MoreHorizontal, Plus, Users } from "lucide-react";

import type { RoomOption, Tenant } from "@/features/tenants/types";
import { formatDate } from "@/lib/format";
import { DeleteTenantDialog } from "./delete-tenant-dialog";
import { TenantFormDialog } from "./tenant-form-dialog";
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

export function TenantsTable({
  tenants,
  rooms,
}: {
  tenants: Tenant[];
  rooms: RoomOption[];
}) {
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editingTenant, setEditingTenant] = React.useState<Tenant | null>(null);
  const [deletingTenant, setDeletingTenant] = React.useState<Tenant | null>(
    null,
  );

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Thêm người thuê
        </Button>
      </div>

      {tenants.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
          <Users className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">Chưa có người thuê nào</p>
            <p className="text-sm text-muted-foreground">
              Thêm người thuê đầu tiên để bắt đầu.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Thêm người thuê
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Họ tên</TableHead>
                <TableHead>Số CCCD</TableHead>
                <TableHead>Ngày sinh</TableHead>
                <TableHead>Quê quán</TableHead>
                <TableHead>Phòng</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((tenant) => (
                <TableRow key={tenant.id}>
                  <TableCell className="font-medium">
                    {tenant.fullName}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {tenant.idCardNumber}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatDate(tenant.dateOfBirth)}
                  </TableCell>
                  <TableCell>{tenant.hometown}</TableCell>
                  <TableCell>
                    {tenant.room ? (
                      <Badge variant="outline">{tenant.room.name}</Badge>
                    ) : (
                      <span className="text-muted-foreground">
                        Chưa xếp phòng
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Thao tác với ${tenant.fullName}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => setEditingTenant(tenant)}
                        >
                          Sửa
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setDeletingTenant(tenant)}
                        >
                          Xoá
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <TenantFormDialog
        key="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        rooms={rooms}
      />
      <TenantFormDialog
        key={editingTenant?.id ?? "edit-none"}
        open={!!editingTenant}
        onOpenChange={(open) => !open && setEditingTenant(null)}
        rooms={rooms}
        tenant={editingTenant ?? undefined}
      />
      <DeleteTenantDialog
        tenant={deletingTenant}
        onOpenChange={(open) => !open && setDeletingTenant(null)}
      />
    </>
  );
}
