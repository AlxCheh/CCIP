import { IsInt, IsNumber, IsString, MaxLength, Min } from 'class-validator';

export class CorrectFactDto {
  @IsInt()
  factId!: number;

  @IsNumber()
  @Min(0)
  scVolume!: number;

  @IsNumber()
  @Min(0)
  accepted!: number;

  @IsString()
  @MaxLength(500)
  reason!: string;
}
