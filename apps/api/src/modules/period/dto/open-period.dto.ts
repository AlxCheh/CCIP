import { IsInt, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export class OpenPeriodDto {
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  objectId!: number;
}
