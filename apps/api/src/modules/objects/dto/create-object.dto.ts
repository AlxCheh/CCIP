import { IsString, IsOptional, IsDateString, MaxLength } from 'class-validator';

export class CreateObjectDto {
  @IsString()
  @MaxLength(500)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  objectClass?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  permitNumber?: string;

  @IsOptional()
  @IsDateString()
  permitDate?: string;

  @IsOptional()
  @IsDateString()
  connectionDate?: string;
}
