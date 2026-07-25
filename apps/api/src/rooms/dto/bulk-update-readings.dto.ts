import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class MeterReadingItemDto {
  @IsInt()
  roomId!: number;

  @IsInt()
  @Min(0)
  electricityReading!: number;

  @IsInt()
  @Min(0)
  waterReading!: number;
}

export class BulkUpdateReadingsDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MeterReadingItemDto)
  items!: MeterReadingItemDto[];
}
