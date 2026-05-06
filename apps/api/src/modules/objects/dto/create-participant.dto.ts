import { IsString, IsOptional, IsDateString, MaxLength } from 'class-validator';

export class CreateParticipantDto {
  @IsString()
  @MaxLength(50)
  participantRole: string;

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

  @IsOptional()
  @IsString()
  changedReason?: string;
}
