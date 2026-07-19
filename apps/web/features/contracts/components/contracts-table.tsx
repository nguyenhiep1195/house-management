"use client";

import * as React from "react";
import Link from "next/link";
import { FileText, MoreHorizontal, Plus } from "lucide-react";

import {
  CONTRACT_STATUS_LABEL,
  type Contract,
  type ContractRoomOption,
} from "@/features/contracts/types";
import { formatCurrency, formatDate } from "@/lib/format";
import { ContractFormDialog } from "./contract-form-dialog";
import { DeleteContractDialog } from "./delete-contract-dialog";
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

export function ContractsTable({
  contracts,
  rooms,
}: {
  contracts: Contract[];
  rooms: ContractRoomOption[];
}) {
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editingContract, setEditingContract] =
    React.useState<Contract | null>(null);
  const [deletingContract, setDeletingContract] =
    React.useState<Contract | null>(null);

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Tạo hợp đồng
        </Button>
      </div>

      {contracts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
          <FileText className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">Chưa có hợp đồng nào</p>
            <p className="text-sm text-muted-foreground">
              Tạo hợp đồng đầu tiên để bắt đầu.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Tạo hợp đồng
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phòng</TableHead>
                <TableHead>Giá thuê</TableHead>
                <TableHead>Tiền cọc</TableHead>
                <TableHead>Từ ngày</TableHead>
                <TableHead>Đến ngày</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.map((contract) => {
                const status = CONTRACT_STATUS_LABEL[contract.status];
                return (
                  <TableRow key={contract.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/rooms/${contract.roomId}`}
                        className="hover:underline"
                      >
                        {contract.room.name}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatCurrency(contract.price)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatCurrency(contract.deposit)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatDate(contract.startDate)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatDate(contract.endDate)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Thao tác với hợp đồng phòng ${contract.room.name}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => setEditingContract(contract)}
                          >
                            Sửa
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={contract.status === "ACTIVE"}
                            onSelect={() => setDeletingContract(contract)}
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

      <ContractFormDialog
        key="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        rooms={rooms}
      />
      <ContractFormDialog
        key={editingContract?.id ?? "edit-none"}
        open={!!editingContract}
        onOpenChange={(open) => !open && setEditingContract(null)}
        rooms={rooms}
        contract={editingContract ?? undefined}
      />
      <DeleteContractDialog
        contract={deletingContract}
        onOpenChange={(open) => !open && setDeletingContract(null)}
      />
    </>
  );
}
