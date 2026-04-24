import type * as runtime from "@prisma/client/runtime/client";
import type * as Prisma from "../internal/prismaNamespace.js";
export type SlaEventModel = runtime.Types.Result.DefaultSelection<Prisma.$SlaEventPayload>;
export type AggregateSlaEvent = {
    _count: SlaEventCountAggregateOutputType | null;
    _min: SlaEventMinAggregateOutputType | null;
    _max: SlaEventMaxAggregateOutputType | null;
};
export type SlaEventMinAggregateOutputType = {
    id: string | null;
    periodId: string | null;
    eventType: string | null;
    scenario: string | null;
    scheduledAt: Date | null;
    executedAt: Date | null;
    createdAt: Date | null;
};
export type SlaEventMaxAggregateOutputType = {
    id: string | null;
    periodId: string | null;
    eventType: string | null;
    scenario: string | null;
    scheduledAt: Date | null;
    executedAt: Date | null;
    createdAt: Date | null;
};
export type SlaEventCountAggregateOutputType = {
    id: number;
    periodId: number;
    eventType: number;
    scenario: number;
    scheduledAt: number;
    executedAt: number;
    createdAt: number;
    _all: number;
};
export type SlaEventMinAggregateInputType = {
    id?: true;
    periodId?: true;
    eventType?: true;
    scenario?: true;
    scheduledAt?: true;
    executedAt?: true;
    createdAt?: true;
};
export type SlaEventMaxAggregateInputType = {
    id?: true;
    periodId?: true;
    eventType?: true;
    scenario?: true;
    scheduledAt?: true;
    executedAt?: true;
    createdAt?: true;
};
export type SlaEventCountAggregateInputType = {
    id?: true;
    periodId?: true;
    eventType?: true;
    scenario?: true;
    scheduledAt?: true;
    executedAt?: true;
    createdAt?: true;
    _all?: true;
};
export type SlaEventAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.SlaEventWhereInput;
    orderBy?: Prisma.SlaEventOrderByWithRelationInput | Prisma.SlaEventOrderByWithRelationInput[];
    cursor?: Prisma.SlaEventWhereUniqueInput;
    take?: number;
    skip?: number;
    _count?: true | SlaEventCountAggregateInputType;
    _min?: SlaEventMinAggregateInputType;
    _max?: SlaEventMaxAggregateInputType;
};
export type GetSlaEventAggregateType<T extends SlaEventAggregateArgs> = {
    [P in keyof T & keyof AggregateSlaEvent]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregateSlaEvent[P]> : Prisma.GetScalarType<T[P], AggregateSlaEvent[P]>;
};
export type SlaEventGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.SlaEventWhereInput;
    orderBy?: Prisma.SlaEventOrderByWithAggregationInput | Prisma.SlaEventOrderByWithAggregationInput[];
    by: Prisma.SlaEventScalarFieldEnum[] | Prisma.SlaEventScalarFieldEnum;
    having?: Prisma.SlaEventScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: SlaEventCountAggregateInputType | true;
    _min?: SlaEventMinAggregateInputType;
    _max?: SlaEventMaxAggregateInputType;
};
export type SlaEventGroupByOutputType = {
    id: string;
    periodId: string;
    eventType: string;
    scenario: string;
    scheduledAt: Date;
    executedAt: Date | null;
    createdAt: Date;
    _count: SlaEventCountAggregateOutputType | null;
    _min: SlaEventMinAggregateOutputType | null;
    _max: SlaEventMaxAggregateOutputType | null;
};
export type GetSlaEventGroupByPayload<T extends SlaEventGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<SlaEventGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof SlaEventGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], SlaEventGroupByOutputType[P]> : Prisma.GetScalarType<T[P], SlaEventGroupByOutputType[P]>;
}>>;
export type SlaEventWhereInput = {
    AND?: Prisma.SlaEventWhereInput | Prisma.SlaEventWhereInput[];
    OR?: Prisma.SlaEventWhereInput[];
    NOT?: Prisma.SlaEventWhereInput | Prisma.SlaEventWhereInput[];
    id?: Prisma.StringFilter<"SlaEvent"> | string;
    periodId?: Prisma.StringFilter<"SlaEvent"> | string;
    eventType?: Prisma.StringFilter<"SlaEvent"> | string;
    scenario?: Prisma.StringFilter<"SlaEvent"> | string;
    scheduledAt?: Prisma.DateTimeFilter<"SlaEvent"> | Date | string;
    executedAt?: Prisma.DateTimeNullableFilter<"SlaEvent"> | Date | string | null;
    createdAt?: Prisma.DateTimeFilter<"SlaEvent"> | Date | string;
    period?: Prisma.XOR<Prisma.PeriodScalarRelationFilter, Prisma.PeriodWhereInput>;
};
export type SlaEventOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    periodId?: Prisma.SortOrder;
    eventType?: Prisma.SortOrder;
    scenario?: Prisma.SortOrder;
    scheduledAt?: Prisma.SortOrder;
    executedAt?: Prisma.SortOrderInput | Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    period?: Prisma.PeriodOrderByWithRelationInput;
};
export type SlaEventWhereUniqueInput = Prisma.AtLeast<{
    id?: string;
    AND?: Prisma.SlaEventWhereInput | Prisma.SlaEventWhereInput[];
    OR?: Prisma.SlaEventWhereInput[];
    NOT?: Prisma.SlaEventWhereInput | Prisma.SlaEventWhereInput[];
    periodId?: Prisma.StringFilter<"SlaEvent"> | string;
    eventType?: Prisma.StringFilter<"SlaEvent"> | string;
    scenario?: Prisma.StringFilter<"SlaEvent"> | string;
    scheduledAt?: Prisma.DateTimeFilter<"SlaEvent"> | Date | string;
    executedAt?: Prisma.DateTimeNullableFilter<"SlaEvent"> | Date | string | null;
    createdAt?: Prisma.DateTimeFilter<"SlaEvent"> | Date | string;
    period?: Prisma.XOR<Prisma.PeriodScalarRelationFilter, Prisma.PeriodWhereInput>;
}, "id">;
export type SlaEventOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    periodId?: Prisma.SortOrder;
    eventType?: Prisma.SortOrder;
    scenario?: Prisma.SortOrder;
    scheduledAt?: Prisma.SortOrder;
    executedAt?: Prisma.SortOrderInput | Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    _count?: Prisma.SlaEventCountOrderByAggregateInput;
    _max?: Prisma.SlaEventMaxOrderByAggregateInput;
    _min?: Prisma.SlaEventMinOrderByAggregateInput;
};
export type SlaEventScalarWhereWithAggregatesInput = {
    AND?: Prisma.SlaEventScalarWhereWithAggregatesInput | Prisma.SlaEventScalarWhereWithAggregatesInput[];
    OR?: Prisma.SlaEventScalarWhereWithAggregatesInput[];
    NOT?: Prisma.SlaEventScalarWhereWithAggregatesInput | Prisma.SlaEventScalarWhereWithAggregatesInput[];
    id?: Prisma.StringWithAggregatesFilter<"SlaEvent"> | string;
    periodId?: Prisma.StringWithAggregatesFilter<"SlaEvent"> | string;
    eventType?: Prisma.StringWithAggregatesFilter<"SlaEvent"> | string;
    scenario?: Prisma.StringWithAggregatesFilter<"SlaEvent"> | string;
    scheduledAt?: Prisma.DateTimeWithAggregatesFilter<"SlaEvent"> | Date | string;
    executedAt?: Prisma.DateTimeNullableWithAggregatesFilter<"SlaEvent"> | Date | string | null;
    createdAt?: Prisma.DateTimeWithAggregatesFilter<"SlaEvent"> | Date | string;
};
export type SlaEventCreateInput = {
    id?: string;
    eventType: string;
    scenario: string;
    scheduledAt: Date | string;
    executedAt?: Date | string | null;
    createdAt?: Date | string;
    period: Prisma.PeriodCreateNestedOneWithoutSlaEventsInput;
};
export type SlaEventUncheckedCreateInput = {
    id?: string;
    periodId: string;
    eventType: string;
    scenario: string;
    scheduledAt: Date | string;
    executedAt?: Date | string | null;
    createdAt?: Date | string;
};
export type SlaEventUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    eventType?: Prisma.StringFieldUpdateOperationsInput | string;
    scenario?: Prisma.StringFieldUpdateOperationsInput | string;
    scheduledAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    executedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    period?: Prisma.PeriodUpdateOneRequiredWithoutSlaEventsNestedInput;
};
export type SlaEventUncheckedUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    periodId?: Prisma.StringFieldUpdateOperationsInput | string;
    eventType?: Prisma.StringFieldUpdateOperationsInput | string;
    scenario?: Prisma.StringFieldUpdateOperationsInput | string;
    scheduledAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    executedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type SlaEventCreateManyInput = {
    id?: string;
    periodId: string;
    eventType: string;
    scenario: string;
    scheduledAt: Date | string;
    executedAt?: Date | string | null;
    createdAt?: Date | string;
};
export type SlaEventUpdateManyMutationInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    eventType?: Prisma.StringFieldUpdateOperationsInput | string;
    scenario?: Prisma.StringFieldUpdateOperationsInput | string;
    scheduledAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    executedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type SlaEventUncheckedUpdateManyInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    periodId?: Prisma.StringFieldUpdateOperationsInput | string;
    eventType?: Prisma.StringFieldUpdateOperationsInput | string;
    scenario?: Prisma.StringFieldUpdateOperationsInput | string;
    scheduledAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    executedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type SlaEventListRelationFilter = {
    every?: Prisma.SlaEventWhereInput;
    some?: Prisma.SlaEventWhereInput;
    none?: Prisma.SlaEventWhereInput;
};
export type SlaEventOrderByRelationAggregateInput = {
    _count?: Prisma.SortOrder;
};
export type SlaEventCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    periodId?: Prisma.SortOrder;
    eventType?: Prisma.SortOrder;
    scenario?: Prisma.SortOrder;
    scheduledAt?: Prisma.SortOrder;
    executedAt?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
};
export type SlaEventMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    periodId?: Prisma.SortOrder;
    eventType?: Prisma.SortOrder;
    scenario?: Prisma.SortOrder;
    scheduledAt?: Prisma.SortOrder;
    executedAt?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
};
export type SlaEventMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    periodId?: Prisma.SortOrder;
    eventType?: Prisma.SortOrder;
    scenario?: Prisma.SortOrder;
    scheduledAt?: Prisma.SortOrder;
    executedAt?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
};
export type SlaEventCreateNestedManyWithoutPeriodInput = {
    create?: Prisma.XOR<Prisma.SlaEventCreateWithoutPeriodInput, Prisma.SlaEventUncheckedCreateWithoutPeriodInput> | Prisma.SlaEventCreateWithoutPeriodInput[] | Prisma.SlaEventUncheckedCreateWithoutPeriodInput[];
    connectOrCreate?: Prisma.SlaEventCreateOrConnectWithoutPeriodInput | Prisma.SlaEventCreateOrConnectWithoutPeriodInput[];
    createMany?: Prisma.SlaEventCreateManyPeriodInputEnvelope;
    connect?: Prisma.SlaEventWhereUniqueInput | Prisma.SlaEventWhereUniqueInput[];
};
export type SlaEventUncheckedCreateNestedManyWithoutPeriodInput = {
    create?: Prisma.XOR<Prisma.SlaEventCreateWithoutPeriodInput, Prisma.SlaEventUncheckedCreateWithoutPeriodInput> | Prisma.SlaEventCreateWithoutPeriodInput[] | Prisma.SlaEventUncheckedCreateWithoutPeriodInput[];
    connectOrCreate?: Prisma.SlaEventCreateOrConnectWithoutPeriodInput | Prisma.SlaEventCreateOrConnectWithoutPeriodInput[];
    createMany?: Prisma.SlaEventCreateManyPeriodInputEnvelope;
    connect?: Prisma.SlaEventWhereUniqueInput | Prisma.SlaEventWhereUniqueInput[];
};
export type SlaEventUpdateManyWithoutPeriodNestedInput = {
    create?: Prisma.XOR<Prisma.SlaEventCreateWithoutPeriodInput, Prisma.SlaEventUncheckedCreateWithoutPeriodInput> | Prisma.SlaEventCreateWithoutPeriodInput[] | Prisma.SlaEventUncheckedCreateWithoutPeriodInput[];
    connectOrCreate?: Prisma.SlaEventCreateOrConnectWithoutPeriodInput | Prisma.SlaEventCreateOrConnectWithoutPeriodInput[];
    upsert?: Prisma.SlaEventUpsertWithWhereUniqueWithoutPeriodInput | Prisma.SlaEventUpsertWithWhereUniqueWithoutPeriodInput[];
    createMany?: Prisma.SlaEventCreateManyPeriodInputEnvelope;
    set?: Prisma.SlaEventWhereUniqueInput | Prisma.SlaEventWhereUniqueInput[];
    disconnect?: Prisma.SlaEventWhereUniqueInput | Prisma.SlaEventWhereUniqueInput[];
    delete?: Prisma.SlaEventWhereUniqueInput | Prisma.SlaEventWhereUniqueInput[];
    connect?: Prisma.SlaEventWhereUniqueInput | Prisma.SlaEventWhereUniqueInput[];
    update?: Prisma.SlaEventUpdateWithWhereUniqueWithoutPeriodInput | Prisma.SlaEventUpdateWithWhereUniqueWithoutPeriodInput[];
    updateMany?: Prisma.SlaEventUpdateManyWithWhereWithoutPeriodInput | Prisma.SlaEventUpdateManyWithWhereWithoutPeriodInput[];
    deleteMany?: Prisma.SlaEventScalarWhereInput | Prisma.SlaEventScalarWhereInput[];
};
export type SlaEventUncheckedUpdateManyWithoutPeriodNestedInput = {
    create?: Prisma.XOR<Prisma.SlaEventCreateWithoutPeriodInput, Prisma.SlaEventUncheckedCreateWithoutPeriodInput> | Prisma.SlaEventCreateWithoutPeriodInput[] | Prisma.SlaEventUncheckedCreateWithoutPeriodInput[];
    connectOrCreate?: Prisma.SlaEventCreateOrConnectWithoutPeriodInput | Prisma.SlaEventCreateOrConnectWithoutPeriodInput[];
    upsert?: Prisma.SlaEventUpsertWithWhereUniqueWithoutPeriodInput | Prisma.SlaEventUpsertWithWhereUniqueWithoutPeriodInput[];
    createMany?: Prisma.SlaEventCreateManyPeriodInputEnvelope;
    set?: Prisma.SlaEventWhereUniqueInput | Prisma.SlaEventWhereUniqueInput[];
    disconnect?: Prisma.SlaEventWhereUniqueInput | Prisma.SlaEventWhereUniqueInput[];
    delete?: Prisma.SlaEventWhereUniqueInput | Prisma.SlaEventWhereUniqueInput[];
    connect?: Prisma.SlaEventWhereUniqueInput | Prisma.SlaEventWhereUniqueInput[];
    update?: Prisma.SlaEventUpdateWithWhereUniqueWithoutPeriodInput | Prisma.SlaEventUpdateWithWhereUniqueWithoutPeriodInput[];
    updateMany?: Prisma.SlaEventUpdateManyWithWhereWithoutPeriodInput | Prisma.SlaEventUpdateManyWithWhereWithoutPeriodInput[];
    deleteMany?: Prisma.SlaEventScalarWhereInput | Prisma.SlaEventScalarWhereInput[];
};
export type SlaEventCreateWithoutPeriodInput = {
    id?: string;
    eventType: string;
    scenario: string;
    scheduledAt: Date | string;
    executedAt?: Date | string | null;
    createdAt?: Date | string;
};
export type SlaEventUncheckedCreateWithoutPeriodInput = {
    id?: string;
    eventType: string;
    scenario: string;
    scheduledAt: Date | string;
    executedAt?: Date | string | null;
    createdAt?: Date | string;
};
export type SlaEventCreateOrConnectWithoutPeriodInput = {
    where: Prisma.SlaEventWhereUniqueInput;
    create: Prisma.XOR<Prisma.SlaEventCreateWithoutPeriodInput, Prisma.SlaEventUncheckedCreateWithoutPeriodInput>;
};
export type SlaEventCreateManyPeriodInputEnvelope = {
    data: Prisma.SlaEventCreateManyPeriodInput | Prisma.SlaEventCreateManyPeriodInput[];
    skipDuplicates?: boolean;
};
export type SlaEventUpsertWithWhereUniqueWithoutPeriodInput = {
    where: Prisma.SlaEventWhereUniqueInput;
    update: Prisma.XOR<Prisma.SlaEventUpdateWithoutPeriodInput, Prisma.SlaEventUncheckedUpdateWithoutPeriodInput>;
    create: Prisma.XOR<Prisma.SlaEventCreateWithoutPeriodInput, Prisma.SlaEventUncheckedCreateWithoutPeriodInput>;
};
export type SlaEventUpdateWithWhereUniqueWithoutPeriodInput = {
    where: Prisma.SlaEventWhereUniqueInput;
    data: Prisma.XOR<Prisma.SlaEventUpdateWithoutPeriodInput, Prisma.SlaEventUncheckedUpdateWithoutPeriodInput>;
};
export type SlaEventUpdateManyWithWhereWithoutPeriodInput = {
    where: Prisma.SlaEventScalarWhereInput;
    data: Prisma.XOR<Prisma.SlaEventUpdateManyMutationInput, Prisma.SlaEventUncheckedUpdateManyWithoutPeriodInput>;
};
export type SlaEventScalarWhereInput = {
    AND?: Prisma.SlaEventScalarWhereInput | Prisma.SlaEventScalarWhereInput[];
    OR?: Prisma.SlaEventScalarWhereInput[];
    NOT?: Prisma.SlaEventScalarWhereInput | Prisma.SlaEventScalarWhereInput[];
    id?: Prisma.StringFilter<"SlaEvent"> | string;
    periodId?: Prisma.StringFilter<"SlaEvent"> | string;
    eventType?: Prisma.StringFilter<"SlaEvent"> | string;
    scenario?: Prisma.StringFilter<"SlaEvent"> | string;
    scheduledAt?: Prisma.DateTimeFilter<"SlaEvent"> | Date | string;
    executedAt?: Prisma.DateTimeNullableFilter<"SlaEvent"> | Date | string | null;
    createdAt?: Prisma.DateTimeFilter<"SlaEvent"> | Date | string;
};
export type SlaEventCreateManyPeriodInput = {
    id?: string;
    eventType: string;
    scenario: string;
    scheduledAt: Date | string;
    executedAt?: Date | string | null;
    createdAt?: Date | string;
};
export type SlaEventUpdateWithoutPeriodInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    eventType?: Prisma.StringFieldUpdateOperationsInput | string;
    scenario?: Prisma.StringFieldUpdateOperationsInput | string;
    scheduledAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    executedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type SlaEventUncheckedUpdateWithoutPeriodInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    eventType?: Prisma.StringFieldUpdateOperationsInput | string;
    scenario?: Prisma.StringFieldUpdateOperationsInput | string;
    scheduledAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    executedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type SlaEventUncheckedUpdateManyWithoutPeriodInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    eventType?: Prisma.StringFieldUpdateOperationsInput | string;
    scenario?: Prisma.StringFieldUpdateOperationsInput | string;
    scheduledAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    executedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type SlaEventSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    periodId?: boolean;
    eventType?: boolean;
    scenario?: boolean;
    scheduledAt?: boolean;
    executedAt?: boolean;
    createdAt?: boolean;
    period?: boolean | Prisma.PeriodDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["slaEvent"]>;
