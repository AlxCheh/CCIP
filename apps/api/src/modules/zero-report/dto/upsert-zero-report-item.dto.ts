import {
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpsertZeroReportItemDto {
  @IsInt()
  @IsPositive()
  boqItemId: number;

  @IsNumber()
  @IsPositive()
  factVolume: number;

  @IsString()
  @MaxLength(50)
  source: string;

  @IsOptional()
  @IsNumber()
  doc1Value?: number;

  @IsOptional()
  @IsNumber()
  doc2Value?: number;

  @IsOptional()
  @IsNumber()
  doc3Value?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
