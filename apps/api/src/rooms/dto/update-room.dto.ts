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

export class UpdateRoomDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

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

  @IsOptional()
  @IsInt()
  feeSettingId?: number;
}
