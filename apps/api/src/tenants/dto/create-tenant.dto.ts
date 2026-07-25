import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @MinLength(1)
  fullName!: string;

  @Matches(/^\d{9,12}$/, { message: 'Số CCCD phải gồm 9-12 chữ số' })
  idCardNumber!: string;

  @IsDateString({}, { message: 'Ngày sinh không hợp lệ' })
  dateOfBirth!: string;

  @IsString()
  @MinLength(1)
  hometown!: string;

  @IsOptional()
  @IsInt()
  roomId?: number;
}
