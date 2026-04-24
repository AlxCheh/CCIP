import { IsUUID } from 'class-validator';

export class OpenPeriodDto {
  @IsUUID()
  objectId: string;
}
