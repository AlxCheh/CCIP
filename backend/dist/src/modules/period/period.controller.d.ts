import { PeriodService } from './period.service';
import { OpenPeriodDto } from './dto/open-period.dto';
export declare class PeriodController {
    private readonly periodService;
    constructor(periodService: PeriodService);
    open(dto: OpenPeriodDto, req: any): Promise<{
        id: string;
        periodNumber: number;
        status: string;
        openedAt: Date;
        closedAt: Date | null;
        objectId: string;
        openedBy: string;
    }>;
    close(id: string, req: any): Promise<{
        id: string;
        periodNumber: number;
        status: string;
        openedAt: Date;
        closedAt: Date | null;
        objectId: string;
        openedBy: string;
    }>;
    byObject(objectId: string): Promise<{
        id: string;
        periodNumber: number;
        status: string;
        openedAt: Date;
        closedAt: Date | null;
        objectId: string;
        openedBy: string;
    }[]>;
}
