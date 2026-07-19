export type InvoiceStatus = "UNPAID" | "PAID";
export type PaymentMethod = "CASH" | "TRANSFER";

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Tiền mặt",
  TRANSFER: "Chuyển khoản",
};

export interface Invoice {
  id: number;
  roomId: number;
  room?: { id: number; name: string };
  month: number;
  year: number;
  roomPrice: number;
  electricityPrev: number;
  electricityCurrent: number;
  electricityUnitPrice: number;
  waterPrev: number;
  waterCurrent: number;
  waterUnitPrice: number;
  internetFee: number;
  elevatorFee: number;
  cleaningFee: number;
  motorbikeFee: number;
  otherFee: number;
  occupantCount: number;
  motorbikeCount: number;
  totalAmount: number;
  status: InvoiceStatus;
  paymentMethod: PaymentMethod | null;
  paidAt: string | null;
  createdAt: string;
}
