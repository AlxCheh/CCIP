import { IsString, IsNotEmpty } from 'class-validator';

export class CreateDisputeDto {
  @IsString()
  @IsNotEmpty()
  disputeReason!: string;
}
