import { PrismaService } from '../../common/prisma/prisma.service';
export declare class PeriodService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    openPeriod(objectId: string, actorId: string): Promise<{
        id: string;
        periodNumber: number;
        status: string;
        openedAt: Date;
        closedAt: Date | null;
        objectId: string;
        openedBy: string;
    }>;
    closePeriod(periodId: string, actorId: string): Promise<{
        id: string;
        periodNumber: number;
        status: string;
        openedAt: Date;
        closedAt: Date | null;
        objectId: string;
        openedBy: string;
    }>;
    findByObject(objectId: string): Promise<{
        id: string;
        periodNumber: number;
        status: string;
        openedAt: Date;
        closedAt: Date | null;
        objectId: string;
        openedBy: string;
    }[]>;
}
