import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class GpFactItemDto {
  @IsNumber()
  boqItemId!: number;

  @IsNumber()
  gpVolume!: number;

  @IsString()
  @IsOptional()
  gpNote?: string;
}

export class SubmitGpDto {
  @IsString()
  gpSubmittedByName!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GpFactItemDto)
  items!: GpFactItemDto[];
}
