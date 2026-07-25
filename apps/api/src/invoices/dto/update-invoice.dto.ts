import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateInvoiceDto {
  @IsOptional() @IsInt() @Min(0) roomPrice?: number;
  @IsOptional() @IsInt() @Min(0) electricityPrev?: number;
  @IsOptional() @IsInt() @Min(0) electricityCurrent?: number;
  @IsOptional() @IsInt() @Min(0) electricityUnitPrice?: number;
  @IsOptional() @IsInt() @Min(0) waterPrev?: number;
  @IsOptional() @IsInt() @Min(0) waterCurrent?: number;
  @IsOptional() @IsInt() @Min(0) waterUnitPrice?: number;
  @IsOptional() @IsInt() @Min(0) internetFee?: number;
  @IsOptional() @IsInt() @Min(0) elevatorFee?: number;
  @IsOptional() @IsInt() @Min(0) cleaningFee?: number;
  @IsOptional() @IsInt() @Min(0) motorbikeFee?: number;
  @IsOptional() @IsInt() @Min(0) otherFee?: number;
  @IsOptional() @IsInt() @Min(0) occupantCount?: number;
  @IsOptional() @IsInt() @Min(0) motorbikeCount?: number;
}
