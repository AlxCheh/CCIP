import { IsNumber } from 'class-validator';

export class UpdateConfigDto {
  @IsNumber()
  value: number;
}
