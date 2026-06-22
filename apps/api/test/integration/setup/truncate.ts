// apps/api/test/integration/setup/truncate.ts
import type { PrismaClient } from '@ccip/database';

// FK-aware order: leaves first, roots last. Preserve config/migrations/partman tables.
// Physical table names per Prisma @@map directives:
//   L2Document -> l2_documents (plan said "documents" — corrected)
//   ConstructionObject -> objects (plan said "construction_objects" — corrected)
const TENANT_TABLES = [
  'audit_log',
  'period_facts',
  'periods',
  'boq_items',
  'boq_versions',
  'zero_reports',
  'l2_documents',
  'objects',
  'refresh_tokens',
  'users',
  'organizations',
];

export async function truncateAll(prisma: PrismaClient): Promise<void> {
  const list = TENANT_TABLES.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
  );
}
