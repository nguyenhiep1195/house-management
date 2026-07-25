import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class CreateInvoiceDto {
  @IsInt()
  roomId!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  // Optional fee type. When omitted, the room's assigned fee type is used,
  // falling back to the default fee type.
  @IsOptional()
  @IsInt()
  feeSettingId?: number;
}
