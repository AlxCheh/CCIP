import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';

export class BoqItemDto {
  @IsString()
  @MaxLength(100)
  workCode: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  unit?: string;

  @IsNumber()
  @IsPositive()
  planVolume: number;

  @IsNumber()
  @IsPositive()
  contractValue: number;

  @IsOptional()
  @IsBoolean()
  isCritical?: boolean;
}

export class CreateBoqDto {
  @IsOptional()
  @IsString()
  changeReason?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BoqItemDto)
  items: BoqItemDto[];
}
