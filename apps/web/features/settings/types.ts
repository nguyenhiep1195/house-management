export interface FeeSetting {
  id: number;
  electricityUnitPrice: number;
  waterUnitPrice: number;
  internetFee: number;
  elevatorFeePerPerson: number;
  cleaningFeePerPerson: number;
  motorbikeFeePerExtra: number;
  freeMotorbikeCount: number;
  otherFee: number;
  updatedAt: string;
}
