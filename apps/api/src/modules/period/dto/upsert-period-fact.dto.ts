import { IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class UpsertPeriodFactDto {
  @IsNumber()
  @Type(() => Number)
  scVolume!: number;
}
