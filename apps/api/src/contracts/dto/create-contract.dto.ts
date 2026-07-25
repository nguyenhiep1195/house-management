import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateContractDto {
  @IsInt()
  roomId!: number;

  @IsInt()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  deposit?: number;

  @IsInt()
  @Min(0)
  initialElectricityReading!: number;

  @IsInt()
  @Min(0)
  initialWaterReading!: number;

  @IsDateString({}, { message: 'Ngày bắt đầu không hợp lệ' })
  startDate!: string;

  @IsDateString({}, { message: 'Ngày kết thúc không hợp lệ' })
  endDate!: string;

  @IsOptional()
  @IsString()
  note?: string;
}
