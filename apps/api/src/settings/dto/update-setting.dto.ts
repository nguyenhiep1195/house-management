import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateSettingDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  electricityUnitPrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  waterUnitPrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  internetFee?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  elevatorFeePerPerson?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cleaningFeePerPerson?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  motorbikeFeePerExtra?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  freeMotorbikeCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  otherFee?: number;
}