export type SlaEventSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    periodId?: boolean;
    eventType?: boolean;
    scenario?: boolean;
    scheduledAt?: boolean;
    executedAt?: boolean;
    createdAt?: boolean;
    period?: boolean | Prisma.PeriodDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["slaEvent"]>;
export type SlaEventSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    periodId?: boolean;
    eventType?: boolean;
    scenario?: boolean;
    scheduledAt?: boolean;
    executedAt?: boolean;
    createdAt?: boolean;
    period?: boolean | Prisma.PeriodDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["slaEvent"]>;
export type SlaEventSelectScalar = {
    id?: boolean;
    periodId?: boolean;
    eventType?: boolean;
    scenario?: boolean;
    scheduledAt?: boolean;
    executedAt?: boolean;
    createdAt?: boolean;
};
export type SlaEventOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "periodId" | "eventType" | "scenario" | "scheduledAt" | "executedAt" | "createdAt", ExtArgs["result"]["slaEvent"]>;
export type SlaEventInclude<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    period?: boolean | Prisma.PeriodDefaultArgs<ExtArgs>;
};
export type SlaEventIncludeCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    period?: boolean | Prisma.PeriodDefaultArgs<ExtArgs>;
};
export type SlaEventIncludeUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    period?: boolean | Prisma.PeriodDefaultArgs<ExtArgs>;
};
export type $SlaEventPayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "SlaEvent";
    objects: {
        period: Prisma.$PeriodPayload<ExtArgs>;
    };
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: string;
        periodId: string;
        eventType: string;
        scenario: string;
        scheduledAt: Date;
        executedAt: Date | null;
        createdAt: Date;
    }, ExtArgs["result"]["slaEvent"]>;
    composites: {};
};
export type SlaEventGetPayload<S extends boolean | null | undefined | SlaEventDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$SlaEventPayload, S>;
export type SlaEventCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<SlaEventFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: SlaEventCountAggregateInputType | true;
};
export interface SlaEventDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['SlaEvent'];
        meta: {
            name: 'SlaEvent';
        };
    };
    findUnique<T extends SlaEventFindUniqueArgs>(args: Prisma.SelectSubset<T, SlaEventFindUniqueArgs<ExtArgs>>): Prisma.Prisma__SlaEventClient<runtime.Types.Result.GetResult<Prisma.$SlaEventPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    findUniqueOrThrow<T extends SlaEventFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, SlaEventFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__SlaEventClient<runtime.Types.Result.GetResult<Prisma.$SlaEventPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    findFirst<T extends SlaEventFindFirstArgs>(args?: Prisma.SelectSubset<T, SlaEventFindFirstArgs<ExtArgs>>): Prisma.Prisma__SlaEventClient<runtime.Types.Result.GetResult<Prisma.$SlaEventPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    findFirstOrThrow<T extends SlaEventFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, SlaEventFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__SlaEventClient<runtime.Types.Result.GetResult<Prisma.$SlaEventPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    findMany<T extends SlaEventFindManyArgs>(args?: Prisma.SelectSubset<T, SlaEventFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$SlaEventPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    create<T extends SlaEventCreateArgs>(args: Prisma.SelectSubset<T, SlaEventCreateArgs<ExtArgs>>): Prisma.Prisma__SlaEventClient<runtime.Types.Result.GetResult<Prisma.$SlaEventPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    createMany<T extends SlaEventCreateManyArgs>(args?: Prisma.SelectSubset<T, SlaEventCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    createManyAndReturn<T extends SlaEventCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, SlaEventCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$SlaEventPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    delete<T extends SlaEventDeleteArgs>(args: Prisma.SelectSubset<T, SlaEventDeleteArgs<ExtArgs>>): Prisma.Prisma__SlaEventClient<runtime.Types.Result.GetResult<Prisma.$SlaEventPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    update<T extends SlaEventUpdateArgs>(args: Prisma.SelectSubset<T, SlaEventUpdateArgs<ExtArgs>>): Prisma.Prisma__SlaEventClient<runtime.Types.Result.GetResult<Prisma.$SlaEventPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    deleteMany<T extends SlaEventDeleteManyArgs>(args?: Prisma.SelectSubset<T, SlaEventDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    updateMany<T extends SlaEventUpdateManyArgs>(args: Prisma.SelectSubset<T, SlaEventUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    updateManyAndReturn<T extends SlaEventUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, SlaEventUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$SlaEventPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    upsert<T extends SlaEventUpsertArgs>(args: Prisma.SelectSubset<T, SlaEventUpsertArgs<ExtArgs>>): Prisma.Prisma__SlaEventClient<runtime.Types.Result.GetResult<Prisma.$SlaEventPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    count<T extends SlaEventCountArgs>(args?: Prisma.Subset<T, SlaEventCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], SlaEventCountAggregateOutputType> : number>;
    aggregate<T extends SlaEventAggregateArgs>(args: Prisma.Subset<T, SlaEventAggregateArgs>): Prisma.PrismaPromise<GetSlaEventAggregateType<T>>;
    groupBy<T extends SlaEventGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: SlaEventGroupByArgs['orderBy'];
    } : {
        orderBy?: SlaEventGroupByArgs['orderBy'];
    }, OrderFields extends Prisma.ExcludeUnderscoreKeys<Prisma.Keys<Prisma.MaybeTupleToUnion<T['orderBy']>>>, ByFields extends Prisma.MaybeTupleToUnion<T['by']>, ByValid extends Prisma.Has<ByFields, OrderFields>, HavingFields extends Prisma.GetHavingFields<T['having']>, HavingValid extends Prisma.Has<ByFields, HavingFields>, ByEmpty extends T['by'] extends never[] ? Prisma.True : Prisma.False, InputErrors extends ByEmpty extends Prisma.True ? `Error: "by" must not be empty.` : HavingValid extends Prisma.False ? {
        [P in HavingFields]: P extends ByFields ? never : P extends string ? `Error: Field "${P}" used in "having" needs to be provided in "by".` : [
            Error,
            'Field ',
            P,
            ` in "having" needs to be provided in "by"`
        ];
    }[HavingFields] : 'take' extends Prisma.Keys<T> ? 'orderBy' extends Prisma.Keys<T> ? ByValid extends Prisma.True ? {} : {
        [P in OrderFields]: P extends ByFields ? never : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
    }[OrderFields] : 'Error: If you provide "take", you also need to provide "orderBy"' : 'skip' extends Prisma.Keys<T> ? 'orderBy' extends Prisma.Keys<T> ? ByValid extends Prisma.True ? {} : {
        [P in OrderFields]: P extends ByFields ? never : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
    }[OrderFields] : 'Error: If you provide "skip", you also need to provide "orderBy"' : ByValid extends Prisma.True ? {} : {
        [P in OrderFields]: P extends ByFields ? never : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, SlaEventGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSlaEventGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    readonly fields: SlaEventFieldRefs;
}
export interface Prisma__SlaEventClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    period<T extends Prisma.PeriodDefaultArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.PeriodDefaultArgs<ExtArgs>>): Prisma.Prisma__PeriodClient<runtime.Types.Result.GetResult<Prisma.$PeriodPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>;
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): runtime.Types.Utils.JsPromise<TResult1 | TResult2>;
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): runtime.Types.Utils.JsPromise<T | TResult>;
    finally(onfinally?: (() => void) | undefined | null): runtime.Types.Utils.JsPromise<T>;
}
export interface SlaEventFieldRefs {
    readonly id: Prisma.FieldRef<"SlaEvent", 'String'>;
    readonly periodId: Prisma.FieldRef<"SlaEvent", 'String'>;
    readonly eventType: Prisma.FieldRef<"SlaEvent", 'String'>;
    readonly scenario: Prisma.FieldRef<"SlaEvent", 'String'>;
    readonly scheduledAt: Prisma.FieldRef<"SlaEvent", 'DateTime'>;
    readonly executedAt: Prisma.FieldRef<"SlaEvent", 'DateTime'>;
    readonly createdAt: Prisma.FieldRef<"SlaEvent", 'DateTime'>;
}
export type SlaEventFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.SlaEventSelect<ExtArgs> | null;
    omit?: Prisma.SlaEventOmit<ExtArgs> | null;
    include?: Prisma.SlaEventInclude<ExtArgs> | null;
    where: Prisma.SlaEventWhereUniqueInput;
};
export type SlaEventFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.SlaEventSelect<ExtArgs> | null;
    omit?: Prisma.SlaEventOmit<ExtArgs> | null;
    include?: Prisma.SlaEventInclude<ExtArgs> | null;
    where: Prisma.SlaEventWhereUniqueInput;
};
export type SlaEventFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.SlaEventSelect<ExtArgs> | null;
    omit?: Prisma.SlaEventOmit<ExtArgs> | null;
    include?: Prisma.SlaEventInclude<ExtArgs> | null;
    where?: Prisma.SlaEventWhereInput;
    orderBy?: Prisma.SlaEventOrderByWithRelationInput | Prisma.SlaEventOrderByWithRelationInput[];
    cursor?: Prisma.SlaEventWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.SlaEventScalarFieldEnum | Prisma.SlaEventScalarFieldEnum[];
};
export type SlaEventFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.SlaEventSelect<ExtArgs> | null;
    omit?: Prisma.SlaEventOmit<ExtArgs> | null;
    include?: Prisma.SlaEventInclude<ExtArgs> | null;
    where?: Prisma.SlaEventWhereInput;
    orderBy?: Prisma.SlaEventOrderByWithRelationInput | Prisma.SlaEventOrderByWithRelationInput[];
    cursor?: Prisma.SlaEventWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.SlaEventScalarFieldEnum | Prisma.SlaEventScalarFieldEnum[];
};
export type SlaEventFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.SlaEventSelect<ExtArgs> | null;
    omit?: Prisma.SlaEventOmit<ExtArgs> | null;
    include?: Prisma.SlaEventInclude<ExtArgs> | null;
    where?: Prisma.SlaEventWhereInput;
    orderBy?: Prisma.SlaEventOrderByWithRelationInput | Prisma.SlaEventOrderByWithRelationInput[];
    cursor?: Prisma.SlaEventWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.SlaEventScalarFieldEnum | Prisma.SlaEventScalarFieldEnum[];
};
export type SlaEventCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.SlaEventSelect<ExtArgs> | null;
    omit?: Prisma.SlaEventOmit<ExtArgs> | null;
    include?: Prisma.SlaEventInclude<ExtArgs> | null;
    data: Prisma.XOR<Prisma.SlaEventCreateInput, Prisma.SlaEventUncheckedCreateInput>;
};
export type SlaEventCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    data: Prisma.SlaEventCreateManyInput | Prisma.SlaEventCreateManyInput[];
    skipDuplicates?: boolean;
};
export type SlaEventCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.SlaEventSelectCreateManyAndReturn<ExtArgs> | null;
    omit?: Prisma.SlaEventOmit<ExtArgs> | null;
    data: Prisma.SlaEventCreateManyInput | Prisma.SlaEventCreateManyInput[];
    skipDuplicates?: boolean;
    include?: Prisma.SlaEventIncludeCreateManyAndReturn<ExtArgs> | null;
};
export type SlaEventUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.SlaEventSelect<ExtArgs> | null;
    omit?: Prisma.SlaEventOmit<ExtArgs> | null;
    include?: Prisma.SlaEventInclude<ExtArgs> | null;
    data: Prisma.XOR<Prisma.SlaEventUpdateInput, Prisma.SlaEventUncheckedUpdateInput>;
    where: Prisma.SlaEventWhereUniqueInput;
};
export type SlaEventUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    data: Prisma.XOR<Prisma.SlaEventUpdateManyMutationInput, Prisma.SlaEventUncheckedUpdateManyInput>;
    where?: Prisma.SlaEventWhereInput;
    limit?: number;
};
export type SlaEventUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.SlaEventSelectUpdateManyAndReturn<ExtArgs> | null;
    omit?: Prisma.SlaEventOmit<ExtArgs> | null;
    data: Prisma.XOR<Prisma.SlaEventUpdateManyMutationInput, Prisma.SlaEventUncheckedUpdateManyInput>;
    where?: Prisma.SlaEventWhereInput;
    limit?: number;
    include?: Prisma.SlaEventIncludeUpdateManyAndReturn<ExtArgs> | null;
};
export type SlaEventUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.SlaEventSelect<ExtArgs> | null;
    omit?: Prisma.SlaEventOmit<ExtArgs> | null;
    include?: Prisma.SlaEventInclude<ExtArgs> | null;
    where: Prisma.SlaEventWhereUniqueInput;
    create: Prisma.XOR<Prisma.SlaEventCreateInput, Prisma.SlaEventUncheckedCreateInput>;
    update: Prisma.XOR<Prisma.SlaEventUpdateInput, Prisma.SlaEventUncheckedUpdateInput>;
};
export type SlaEventDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.SlaEventSelect<ExtArgs> | null;
    omit?: Prisma.SlaEventOmit<ExtArgs> | null;
    include?: Prisma.SlaEventInclude<ExtArgs> | null;
    where: Prisma.SlaEventWhereUniqueInput;
};
export type SlaEventDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.SlaEventWhereInput;
    limit?: number;
};
export type SlaEventDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.SlaEventSelect<ExtArgs> | null;
    omit?: Prisma.SlaEventOmit<ExtArgs> | null;
    include?: Prisma.SlaEventInclude<ExtArgs> | null;
};
