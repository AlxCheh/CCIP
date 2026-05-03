import {
  IsOptional,
  IsString,
  IsIn,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

const SORT_OPTIONS = [
  'gapFirst',
  'readinessAsc',
  'readinessDesc',
  'forecastAsc',
  'forecastDesc',
  'nameAsc',
] as const;

const STATUS_OPTIONS = ['active', 'paused', 'closed'] as const;

export class DashboardQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(STATUS_OPTIONS)
  status?: (typeof STATUS_OPTIONS)[number];

  @IsOptional()
  @IsString()
  objectClass?: string;

  @IsOptional()
  @Transform(({ value }: { value: string }) => value === 'true')
  @IsBoolean()
  gapOnly?: boolean;

  @IsOptional()
  @IsIn(SORT_OPTIONS)
  sort?: (typeof SORT_OPTIONS)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number = 50;
}
