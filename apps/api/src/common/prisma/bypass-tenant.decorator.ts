import { SetMetadata } from '@nestjs/common';

export const BYPASS_TENANT_KEY = 'bypassTenant';
export const BypassTenant = () => SetMetadata(BYPASS_TENANT_KEY, true);
