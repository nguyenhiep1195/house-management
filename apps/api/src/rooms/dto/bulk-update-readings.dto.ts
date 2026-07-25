import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
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
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MeterReadingItemDto)
  items!: MeterReadingItemDto[];
}
