import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SyncPhotoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  deviceId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  clientOpId: string;

  @Type(() => Number)
  @IsInt()
  periodId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  boqItemId?: number;

  @IsOptional()
  @IsDateString()
  takenAt?: string;
}
