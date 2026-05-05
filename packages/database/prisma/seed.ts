import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const ORG_ID = '00000000-0000-0000-0000-000000000001';

const LINEAGE_IDS = {
  A1: '11111111-0000-0000-0000-000000000001',
  A2: '11111111-0000-0000-0000-000000000002',
  A3: '11111111-0000-0000-0000-000000000003',
  B1: '11111111-0000-0000-0000-000000000004',
  B2: '11111111-0000-0000-0000-000000000005',
};

async function main() {
  // ── Organization ────────────────────────────────────────────────────────────
  const org = await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: {},
    create: {
      id: ORG_ID,
      name: 'ООО "СК Монолит"',
      slug: 'monolit',
      plan: 'starter',
      isActive: true,
    },
  });
  console.log(`Organization: ${org.name}`);

  // ── System Config ────────────────────────────────────────────────────────────
  const configEntries = [
    { key: 'N_flag_threshold', valueType: 'numeric', valueNumeric: 3, description: 'Min Type-2 discrepancies to trigger systemic flag' },
    { key: 'M_flag_window', valueType: 'numeric', valueNumeric: 5, description: 'Look-back window (periods) for systemic flag' },
    { key: 'weight_threshold', valueType: 'numeric', valueNumeric: 0.10, description: 'Min weight_coef requiring cross-verification' },
    { key: 'forecast_gap_alert', valueType: 'numeric', valueNumeric: 2, description: 'Gap in periods triggering gap flag on dashboard' },
    { key: 'tolerance_threshold', valueType: 'numeric', valueNumeric: 5, description: 'Overrun % — warning only' },
    { key: 'overrun_warning_limit', valueType: 'numeric', valueNumeric: 20, description: 'Overrun % — hard block threshold' },
    { key: 'avg_pace_periods', valueType: 'numeric', valueNumeric: 5, description: 'WMA window size for pace calculation' },
    { key: 'decay_factor', valueType: 'numeric', valueNumeric: 0.9, description: 'Exponential decay factor for WMA' },
    { key: 'spike_threshold', valueType: 'numeric', valueNumeric: 2.0, description: 'Multiplier vs WMA to classify as spike' },
    { key: 'zero_report_alert_days', valueType: 'numeric', valueNumeric: 5, description: 'Days after connection_date before 0-report alert fires' },
    { key: 'baseline_correction_threshold', valueType: 'numeric', valueNumeric: 5, description: 'Correction % requiring Director approval vs Admin-only' },
  ] as const;

  for (const cfg of configEntries) {
    await prisma.systemConfig.upsert({
      where: { organizationId_key: { organizationId: ORG_ID, key: cfg.key } },
      update: {},
      create: {
        organizationId: ORG_ID,
        key: cfg.key,
        valueType: cfg.valueType,
        valueNumeric: cfg.valueNumeric,
        description: cfg.description,
      },
    });
  }
  console.log(`SystemConfig: ${configEntries.length} entries`);

  // ── Users ────────────────────────────────────────────────────────────────────
  const adminPasswordHash = await bcrypt.hash('Admin1234!', 12);
  const defaultPasswordHash = await bcrypt.hash('Ccip1234!', 12);

  const adminExample = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      name: 'Admin User',
      role: 'admin',
      passwordHash: adminPasswordHash,
      isActive: true,
      organizationId: ORG_ID,
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@ccip.dev' },
    update: {},
    create: {
      email: 'admin@ccip.dev',
      name: 'Иванов Иван Иванович',
      role: 'admin',
      passwordHash: defaultPasswordHash,
      isActive: true,
      organizationId: ORG_ID,
    },
  });

  const director = await prisma.user.upsert({
    where: { email: 'director@ccip.dev' },
    update: {},
    create: {
      email: 'director@ccip.dev',
      name: 'Директоров Дмитрий Петрович',
      role: 'director',
      passwordHash: defaultPasswordHash,
      isActive: true,
      organizationId: ORG_ID,
    },
  });

  const sc = await prisma.user.upsert({
    where: { email: 'sc@ccip.dev' },
    update: {},
    create: {
      email: 'sc@ccip.dev',
      name: 'Строев Сергей Александрович',
      role: 'stroycontrol',
      passwordHash: defaultPasswordHash,
      isActive: true,
      organizationId: ORG_ID,
    },
  });
  console.log(`Users: admin@example.com(${adminExample.id}), admin(${admin.id}), director(${director.id}), sc(${sc.id})`);

  // ── Construction Object ───────────────────────────────────────────────────────
  const existingObject = await prisma.constructionObject.findFirst({
    where: { permitNumber: 'RU77-123456-2026', organizationId: ORG_ID },
  });

  const obj = existingObject ?? await prisma.constructionObject.create({
    data: {
      name: 'Жилой комплекс "Северный" (пилотный объект)',
      objectClass: 'Жилое здание',
      address: 'г. Москва, Северный район, участок 5',
      permitNumber: 'RU77-123456-2026',
      status: 'active',
      organizationId: ORG_ID,
      createdBy: admin.id,
    },
  });
  console.log(`ConstructionObject: ${obj.name} (id=${obj.id})`);

  // ── BoQ Version ────────────────────────────────────────────────────────────────
  const boqVersion = await prisma.boqVersion.upsert({
    where: { objectId_versionNumber: { objectId: obj.id, versionNumber: '1.0' } },
    update: {},
    create: {
      objectId: obj.id,
      versionNumber: '1.0',
      changeType: 'initial',
      isActive: true,
      createdBy: admin.id,
    },
  });
  console.log(`BoqVersion: v${boqVersion.versionNumber} (id=${boqVersion.id})`);

  // ── BoQ Items (weight_coef computed by DB trigger) ────────────────────────────
  const items = [
    { workCode: 'А1', name: 'Устройство монолитного каркаса', unit: 'м³', planVolume: 1200, contractValue: 36000000, isCritical: true,  lineageId: LINEAGE_IDS.A1 },
    { workCode: 'А2', name: 'Кладка наружных стен',           unit: 'м²', planVolume: 3500, contractValue: 21000000, isCritical: false, lineageId: LINEAGE_IDS.A2 },
    { workCode: 'А3', name: 'Устройство кровли',              unit: 'м²', planVolume: 800,  contractValue: 12000000, isCritical: true,  lineageId: LINEAGE_IDS.A3 },
    { workCode: 'Б1', name: 'Монтаж инженерных систем',       unit: 'компл.', planVolume: 1, contractValue: 15000000, isCritical: false, lineageId: LINEAGE_IDS.B1 },
    { workCode: 'Б2', name: 'Отделочные работы',              unit: 'м²', planVolume: 12000, contractValue: 16000000, isCritical: false, lineageId: LINEAGE_IDS.B2 },
  ];

  for (const item of items) {
    await prisma.boqItem.upsert({
      where: { boqVersionId_workCode: { boqVersionId: boqVersion.id, workCode: item.workCode } },
      update: {},
      create: {
        boqVersionId: boqVersion.id,
        workLineageId: item.lineageId,
        workCode: item.workCode,
        name: item.name,
        unit: item.unit,
        planVolume: item.planVolume,
        contractValue: item.contractValue,
        isCritical: item.isCritical,
        status: 'active',
      },
    });
  }
  // Total contractValue = 100_000_000 → each item weight = contractValue / 100_000_000
  console.log(`BoqItems: ${items.length} items (total contract = 100M RUB)`);

  console.log('\n✅ Seed complete');
  console.log('   Logins:');
  console.log('   admin@example.com / Admin1234!');
  console.log('   admin@ccip.dev | director@ccip.dev | sc@ccip.dev  (password: Ccip1234!)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
