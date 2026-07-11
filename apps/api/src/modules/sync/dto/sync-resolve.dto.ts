import { IsInt, IsNotEmpty, IsNumber, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class SyncResolveDto {
  @Type(() => Number)
  @IsInt()
  syncQueueId: number;

  @IsNumber()
  chosenValue: number;

  // Инвариант ADR-003: примечание при резолюции обязательно
  @IsString()
  @IsNotEmpty()
  note: string;
}
