import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(1)
  username!: string;

  // login only compares credentials — password policy is enforced on
  // create/reset, not here (so short legacy/seed passwords still work)
  @IsString()
  @MinLength(1)
  password!: string;
}
