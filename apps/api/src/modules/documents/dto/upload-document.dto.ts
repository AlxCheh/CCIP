import { IsIn, IsString, MaxLength } from 'class-validator';

export const ALLOWED_DOC_TYPES = ['ssr', 'rdc', 'kalplan'] as const;

export class UploadDocumentDto {
  @IsString()
  @IsIn(ALLOWED_DOC_TYPES)
  docType: string;

  @IsString()
  @MaxLength(20)
  version: string;
}
