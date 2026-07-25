import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { RoomStatus } from '../../generated/enums';

export class CreateRoomDto {
  @IsString()
  @MinLength(1)
  name!: string;

  // Rent price is owned by the room's active contract; on create it defaults to
  // 0 until a contract sets it (see ContractsService sync).
  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsEnum(RoomStatus)
  status?: RoomStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  occupantCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  motorbikeCount?: number;

  @IsOptional()
  @IsBoolean()
  internetEnabled?: boolean;

  // Fee type for this room. Defaults to the default fee type when omitted.
  @IsOptional()
  @IsInt()
  feeSettingId?: number;

  @IsInt()
  @Min(0)
  initialElectricityReading!: number;

  @IsInt()
  @Min(0)
  initialWaterReading!: number;
}
