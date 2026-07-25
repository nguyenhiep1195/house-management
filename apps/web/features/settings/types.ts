export interface FeeSetting {
  id: number;
  name: string;
  isDefault: boolean;
  electricityUnitPrice: number;
  waterUnitPrice: number;
  internetFee: number;
  elevatorFeePerPerson: number;
  cleaningFeePerPerson: number;
  motorbikeFeePerExtra: number;
  freeMotorbikeCount: number;
  otherFee: number;
  createdAt: string;
  updatedAt: string;
}

export interface FeeSettingHistory {
  id: number;
  feeSettingId: number | null;
  electricityUnitPrice: number;
  waterUnitPrice: number;
  internetFee: number;
  elevatorFeePerPerson: number;
  cleaningFeePerPerson: number;
  motorbikeFeePerExtra: number;
  freeMotorbikeCount: number;
  otherFee: number;
  changedById: number | null;
  changedByName: string | null;
  changedAt: string;
}
