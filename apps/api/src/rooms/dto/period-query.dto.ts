import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

// Query params always arrive as strings. The global ValidationPipe runs with
// transform: true but not implicit conversion, so @Type is required here —
// body DTOs get numbers straight from JSON and do not need it.
export class PeriodQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;
}
