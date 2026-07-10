import { IsInt, IsOptional, IsString } from 'class-validator';

export class ApproveBaselineUpdateDto {
  @IsOptional()
  @IsString()
  reviewNotes?: string;

  @IsOptional()
  @IsInt()
  appliesFromPeriodId?: number;
}
