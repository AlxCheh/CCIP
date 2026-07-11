import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

export class SyncOperationsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  deviceId: string;

  // Элементы валидируются в SyncService per-item: инвалидный элемент = rejected
  // этого элемента, не 400 на весь батч (см. Global Constraints).
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  operations: Record<string, unknown>[];
}
