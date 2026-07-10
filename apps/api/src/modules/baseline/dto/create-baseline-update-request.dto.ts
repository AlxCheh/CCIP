import {
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateBaselineUpdateRequestDto {
  @IsInt()
  boqItemId: number;

  @IsNumber()
  @IsPositive()
  newPlanVolume: number;

  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  supportingDocument?: string;
}
