import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @IsOptional()
  @Matches(/^\d{9,12}$/, { message: 'Số CCCD phải gồm 9-12 chữ số' })
  idCardNumber?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Ngày sinh không hợp lệ' })
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  hometown?: string;

  // null = rời phòng (gỡ khỏi phòng hiện tại)
  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  @IsInt()
  roomId?: number | null;
}
