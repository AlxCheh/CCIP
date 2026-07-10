import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class ChangeGeneralContractorDto {
  @IsString()
  @MaxLength(500)
  orgName: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  contactPerson?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  contactEmail?: string;

  @IsDateString()
  validFrom: string;

  @IsString()
  reason: string;
}
