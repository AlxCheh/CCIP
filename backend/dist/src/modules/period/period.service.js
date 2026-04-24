"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PeriodService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_js_1 = require("../../common/prisma/prisma.service.js");
let PeriodService = class PeriodService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async openPeriod(objectId, actorId) {
        return this.prisma.$transaction(async (tx) => {
            await tx.$executeRaw `SET LOCAL lock_timeout = '5s'`;
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${objectId})::bigint)`;
            const zeroReport = await tx.zeroReport.findFirst({
                where: { objectId, status: 'approved' },
            });
            if (!zeroReport) {
                throw new common_1.ForbiddenException('ZERO_REPORT_NOT_APPROVED');
            }
            const openPeriod = await tx.period.findFirst({
                where: { objectId, status: 'open' },
            });
            if (openPeriod) {
                throw new common_1.ConflictException('PERIOD_ALREADY_OPEN');
            }
            const last = await tx.period.findFirst({
                where: { objectId },
                orderBy: { periodNumber: 'desc' },
            });
            const period = await tx.period.create({
                data: {
                    objectId,
                    periodNumber: (last?.periodNumber ?? 0) + 1,
                    status: 'open',
                    openedBy: actorId,
                    openedAt: new Date(),
                },
            });
            await tx.auditLog.create({
                data: {
                    periodId: period.id,
                    actorId,
                    action: 'period_opened',
                    payload: { objectId, periodNumber: period.periodNumber },
                },
            });
            return period;
        });
    }
    async closePeriod(periodId, actorId) {
        return this.prisma.$transaction(async (tx) => {
            const period = await tx.period.findUniqueOrThrow({
                where: { id: periodId },
            });
            if (period.status !== 'open') {
                throw new common_1.ConflictException('PERIOD_NOT_OPEN');
            }
            const updated = await tx.period.update({
                where: { id: periodId },
                data: { status: 'closed', closedAt: new Date() },
            });
            await tx.auditLog.create({
                data: {
                    periodId,
                    actorId,
                    action: 'period_closed',
                },
            });
            return updated;
        });
    }
    async findByObject(objectId) {
        return this.prisma.period.findMany({
            where: { objectId },
            orderBy: { periodNumber: 'desc' },
        });
    }
};
exports.PeriodService = PeriodService;
exports.PeriodService = PeriodService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_js_1.PrismaService])
], PeriodService);
//# sourceMappingURL=period.service.js.map