import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateZeroReportDto {
  @IsInt()
  @IsPositive()
  boqVersionId: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
