import { formatCurrency } from "@/lib/format";
import type { Invoice } from "@/features/invoices/types";

export interface FeeLine {
  label: string;
  value: number;
  hint?: string;
}

export function computeFeeLines(invoice: Invoice): {
  electricityAmount: number;
  waterAmount: number;
  extraFees: number;
  lines: FeeLine[];
} {
  const electricityAmount =
    (invoice.electricityCurrent - invoice.electricityPrev) *
    invoice.electricityUnitPrice;
  const waterAmount =
    (invoice.waterCurrent - invoice.waterPrev) * invoice.waterUnitPrice;
  const extraFees =
    invoice.internetFee +
    invoice.elevatorFee +
    invoice.cleaningFee +
    invoice.motorbikeFee +
    invoice.otherFee;

  const lines: FeeLine[] = [
    { label: "Tiền phòng", value: invoice.roomPrice },
    {
      label: "Tiền điện",
      value: electricityAmount,
      hint: `${invoice.electricityPrev} → ${invoice.electricityCurrent} × ${formatCurrency(invoice.electricityUnitPrice)}`,
    },
    {
      label: "Tiền nước",
      value: waterAmount,
      hint: `${invoice.waterPrev} → ${invoice.waterCurrent} × ${formatCurrency(invoice.waterUnitPrice)}`,
    },
    { label: "Internet", value: invoice.internetFee },
    { label: "Thang máy", value: invoice.elevatorFee },
    { label: "Vệ sinh", value: invoice.cleaningFee },
    { label: "Xe máy", value: invoice.motorbikeFee },
    { label: "Phí khác", value: invoice.otherFee },
  ];

  return { electricityAmount, waterAmount, extraFees, lines };
}
