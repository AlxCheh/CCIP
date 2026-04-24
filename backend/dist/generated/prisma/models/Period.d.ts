import type * as runtime from "@prisma/client/runtime/client";
import type * as Prisma from "../internal/prismaNamespace.js";
export type PeriodModel = runtime.Types.Result.DefaultSelection<Prisma.$PeriodPayload>;
export type AggregatePeriod = {
    _count: PeriodCountAggregateOutputType | null;
    _avg: PeriodAvgAggregateOutputType | null;
    _sum: PeriodSumAggregateOutputType | null;
    _min: PeriodMinAggregateOutputType | null;
    _max: PeriodMaxAggregateOutputType | null;
};
export type PeriodAvgAggregateOutputType = {
    periodNumber: number | null;
};
export type PeriodSumAggregateOutputType = {
    periodNumber: number | null;
};
export type PeriodMinAggregateOutputType = {
    id: string | null;
    objectId: string | null;
    periodNumber: number | null;
    status: string | null;
    openedBy: string | null;
    openedAt: Date | null;
    closedAt: Date | null;
};
export type PeriodMaxAggregateOutputType = {
    id: string | null;
    objectId: string | null;
    periodNumber: number | null;
    status: string | null;
    openedBy: string | null;
    openedAt: Date | null;
    closedAt: Date | null;
};
export type PeriodCountAggregateOutputType = {
    id: number;
    objectId: number;
    periodNumber: number;
    status: number;
    openedBy: number;
    openedAt: number;
    closedAt: number;
    _all: number;
};
export type PeriodAvgAggregateInputType = {
    periodNumber?: true;
};
export type PeriodSumAggregateInputType = {
    periodNumber?: true;
};
export type PeriodMinAggregateInputType = {
    id?: true;
    objectId?: true;
    periodNumber?: true;
    status?: true;
    openedBy?: true;
    openedAt?: true;
    closedAt?: true;
};
export type PeriodMaxAggregateInputType = {
    id?: true;
    objectId?: true;
    periodNumber?: true;
    status?: true;
    openedBy?: true;
    openedAt?: true;
    closedAt?: true;
};
export type PeriodCountAggregateInputType = {
    id?: true;
    objectId?: true;
    periodNumber?: true;
    status?: true;
    openedBy?: true;
    openedAt?: true;
    closedAt?: true;
    _all?: true;
};
export type PeriodAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.PeriodWhereInput;
    orderBy?: Prisma.PeriodOrderByWithRelationInput | Prisma.PeriodOrderByWithRelationInput[];
    cursor?: Prisma.PeriodWhereUniqueInput;
    take?: number;
    skip?: number;
    _count?: true | PeriodCountAggregateInputType;
    _avg?: PeriodAvgAggregateInputType;
    _sum?: PeriodSumAggregateInputType;
    _min?: PeriodMinAggregateInputType;
    _max?: PeriodMaxAggregateInputType;
};
export type GetPeriodAggregateType<T extends PeriodAggregateArgs> = {
    [P in keyof T & keyof AggregatePeriod]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregatePeriod[P]> : Prisma.GetScalarType<T[P], AggregatePeriod[P]>;
};
export type PeriodGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.PeriodWhereInput;
    orderBy?: Prisma.PeriodOrderByWithAggregationInput | Prisma.PeriodOrderByWithAggregationInput[];
    by: Prisma.PeriodScalarFieldEnum[] | Prisma.PeriodScalarFieldEnum;
    having?: Prisma.PeriodScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: PeriodCountAggregateInputType | true;
    _avg?: PeriodAvgAggregateInputType;
    _sum?: PeriodSumAggregateInputType;
    _min?: PeriodMinAggregateInputType;
    _max?: PeriodMaxAggregateInputType;
};
export type PeriodGroupByOutputType = {
    id: string;
    objectId: string;
    periodNumber: number;
    status: string;
    openedBy: string;
    openedAt: Date;
    closedAt: Date | null;
    _count: PeriodCountAggregateOutputType | null;
    _avg: PeriodAvgAggregateOutputType | null;
    _sum: PeriodSumAggregateOutputType | null;
    _min: PeriodMinAggregateOutputType | null;
    _max: PeriodMaxAggregateOutputType | null;
};
export type GetPeriodGroupByPayload<T extends PeriodGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<PeriodGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof PeriodGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], PeriodGroupByOutputType[P]> : Prisma.GetScalarType<T[P], PeriodGroupByOutputType[P]>;
}>>;
export type PeriodWhereInput = {
    AND?: Prisma.PeriodWhereInput | Prisma.PeriodWhereInput[];
    OR?: Prisma.PeriodWhereInput[];
    NOT?: Prisma.PeriodWhereInput | Prisma.PeriodWhereInput[];
    id?: Prisma.StringFilter<"Period"> | string;
    objectId?: Prisma.StringFilter<"Period"> | string;
    periodNumber?: Prisma.IntFilter<"Period"> | number;
    status?: Prisma.StringFilter<"Period"> | string;
    openedBy?: Prisma.StringFilter<"Period"> | string;
    openedAt?: Prisma.DateTimeFilter<"Period"> | Date | string;
    closedAt?: Prisma.DateTimeNullableFilter<"Period"> | Date | string | null;
    object?: Prisma.XOR<Prisma.ObjectScalarRelationFilter, Prisma.ObjectWhereInput>;
    opener?: Prisma.XOR<Prisma.UserScalarRelationFilter, Prisma.UserWhereInput>;
    facts?: Prisma.PeriodFactListRelationFilter;
    slaEvents?: Prisma.SlaEventListRelationFilter;
    auditLogs?: Prisma.AuditLogListRelationFilter;
};
export type PeriodOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    objectId?: Prisma.SortOrder;
    periodNumber?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
    openedBy?: Prisma.SortOrder;
    openedAt?: Prisma.SortOrder;
    closedAt?: Prisma.SortOrderInput | Prisma.SortOrder;
    object?: Prisma.ObjectOrderByWithRelationInput;
    opener?: Prisma.UserOrderByWithRelationInput;
    facts?: Prisma.PeriodFactOrderByRelationAggregateInput;
    slaEvents?: Prisma.SlaEventOrderByRelationAggregateInput;
    auditLogs?: Prisma.AuditLogOrderByRelationAggregateInput;
};
export type PeriodWhereUniqueInput = Prisma.AtLeast<{
    id?: string;
    objectId_periodNumber?: Prisma.PeriodObjectIdPeriodNumberCompoundUniqueInput;
    AND?: Prisma.PeriodWhereInput | Prisma.PeriodWhereInput[];
    OR?: Prisma.PeriodWhereInput[];
    NOT?: Prisma.PeriodWhereInput | Prisma.PeriodWhereInput[];
    objectId?: Prisma.StringFilter<"Period"> | string;
    periodNumber?: Prisma.IntFilter<"Period"> | number;
    status?: Prisma.StringFilter<"Period"> | string;
    openedBy?: Prisma.StringFilter<"Period"> | string;
    openedAt?: Prisma.DateTimeFilter<"Period"> | Date | string;
    closedAt?: Prisma.DateTimeNullableFilter<"Period"> | Date | string | null;
    object?: Prisma.XOR<Prisma.ObjectScalarRelationFilter, Prisma.ObjectWhereInput>;
    opener?: Prisma.XOR<Prisma.UserScalarRelationFilter, Prisma.UserWhereInput>;
    facts?: Prisma.PeriodFactListRelationFilter;
    slaEvents?: Prisma.SlaEventListRelationFilter;
    auditLogs?: Prisma.AuditLogListRelationFilter;
}, "id" | "objectId_periodNumber">;
export type PeriodOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    objectId?: Prisma.SortOrder;
    periodNumber?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
    openedBy?: Prisma.SortOrder;
    openedAt?: Prisma.SortOrder;
    closedAt?: Prisma.SortOrderInput | Prisma.SortOrder;
    _count?: Prisma.PeriodCountOrderByAggregateInput;
    _avg?: Prisma.PeriodAvgOrderByAggregateInput;
    _max?: Prisma.PeriodMaxOrderByAggregateInput;
    _min?: Prisma.PeriodMinOrderByAggregateInput;
    _sum?: Prisma.PeriodSumOrderByAggregateInput;
};
export type PeriodScalarWhereWithAggregatesInput = {
    AND?: Prisma.PeriodScalarWhereWithAggregatesInput | Prisma.PeriodScalarWhereWithAggregatesInput[];
    OR?: Prisma.PeriodScalarWhereWithAggregatesInput[];
    NOT?: Prisma.PeriodScalarWhereWithAggregatesInput | Prisma.PeriodScalarWhereWithAggregatesInput[];
    id?: Prisma.StringWithAggregatesFilter<"Period"> | string;
    objectId?: Prisma.StringWithAggregatesFilter<"Period"> | string;
    periodNumber?: Prisma.IntWithAggregatesFilter<"Period"> | number;
    status?: Prisma.StringWithAggregatesFilter<"Period"> | string;
    openedBy?: Prisma.StringWithAggregatesFilter<"Period"> | string;
    openedAt?: Prisma.DateTimeWithAggregatesFilter<"Period"> | Date | string;
    closedAt?: Prisma.DateTimeNullableWithAggregatesFilter<"Period"> | Date | string | null;
};
export type PeriodCreateInput = {
    id?: string;
    periodNumber: number;
    status?: string;
    openedAt?: Date | string;
    closedAt?: Date | string | null;
    object: Prisma.ObjectCreateNestedOneWithoutPeriodsInput;
    opener: Prisma.UserCreateNestedOneWithoutPeriodsInput;
    facts?: Prisma.PeriodFactCreateNestedManyWithoutPeriodInput;
    slaEvents?: Prisma.SlaEventCreateNestedManyWithoutPeriodInput;
    auditLogs?: Prisma.AuditLogCreateNestedManyWithoutPeriodInput;
};
export type PeriodUncheckedCreateInput = {
    id?: string;
    objectId: string;
    periodNumber: number;
    status?: string;
    openedBy: string;
    openedAt?: Date | string;
    closedAt?: Date | string | null;
    facts?: Prisma.PeriodFactUncheckedCreateNestedManyWithoutPeriodInput;
    slaEvents?: Prisma.SlaEventUncheckedCreateNestedManyWithoutPeriodInput;
    auditLogs?: Prisma.AuditLogUncheckedCreateNestedManyWithoutPeriodInput;
};
export type PeriodUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    periodNumber?: Prisma.IntFieldUpdateOperationsInput | number;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    openedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    closedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    object?: Prisma.ObjectUpdateOneRequiredWithoutPeriodsNestedInput;
    opener?: Prisma.UserUpdateOneRequiredWithoutPeriodsNestedInput;
    facts?: Prisma.PeriodFactUpdateManyWithoutPeriodNestedInput;
    slaEvents?: Prisma.SlaEventUpdateManyWithoutPeriodNestedInput;
    auditLogs?: Prisma.AuditLogUpdateManyWithoutPeriodNestedInput;
};
export type PeriodUncheckedUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    objectId?: Prisma.StringFieldUpdateOperationsInput | string;
    periodNumber?: Prisma.IntFieldUpdateOperationsInput | number;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    openedBy?: Prisma.StringFieldUpdateOperationsInput | string;
    openedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    closedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    facts?: Prisma.PeriodFactUncheckedUpdateManyWithoutPeriodNestedInput;
    slaEvents?: Prisma.SlaEventUncheckedUpdateManyWithoutPeriodNestedInput;
    auditLogs?: Prisma.AuditLogUncheckedUpdateManyWithoutPeriodNestedInput;
};
export type PeriodCreateManyInput = {
    id?: string;
    objectId: string;
    periodNumber: number;
    status?: string;
    openedBy: string;
    openedAt?: Date | string;
    closedAt?: Date | string | null;
};
export type PeriodUpdateManyMutationInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    periodNumber?: Prisma.IntFieldUpdateOperationsInput | number;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    openedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    closedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
};
export type PeriodUncheckedUpdateManyInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    objectId?: Prisma.StringFieldUpdateOperationsInput | string;
    periodNumber?: Prisma.IntFieldUpdateOperationsInput | number;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    openedBy?: Prisma.StringFieldUpdateOperationsInput | string;
    openedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    closedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
};
export type PeriodListRelationFilter = {
    every?: Prisma.PeriodWhereInput;
    some?: Prisma.PeriodWhereInput;
    none?: Prisma.PeriodWhereInput;
};
export type PeriodOrderByRelationAggregateInput = {
    _count?: Prisma.SortOrder;
};
export type PeriodObjectIdPeriodNumberCompoundUniqueInput = {
    objectId: string;
    periodNumber: number;
};
export type PeriodCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    objectId?: Prisma.SortOrder;
    periodNumber?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
    openedBy?: Prisma.SortOrder;
    openedAt?: Prisma.SortOrder;
    closedAt?: Prisma.SortOrder;
};
export type PeriodAvgOrderByAggregateInput = {
    periodNumber?: Prisma.SortOrder;
};
export type PeriodMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    objectId?: Prisma.SortOrder;
    periodNumber?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
    openedBy?: Prisma.SortOrder;
    openedAt?: Prisma.SortOrder;
    closedAt?: Prisma.SortOrder;
};
export type PeriodMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    objectId?: Prisma.SortOrder;
    periodNumber?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
    openedBy?: Prisma.SortOrder;
    openedAt?: Prisma.SortOrder;
    closedAt?: Prisma.SortOrder;
};
export type PeriodSumOrderByAggregateInput = {
    periodNumber?: Prisma.SortOrder;
};
export type PeriodScalarRelationFilter = {
    is?: Prisma.PeriodWhereInput;
    isNot?: Prisma.PeriodWhereInput;
};
export type PeriodNullableScalarRelationFilter = {
    is?: Prisma.PeriodWhereInput | null;
    isNot?: Prisma.PeriodWhereInput | null;
};
export type PeriodCreateNestedManyWithoutOpenerInput = {
    create?: Prisma.XOR<Prisma.PeriodCreateWithoutOpenerInput, Prisma.PeriodUncheckedCreateWithoutOpenerInput> | Prisma.PeriodCreateWithoutOpenerInput[] | Prisma.PeriodUncheckedCreateWithoutOpenerInput[];
    connectOrCreate?: Prisma.PeriodCreateOrConnectWithoutOpenerInput | Prisma.PeriodCreateOrConnectWithoutOpenerInput[];
    createMany?: Prisma.PeriodCreateManyOpenerInputEnvelope;
    connect?: Prisma.PeriodWhereUniqueInput | Prisma.PeriodWhereUniqueInput[];
};
export type PeriodUncheckedCreateNestedManyWithoutOpenerInput = {
    create?: Prisma.XOR<Prisma.PeriodCreateWithoutOpenerInput, Prisma.PeriodUncheckedCreateWithoutOpenerInput> | Prisma.PeriodCreateWithoutOpenerInput[] | Prisma.PeriodUncheckedCreateWithoutOpenerInput[];
    connectOrCreate?: Prisma.PeriodCreateOrConnectWithoutOpenerInput | Prisma.PeriodCreateOrConnectWithoutOpenerInput[];
    createMany?: Prisma.PeriodCreateManyOpenerInputEnvelope;
    connect?: Prisma.PeriodWhereUniqueInput | Prisma.PeriodWhereUniqueInput[];
};
export type PeriodUpdateManyWithoutOpenerNestedInput = {
    create?: Prisma.XOR<Prisma.PeriodCreateWithoutOpenerInput, Prisma.PeriodUncheckedCreateWithoutOpenerInput> | Prisma.PeriodCreateWithoutOpenerInput[] | Prisma.PeriodUncheckedCreateWithoutOpenerInput[];
    connectOrCreate?: Prisma.PeriodCreateOrConnectWithoutOpenerInput | Prisma.PeriodCreateOrConnectWithoutOpenerInput[];
    upsert?: Prisma.PeriodUpsertWithWhereUniqueWithoutOpenerInput | Prisma.PeriodUpsertWithWhereUniqueWithoutOpenerInput[];
    createMany?: Prisma.PeriodCreateManyOpenerInputEnvelope;
    set?: Prisma.PeriodWhereUniqueInput | Prisma.PeriodWhereUniqueInput[];
    disconnect?: Prisma.PeriodWhereUniqueInput | Prisma.PeriodWhereUniqueInput[];
    delete?: Prisma.PeriodWhereUniqueInput | Prisma.PeriodWhereUniqueInput[];
    connect?: Prisma.PeriodWhereUniqueInput | Prisma.PeriodWhereUniqueInput[];
    update?: Prisma.PeriodUpdateWithWhereUniqueWithoutOpenerInput | Prisma.PeriodUpdateWithWhereUniqueWithoutOpenerInput[];
    updateMany?: Prisma.PeriodUpdateManyWithWhereWithoutOpenerInput | Prisma.PeriodUpdateManyWithWhereWithoutOpenerInput[];
    deleteMany?: Prisma.PeriodScalarWhereInput | Prisma.PeriodScalarWhereInput[];
};
export type PeriodUncheckedUpdateManyWithoutOpenerNestedInput = {
    create?: Prisma.XOR<Prisma.PeriodCreateWithoutOpenerInput, Prisma.PeriodUncheckedCreateWithoutOpenerInput> | Prisma.PeriodCreateWithoutOpenerInput[] | Prisma.PeriodUncheckedCreateWithoutOpenerInput[];
    connectOrCreate?: Prisma.PeriodCreateOrConnectWithoutOpenerInput | Prisma.PeriodCreateOrConnectWithoutOpenerInput[];
    upsert?: Prisma.PeriodUpsertWithWhereUniqueWithoutOpenerInput | Prisma.PeriodUpsertWithWhereUniqueWithoutOpenerInput[];
    createMany?: Prisma.PeriodCreateManyOpenerInputEnvelope;
    set?: Prisma.PeriodWhereUniqueInput | Prisma.PeriodWhereUniqueInput[];
    disconnect?: Prisma.PeriodWhereUniqueInput | Prisma.PeriodWhereUniqueInput[];
    delete?: Prisma.PeriodWhereUniqueInput | Prisma.PeriodWhereUniqueInput[];
    connect?: Prisma.PeriodWhereUniqueInput | Prisma.PeriodWhereUniqueInput[];
    update?: Prisma.PeriodUpdateWithWhereUniqueWithoutOpenerInput | Prisma.PeriodUpdateWithWhereUniqueWithoutOpenerInput[];
    updateMany?: Prisma.PeriodUpdateManyWithWhereWithoutOpenerInput | Prisma.PeriodUpdateManyWithWhereWithoutOpenerInput[];
    deleteMany?: Prisma.PeriodScalarWhereInput | Prisma.PeriodScalarWhereInput[];
};
export type PeriodCreateNestedManyWithoutObjectInput = {
    create?: Prisma.XOR<Prisma.PeriodCreateWithoutObjectInput, Prisma.PeriodUncheckedCreateWithoutObjectInput> | Prisma.PeriodCreateWithoutObjectInput[] | Prisma.PeriodUncheckedCreateWithoutObjectInput[];
    connectOrCreate?: Prisma.PeriodCreateOrConnectWithoutObjectInput | Prisma.PeriodCreateOrConnectWithoutObjectInput[];
    createMany?: Prisma.PeriodCreateManyObjectInputEnvelope;
    connect?: Prisma.PeriodWhereUniqueInput | Prisma.PeriodWhereUniqueInput[];
};
export type PeriodUncheckedCreateNestedManyWithoutObjectInput = {
    create?: Prisma.XOR<Prisma.PeriodCreateWithoutObjectInput, Prisma.PeriodUncheckedCreateWithoutObjectInput> | Prisma.PeriodCreateWithoutObjectInput[] | Prisma.PeriodUncheckedCreateWithoutObjectInput[];
    connectOrCreate?: Prisma.PeriodCreateOrConnectWithoutObjectInput | Prisma.PeriodCreateOrConnectWithoutObjectInput[];
    createMany?: Prisma.PeriodCreateManyObjectInputEnvelope;
    connect?: Prisma.PeriodWhereUniqueInput | Prisma.PeriodWhereUniqueInput[];
};
export type PeriodUpdateManyWithoutObjectNestedInput = {
    create?: Prisma.XOR<Prisma.PeriodCreateWithoutObjectInput, Prisma.PeriodUncheckedCreateWithoutObjectInput> | Prisma.PeriodCreateWithoutObjectInput[] | Prisma.PeriodUncheckedCreateWithoutObjectInput[];
    connectOrCreate?: Prisma.PeriodCreateOrConnectWithoutObjectInput | Prisma.PeriodCreateOrConnectWithoutObjectInput[];
    upsert?: Prisma.PeriodUpsertWithWhereUniqueWithoutObjectInput | Prisma.PeriodUpsertWithWhereUniqueWithoutObjectInput[];
    createMany?: Prisma.PeriodCreateManyObjectInputEnvelope;
    set?: Prisma.PeriodWhereUniqueInput | Prisma.PeriodWhereUniqueInput[];
    disconnect?: Prisma.PeriodWhereUniqueInput | Prisma.PeriodWhereUniqueInput[];
    delete?: Prisma.PeriodWhereUniqueInput | Prisma.PeriodWhereUniqueInput[];
    connect?: Prisma.PeriodWhereUniqueInput | Prisma.PeriodWhereUniqueInput[];
    update?: Prisma.PeriodUpdateWithWhereUniqueWithoutObjectInput | Prisma.PeriodUpdateWithWhereUniqueWithoutObjectInput[];
    updateMany?: Prisma.PeriodUpdateManyWithWhereWithoutObjectInput | Prisma.PeriodUpdateManyWithWhereWithoutObjectInput[];
    deleteMany?: Prisma.PeriodScalarWhereInput | Prisma.PeriodScalarWhereInput[];
};
export type PeriodUncheckedUpdateManyWithoutObjectNestedInput = {
    create?: Prisma.XOR<Prisma.PeriodCreateWithoutObjectInput, Prisma.PeriodUncheckedCreateWithoutObjectInput> | Prisma.PeriodCreateWithoutObjectInput[] | Prisma.PeriodUncheckedCreateWithoutObjectInput[];
    connectOrCreate?: Prisma.PeriodCreateOrConnectWithoutObjectInput | Prisma.PeriodCreateOrConnectWithoutObjectInput[];
    upsert?: Prisma.PeriodUpsertWithWhereUniqueWithoutObjectInput | Prisma.PeriodUpsertWithWhereUniqueWithoutObjectInput[];
    createMany?: Prisma.PeriodCreateManyObjectInputEnvelope;
    set?: Prisma.PeriodWhereUniqueInput | Prisma.PeriodWhereUniqueInput[];
    disconnect?: Prisma.PeriodWhereUniqueInput | Prisma.PeriodWhereUniqueInput[];
    delete?: Prisma.PeriodWhereUniqueInput | Prisma.PeriodWhereUniqueInput[];
    connect?: Prisma.PeriodWhereUniqueInput | Prisma.PeriodWhereUniqueInput[];
    update?: Prisma.PeriodUpdateWithWhereUniqueWithoutObjectInput | Prisma.PeriodUpdateWithWhereUniqueWithoutObjectInput[];
    updateMany?: Prisma.PeriodUpdateManyWithWhereWithoutObjectInput | Prisma.PeriodUpdateManyWithWhereWithoutObjectInput[];
    deleteMany?: Prisma.PeriodScalarWhereInput | Prisma.PeriodScalarWhereInput[];
};
export type IntFieldUpdateOperationsInput = {
    set?: number;
    increment?: number;
    decrement?: number;
    multiply?: number;
    divide?: number;
};
export type PeriodCreateNestedOneWithoutFactsInput = {
    create?: Prisma.XOR<Prisma.PeriodCreateWithoutFactsInput, Prisma.PeriodUncheckedCreateWithoutFactsInput>;
    connectOrCreate?: Prisma.PeriodCreateOrConnectWithoutFactsInput;
    connect?: Prisma.PeriodWhereUniqueInput;
};
export type PeriodUpdateOneRequiredWithoutFactsNestedInput = {
    create?: Prisma.XOR<Prisma.PeriodCreateWithoutFactsInput, Prisma.PeriodUncheckedCreateWithoutFactsInput>;
    connectOrCreate?: Prisma.PeriodCreateOrConnectWithoutFactsInput;
    upsert?: Prisma.PeriodUpsertWithoutFactsInput;
    connect?: Prisma.PeriodWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.PeriodUpdateToOneWithWhereWithoutFactsInput, Prisma.PeriodUpdateWithoutFactsInput>, Prisma.PeriodUncheckedUpdateWithoutFactsInput>;
};
export type PeriodCreateNestedOneWithoutSlaEventsInput = {
    create?: Prisma.XOR<Prisma.PeriodCreateWithoutSlaEventsInput, Prisma.PeriodUncheckedCreateWithoutSlaEventsInput>;
    connectOrCreate?: Prisma.PeriodCreateOrConnectWithoutSlaEventsInput;
    connect?: Prisma.PeriodWhereUniqueInput;
};
export type PeriodUpdateOneRequiredWithoutSlaEventsNestedInput = {
    create?: Prisma.XOR<Prisma.PeriodCreateWithoutSlaEventsInput, Prisma.PeriodUncheckedCreateWithoutSlaEventsInput>;
    connectOrCreate?: Prisma.PeriodCreateOrConnectWithoutSlaEventsInput;
    upsert?: Prisma.PeriodUpsertWithoutSlaEventsInput;
    connect?: Prisma.PeriodWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.PeriodUpdateToOneWithWhereWithoutSlaEventsInput, Prisma.PeriodUpdateWithoutSlaEventsInput>, Prisma.PeriodUncheckedUpdateWithoutSlaEventsInput>;
};
export type PeriodCreateNestedOneWithoutAuditLogsInput = {
    create?: Prisma.XOR<Prisma.PeriodCreateWithoutAuditLogsInput, Prisma.PeriodUncheckedCreateWithoutAuditLogsInput>;
    connectOrCreate?: Prisma.PeriodCreateOrConnectWithoutAuditLogsInput;
    connect?: Prisma.PeriodWhereUniqueInput;
};
export type PeriodUpdateOneWithoutAuditLogsNestedInput = {
    create?: Prisma.XOR<Prisma.PeriodCreateWithoutAuditLogsInput, Prisma.PeriodUncheckedCreateWithoutAuditLogsInput>;
    connectOrCreate?: Prisma.PeriodCreateOrConnectWithoutAuditLogsInput;
    upsert?: Prisma.PeriodUpsertWithoutAuditLogsInput;
    disconnect?: Prisma.PeriodWhereInput | boolean;
    delete?: Prisma.PeriodWhereInput | boolean;
    connect?: Prisma.PeriodWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.PeriodUpdateToOneWithWhereWithoutAuditLogsInput, Prisma.PeriodUpdateWithoutAuditLogsInput>, Prisma.PeriodUncheckedUpdateWithoutAuditLogsInput>;
};
export type PeriodCreateWithoutOpenerInput = {
    id?: string;
    periodNumber: number;
    status?: string;
    openedAt?: Date | string;
    closedAt?: Date | string | null;
    object: Prisma.ObjectCreateNestedOneWithoutPeriodsInput;
    facts?: Prisma.PeriodFactCreateNestedManyWithoutPeriodInput;
    slaEvents?: Prisma.SlaEventCreateNestedManyWithoutPeriodInput;
    auditLogs?: Prisma.AuditLogCreateNestedManyWithoutPeriodInput;
};
export type PeriodUncheckedCreateWithoutOpenerInput = {
    id?: string;
    objectId: string;
    periodNumber: number;
    status?: string;
    openedAt?: Date | string;
    closedAt?: Date | string | null;
    facts?: Prisma.PeriodFactUncheckedCreateNestedManyWithoutPeriodInput;
    slaEvents?: Prisma.SlaEventUncheckedCreateNestedManyWithoutPeriodInput;
    auditLogs?: Prisma.AuditLogUncheckedCreateNestedManyWithoutPeriodInput;
};
export type PeriodCreateOrConnectWithoutOpenerInput = {
    where: Prisma.PeriodWhereUniqueInput;
    create: Prisma.XOR<Prisma.PeriodCreateWithoutOpenerInput, Prisma.PeriodUncheckedCreateWithoutOpenerInput>;
};
export type PeriodCreateManyOpenerInputEnvelope = {
    data: Prisma.PeriodCreateManyOpenerInput | Prisma.PeriodCreateManyOpenerInput[];
    skipDuplicates?: boolean;
};
export type PeriodUpsertWithWhereUniqueWithoutOpenerInput = {
    where: Prisma.PeriodWhereUniqueInput;
    update: Prisma.XOR<Prisma.PeriodUpdateWithoutOpenerInput, Prisma.PeriodUncheckedUpdateWithoutOpenerInput>;
    create: Prisma.XOR<Prisma.PeriodCreateWithoutOpenerInput, Prisma.PeriodUncheckedCreateWithoutOpenerInput>;
};
export type PeriodUpdateWithWhereUniqueWithoutOpenerInput = {
    where: Prisma.PeriodWhereUniqueInput;
    data: Prisma.XOR<Prisma.PeriodUpdateWithoutOpenerInput, Prisma.PeriodUncheckedUpdateWithoutOpenerInput>;
};
export type PeriodUpdateManyWithWhereWithoutOpenerInput = {
    where: Prisma.PeriodScalarWhereInput;
    data: Prisma.XOR<Prisma.PeriodUpdateManyMutationInput, Prisma.PeriodUncheckedUpdateManyWithoutOpenerInput>;
};
export type PeriodScalarWhereInput = {
    AND?: Prisma.PeriodScalarWhereInput | Prisma.PeriodScalarWhereInput[];
    OR?: Prisma.PeriodScalarWhereInput[];
    NOT?: Prisma.PeriodScalarWhereInput | Prisma.PeriodScalarWhereInput[];
    id?: Prisma.StringFilter<"Period"> | string;
    objectId?: Prisma.StringFilter<"Period"> | string;
    periodNumber?: Prisma.IntFilter<"Period"> | number;
    status?: Prisma.StringFilter<"Period"> | string;
    openedBy?: Prisma.StringFilter<"Period"> | string;
    openedAt?: Prisma.DateTimeFilter<"Period"> | Date | string;
    closedAt?: Prisma.DateTimeNullableFilter<"Period"> | Date | string | null;
};
export type PeriodCreateWithoutObjectInput = {
    id?: string;
    periodNumber: number;
    status?: string;
    openedAt?: Date | string;
    closedAt?: Date | string | null;
    opener: Prisma.UserCreateNestedOneWithoutPeriodsInput;
    facts?: Prisma.PeriodFactCreateNestedManyWithoutPeriodInput;
    slaEvents?: Prisma.SlaEventCreateNestedManyWithoutPeriodInput;
    auditLogs?: Prisma.AuditLogCreateNestedManyWithoutPeriodInput;
};
export type PeriodUncheckedCreateWithoutObjectInput = {
    id?: string;
    periodNumber: number;
    status?: string;
    openedBy: string;
    openedAt?: Date | string;
    closedAt?: Date | string | null;
    facts?: Prisma.PeriodFactUncheckedCreateNestedManyWithoutPeriodInput;
    slaEvents?: Prisma.SlaEventUncheckedCreateNestedManyWithoutPeriodInput;
    auditLogs?: Prisma.AuditLogUncheckedCreateNestedManyWithoutPeriodInput;
};
export type PeriodCreateOrConnectWithoutObjectInput = {
    where: Prisma.PeriodWhereUniqueInput;
    create: Prisma.XOR<Prisma.PeriodCreateWithoutObjectInput, Prisma.PeriodUncheckedCreateWithoutObjectInput>;
};
export type PeriodCreateManyObjectInputEnvelope = {
    data: Prisma.PeriodCreateManyObjectInput | Prisma.PeriodCreateManyObjectInput[];
    skipDuplicates?: boolean;
};
export type PeriodUpsertWithWhereUniqueWithoutObjectInput = {
    where: Prisma.PeriodWhereUniqueInput;
    update: Prisma.XOR<Prisma.PeriodUpdateWithoutObjectInput, Prisma.PeriodUncheckedUpdateWithoutObjectInput>;
    create: Prisma.XOR<Prisma.PeriodCreateWithoutObjectInput, Prisma.PeriodUncheckedCreateWithoutObjectInput>;
};
export type PeriodUpdateWithWhereUniqueWithoutObjectInput = {
    where: Prisma.PeriodWhereUniqueInput;
    data: Prisma.XOR<Prisma.PeriodUpdateWithoutObjectInput, Prisma.PeriodUncheckedUpdateWithoutObjectInput>;
};
export type PeriodUpdateManyWithWhereWithoutObjectInput = {
    where: Prisma.PeriodScalarWhereInput;
    data: Prisma.XOR<Prisma.PeriodUpdateManyMutationInput, Prisma.PeriodUncheckedUpdateManyWithoutObjectInput>;
};
export type PeriodCreateWithoutFactsInput = {
    id?: string;
    periodNumber: number;
    status?: string;
    openedAt?: Date | string;
    closedAt?: Date | string | null;
    object: Prisma.ObjectCreateNestedOneWithoutPeriodsInput;
    opener: Prisma.UserCreateNestedOneWithoutPeriodsInput;
    slaEvents?: Prisma.SlaEventCreateNestedManyWithoutPeriodInput;
    auditLogs?: Prisma.AuditLogCreateNestedManyWithoutPeriodInput;
};
export type PeriodUncheckedCreateWithoutFactsInput = {
    id?: string;
    objectId: string;
    periodNumber: number;
    status?: string;
    openedBy: string;
    openedAt?: Date | string;
    closedAt?: Date | string | null;
    slaEvents?: Prisma.SlaEventUncheckedCreateNestedManyWithoutPeriodInput;
    auditLogs?: Prisma.AuditLogUncheckedCreateNestedManyWithoutPeriodInput;
};
export type PeriodCreateOrConnectWithoutFactsInput = {
    where: Prisma.PeriodWhereUniqueInput;
    create: Prisma.XOR<Prisma.PeriodCreateWithoutFactsInput, Prisma.PeriodUncheckedCreateWithoutFactsInput>;
};
export type PeriodUpsertWithoutFactsInput = {
    update: Prisma.XOR<Prisma.PeriodUpdateWithoutFactsInput, Prisma.PeriodUncheckedUpdateWithoutFactsInput>;
    create: Prisma.XOR<Prisma.PeriodCreateWithoutFactsInput, Prisma.PeriodUncheckedCreateWithoutFactsInput>;
    where?: Prisma.PeriodWhereInput;
};
export type PeriodUpdateToOneWithWhereWithoutFactsInput = {
    where?: Prisma.PeriodWhereInput;
    data: Prisma.XOR<Prisma.PeriodUpdateWithoutFactsInput, Prisma.PeriodUncheckedUpdateWithoutFactsInput>;
};
export type PeriodUpdateWithoutFactsInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    periodNumber?: Prisma.IntFieldUpdateOperationsInput | number;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    openedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    closedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    object?: Prisma.ObjectUpdateOneRequiredWithoutPeriodsNestedInput;
    opener?: Prisma.UserUpdateOneRequiredWithoutPeriodsNestedInput;
    slaEvents?: Prisma.SlaEventUpdateManyWithoutPeriodNestedInput;
    auditLogs?: Prisma.AuditLogUpdateManyWithoutPeriodNestedInput;
};
export type PeriodUncheckedUpdateWithoutFactsInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    objectId?: Prisma.StringFieldUpdateOperationsInput | string;
    periodNumber?: Prisma.IntFieldUpdateOperationsInput | number;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    openedBy?: Prisma.StringFieldUpdateOperationsInput | string;
    openedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    closedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    slaEvents?: Prisma.SlaEventUncheckedUpdateManyWithoutPeriodNestedInput;
    auditLogs?: Prisma.AuditLogUncheckedUpdateManyWithoutPeriodNestedInput;
};
export type PeriodCreateWithoutSlaEventsInput = {
    id?: string;
    periodNumber: number;
    status?: string;
    openedAt?: Date | string;
    closedAt?: Date | string | null;
    object: Prisma.ObjectCreateNestedOneWithoutPeriodsInput;
    opener: Prisma.UserCreateNestedOneWithoutPeriodsInput;
    facts?: Prisma.PeriodFactCreateNestedManyWithoutPeriodInput;
    auditLogs?: Prisma.AuditLogCreateNestedManyWithoutPeriodInput;
};
export type PeriodUncheckedCreateWithoutSlaEventsInput = {
    id?: string;
    objectId: string;
    periodNumber: number;
    status?: string;
    openedBy: string;
    openedAt?: Date | string;
    closedAt?: Date | string | null;
    facts?: Prisma.PeriodFactUncheckedCreateNestedManyWithoutPeriodInput;
    auditLogs?: Prisma.AuditLogUncheckedCreateNestedManyWithoutPeriodInput;
};
export type PeriodCreateOrConnectWithoutSlaEventsInput = {
    where: Prisma.PeriodWhereUniqueInput;
    create: Prisma.XOR<Prisma.PeriodCreateWithoutSlaEventsInput, Prisma.PeriodUncheckedCreateWithoutSlaEventsInput>;
};
export type PeriodUpsertWithoutSlaEventsInput = {
    update: Prisma.XOR<Prisma.PeriodUpdateWithoutSlaEventsInput, Prisma.PeriodUncheckedUpdateWithoutSlaEventsInput>;
    create: Prisma.XOR<Prisma.PeriodCreateWithoutSlaEventsInput, Prisma.PeriodUncheckedCreateWithoutSlaEventsInput>;
    where?: Prisma.PeriodWhereInput;
};
export type PeriodUpdateToOneWithWhereWithoutSlaEventsInput = {
    where?: Prisma.PeriodWhereInput;
    data: Prisma.XOR<Prisma.PeriodUpdateWithoutSlaEventsInput, Prisma.PeriodUncheckedUpdateWithoutSlaEventsInput>;
};
export type PeriodUpdateWithoutSlaEventsInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    periodNumber?: Prisma.IntFieldUpdateOperationsInput | number;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    openedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    closedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    object?: Prisma.ObjectUpdateOneRequiredWithoutPeriodsNestedInput;
    opener?: Prisma.UserUpdateOneRequiredWithoutPeriodsNestedInput;
    facts?: Prisma.PeriodFactUpdateManyWithoutPeriodNestedInput;
    auditLogs?: Prisma.AuditLogUpdateManyWithoutPeriodNestedInput;
};
export type PeriodUncheckedUpdateWithoutSlaEventsInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    objectId?: Prisma.StringFieldUpdateOperationsInput | string;
    periodNumber?: Prisma.IntFieldUpdateOperationsInput | number;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    openedBy?: Prisma.StringFieldUpdateOperationsInput | string;
    openedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    closedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    facts?: Prisma.PeriodFactUncheckedUpdateManyWithoutPeriodNestedInput;
    auditLogs?: Prisma.AuditLogUncheckedUpdateManyWithoutPeriodNestedInput;
};
export type PeriodCreateWithoutAuditLogsInput = {
    id?: string;
    periodNumber: number;
    status?: string;
    openedAt?: Date | string;
    closedAt?: Date | string | null;
    object: Prisma.ObjectCreateNestedOneWithoutPeriodsInput;
    opener: Prisma.UserCreateNestedOneWithoutPeriodsInput;
    facts?: Prisma.PeriodFactCreateNestedManyWithoutPeriodInput;
    slaEvents?: Prisma.SlaEventCreateNestedManyWithoutPeriodInput;
};
export type PeriodUncheckedCreateWithoutAuditLogsInput = {
    id?: string;
    objectId: string;
    periodNumber: number;
    status?: string;
    openedBy: string;
    openedAt?: Date | string;
    closedAt?: Date | string | null;
    facts?: Prisma.PeriodFactUncheckedCreateNestedManyWithoutPeriodInput;
    slaEvents?: Prisma.SlaEventUncheckedCreateNestedManyWithoutPeriodInput;
};
export type PeriodCreateOrConnectWithoutAuditLogsInput = {
    where: Prisma.PeriodWhereUniqueInput;
    create: Prisma.XOR<Prisma.PeriodCreateWithoutAuditLogsInput, Prisma.PeriodUncheckedCreateWithoutAuditLogsInput>;
};
export type PeriodUpsertWithoutAuditLogsInput = {
    update: Prisma.XOR<Prisma.PeriodUpdateWithoutAuditLogsInput, Prisma.PeriodUncheckedUpdateWithoutAuditLogsInput>;
    create: Prisma.XOR<Prisma.PeriodCreateWithoutAuditLogsInput, Prisma.PeriodUncheckedCreateWithoutAuditLogsInput>;
    where?: Prisma.PeriodWhereInput;
};
export type PeriodUpdateToOneWithWhereWithoutAuditLogsInput = {
    where?: Prisma.PeriodWhereInput;
    data: Prisma.XOR<Prisma.PeriodUpdateWithoutAuditLogsInput, Prisma.PeriodUncheckedUpdateWithoutAuditLogsInput>;
};
export type PeriodUpdateWithoutAuditLogsInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    periodNumber?: Prisma.IntFieldUpdateOperationsInput | number;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    openedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    closedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    object?: Prisma.ObjectUpdateOneRequiredWithoutPeriodsNestedInput;
    opener?: Prisma.UserUpdateOneRequiredWithoutPeriodsNestedInput;
    facts?: Prisma.PeriodFactUpdateManyWithoutPeriodNestedInput;
    slaEvents?: Prisma.SlaEventUpdateManyWithoutPeriodNestedInput;
};
export type PeriodUncheckedUpdateWithoutAuditLogsInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    objectId?: Prisma.StringFieldUpdateOperationsInput | string;
    periodNumber?: Prisma.IntFieldUpdateOperationsInput | number;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    openedBy?: Prisma.StringFieldUpdateOperationsInput | string;
    openedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    closedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    facts?: Prisma.PeriodFactUncheckedUpdateManyWithoutPeriodNestedInput;
    slaEvents?: Prisma.SlaEventUncheckedUpdateManyWithoutPeriodNestedInput;
};
export type PeriodCreateManyOpenerInput = {
    id?: string;
    objectId: string;
    periodNumber: number;
    status?: string;
    openedAt?: Date | string;
    closedAt?: Date | string | null;
};
export type PeriodUpdateWithoutOpenerInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    periodNumber?: Prisma.IntFieldUpdateOperationsInput | number;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    openedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    closedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    object?: Prisma.ObjectUpdateOneRequiredWithoutPeriodsNestedInput;
    facts?: Prisma.PeriodFactUpdateManyWithoutPeriodNestedInput;
    slaEvents?: Prisma.SlaEventUpdateManyWithoutPeriodNestedInput;
    auditLogs?: Prisma.AuditLogUpdateManyWithoutPeriodNestedInput;
};
export type PeriodUncheckedUpdateWithoutOpenerInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    objectId?: Prisma.StringFieldUpdateOperationsInput | string;
    periodNumber?: Prisma.IntFieldUpdateOperationsInput | number;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    openedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    closedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    facts?: Prisma.PeriodFactUncheckedUpdateManyWithoutPeriodNestedInput;
    slaEvents?: Prisma.SlaEventUncheckedUpdateManyWithoutPeriodNestedInput;
    auditLogs?: Prisma.AuditLogUncheckedUpdateManyWithoutPeriodNestedInput;
};
export type PeriodUncheckedUpdateManyWithoutOpenerInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    objectId?: Prisma.StringFieldUpdateOperationsInput | string;
    periodNumber?: Prisma.IntFieldUpdateOperationsInput | number;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    openedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    closedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
};
export type PeriodCreateManyObjectInput = {
    id?: string;
    periodNumber: number;
    status?: string;
    openedBy: string;
    openedAt?: Date | string;
    closedAt?: Date | string | null;
};
export type PeriodUpdateWithoutObjectInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    periodNumber?: Prisma.IntFieldUpdateOperationsInput | number;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    openedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    closedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    opener?: Prisma.UserUpdateOneRequiredWithoutPeriodsNestedInput;
    facts?: Prisma.PeriodFactUpdateManyWithoutPeriodNestedInput;
    slaEvents?: Prisma.SlaEventUpdateManyWithoutPeriodNestedInput;
    auditLogs?: Prisma.AuditLogUpdateManyWithoutPeriodNestedInput;
};
export type PeriodUncheckedUpdateWithoutObjectInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    periodNumber?: Prisma.IntFieldUpdateOperationsInput | number;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    openedBy?: Prisma.StringFieldUpdateOperationsInput | string;
    openedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    closedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    facts?: Prisma.PeriodFactUncheckedUpdateManyWithoutPeriodNestedInput;
    slaEvents?: Prisma.SlaEventUncheckedUpdateManyWithoutPeriodNestedInput;
    auditLogs?: Prisma.AuditLogUncheckedUpdateManyWithoutPeriodNestedInput;
};
export type PeriodUncheckedUpdateManyWithoutObjectInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    periodNumber?: Prisma.IntFieldUpdateOperationsInput | number;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    openedBy?: Prisma.StringFieldUpdateOperationsInput | string;
    openedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    closedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
};
export type PeriodCountOutputType = {
    facts: number;
    slaEvents: number;
    auditLogs: number;
};
export type PeriodCountOutputTypeSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    facts?: boolean | PeriodCountOutputTypeCountFactsArgs;
    slaEvents?: boolean | PeriodCountOutputTypeCountSlaEventsArgs;
    auditLogs?: boolean | PeriodCountOutputTypeCountAuditLogsArgs;
};
export type PeriodCountOutputTypeDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.PeriodCountOutputTypeSelect<ExtArgs> | null;
};
export type PeriodCountOutputTypeCountFactsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.PeriodFactWhereInput;
};
export type PeriodCountOutputTypeCountSlaEventsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.SlaEventWhereInput;
};
export type PeriodCountOutputTypeCountAuditLogsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.AuditLogWhereInput;
};
export type PeriodSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    objectId?: boolean;
    periodNumber?: boolean;
    status?: boolean;
    openedBy?: boolean;
    openedAt?: boolean;
    closedAt?: boolean;
    object?: boolean | Prisma.ObjectDefaultArgs<ExtArgs>;
    opener?: boolean | Prisma.UserDefaultArgs<ExtArgs>;
    facts?: boolean | Prisma.Period$factsArgs<ExtArgs>;
    slaEvents?: boolean | Prisma.Period$slaEventsArgs<ExtArgs>;
    auditLogs?: boolean | Prisma.Period$auditLogsArgs<ExtArgs>;
    _count?: boolean | Prisma.PeriodCountOutputTypeDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["period"]>;
export type PeriodSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    objectId?: boolean;
    periodNumber?: boolean;
    status?: boolean;
    openedBy?: boolean;
    openedAt?: boolean;
    closedAt?: boolean;
    object?: boolean | Prisma.ObjectDefaultArgs<ExtArgs>;
    opener?: boolean | Prisma.UserDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["period"]>;
export type PeriodSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    objectId?: boolean;
    periodNumber?: boolean;
    status?: boolean;
    openedBy?: boolean;
    openedAt?: boolean;
    closedAt?: boolean;
    object?: boolean | Prisma.ObjectDefaultArgs<ExtArgs>;
    opener?: boolean | Prisma.UserDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["period"]>;
export type PeriodSelectScalar = {
    id?: boolean;
    objectId?: boolean;
    periodNumber?: boolean;
    status?: boolean;
    openedBy?: boolean;
    openedAt?: boolean;
    closedAt?: boolean;
};
export type PeriodOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "objectId" | "periodNumber" | "status" | "openedBy" | "openedAt" | "closedAt", ExtArgs["result"]["period"]>;
export type PeriodInclude<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    object?: boolean | Prisma.ObjectDefaultArgs<ExtArgs>;
    opener?: boolean | Prisma.UserDefaultArgs<ExtArgs>;
    facts?: boolean | Prisma.Period$factsArgs<ExtArgs>;
    slaEvents?: boolean | Prisma.Period$slaEventsArgs<ExtArgs>;
    auditLogs?: boolean | Prisma.Period$auditLogsArgs<ExtArgs>;
    _count?: boolean | Prisma.PeriodCountOutputTypeDefaultArgs<ExtArgs>;
};
export type PeriodIncludeCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    object?: boolean | Prisma.ObjectDefaultArgs<ExtArgs>;
    opener?: boolean | Prisma.UserDefaultArgs<ExtArgs>;
};
export type PeriodIncludeUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    object?: boolean | Prisma.ObjectDefaultArgs<ExtArgs>;
    opener?: boolean | Prisma.UserDefaultArgs<ExtArgs>;
};
export type $PeriodPayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "Period";
    objects: {
        object: Prisma.$ObjectPayload<ExtArgs>;
        opener: Prisma.$UserPayload<ExtArgs>;
        facts: Prisma.$PeriodFactPayload<ExtArgs>[];
        slaEvents: Prisma.$SlaEventPayload<ExtArgs>[];
        auditLogs: Prisma.$AuditLogPayload<ExtArgs>[];
    };
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: string;
        objectId: string;
        periodNumber: number;
        status: string;
        openedBy: string;
        openedAt: Date;
        closedAt: Date | null;
    }, ExtArgs["result"]["period"]>;
    composites: {};
};
export type PeriodGetPayload<S extends boolean | null | undefined | PeriodDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$PeriodPayload, S>;
export type PeriodCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<PeriodFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: PeriodCountAggregateInputType | true;
};
export interface PeriodDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['Period'];
        meta: {
            name: 'Period';
        };
    };
    findUnique<T extends PeriodFindUniqueArgs>(args: Prisma.SelectSubset<T, PeriodFindUniqueArgs<ExtArgs>>): Prisma.Prisma__PeriodClient<runtime.Types.Result.GetResult<Prisma.$PeriodPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    findUniqueOrThrow<T extends PeriodFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, PeriodFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__PeriodClient<runtime.Types.Result.GetResult<Prisma.$PeriodPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    findFirst<T extends PeriodFindFirstArgs>(args?: Prisma.SelectSubset<T, PeriodFindFirstArgs<ExtArgs>>): Prisma.Prisma__PeriodClient<runtime.Types.Result.GetResult<Prisma.$PeriodPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    findFirstOrThrow<T extends PeriodFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, PeriodFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__PeriodClient<runtime.Types.Result.GetResult<Prisma.$PeriodPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    findMany<T extends PeriodFindManyArgs>(args?: Prisma.SelectSubset<T, PeriodFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$PeriodPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    create<T extends PeriodCreateArgs>(args: Prisma.SelectSubset<T, PeriodCreateArgs<ExtArgs>>): Prisma.Prisma__PeriodClient<runtime.Types.Result.GetResult<Prisma.$PeriodPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    createMany<T extends PeriodCreateManyArgs>(args?: Prisma.SelectSubset<T, PeriodCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    createManyAndReturn<T extends PeriodCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, PeriodCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$PeriodPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    delete<T extends PeriodDeleteArgs>(args: Prisma.SelectSubset<T, PeriodDeleteArgs<ExtArgs>>): Prisma.Prisma__PeriodClient<runtime.Types.Result.GetResult<Prisma.$PeriodPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    update<T extends PeriodUpdateArgs>(args: Prisma.SelectSubset<T, PeriodUpdateArgs<ExtArgs>>): Prisma.Prisma__PeriodClient<runtime.Types.Result.GetResult<Prisma.$PeriodPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    deleteMany<T extends PeriodDeleteManyArgs>(args?: Prisma.SelectSubset<T, PeriodDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    updateMany<T extends PeriodUpdateManyArgs>(args: Prisma.SelectSubset<T, PeriodUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    updateManyAndReturn<T extends PeriodUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, PeriodUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$PeriodPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    upsert<T extends PeriodUpsertArgs>(args: Prisma.SelectSubset<T, PeriodUpsertArgs<ExtArgs>>): Prisma.Prisma__PeriodClient<runtime.Types.Result.GetResult<Prisma.$PeriodPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    count<T extends PeriodCountArgs>(args?: Prisma.Subset<T, PeriodCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], PeriodCountAggregateOutputType> : number>;
    aggregate<T extends PeriodAggregateArgs>(args: Prisma.Subset<T, PeriodAggregateArgs>): Prisma.PrismaPromise<GetPeriodAggregateType<T>>;
    groupBy<T extends PeriodGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: PeriodGroupByArgs['orderBy'];
    } : {
        orderBy?: PeriodGroupByArgs['orderBy'];
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
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, PeriodGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetPeriodGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    readonly fields: PeriodFieldRefs;
}
export interface Prisma__PeriodClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    object<T extends Prisma.ObjectDefaultArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.ObjectDefaultArgs<ExtArgs>>): Prisma.Prisma__ObjectClient<runtime.Types.Result.GetResult<Prisma.$ObjectPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>;
    opener<T extends Prisma.UserDefaultArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.UserDefaultArgs<ExtArgs>>): Prisma.Prisma__UserClient<runtime.Types.Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>;
    facts<T extends Prisma.Period$factsArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.Period$factsArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$PeriodFactPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
    slaEvents<T extends Prisma.Period$slaEventsArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.Period$slaEventsArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$SlaEventPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
    auditLogs<T extends Prisma.Period$auditLogsArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.Period$auditLogsArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$AuditLogPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): runtime.Types.Utils.JsPromise<TResult1 | TResult2>;
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): runtime.Types.Utils.JsPromise<T | TResult>;
    finally(onfinally?: (() => void) | undefined | null): runtime.Types.Utils.JsPromise<T>;
}
export interface PeriodFieldRefs {
    readonly id: Prisma.FieldRef<"Period", 'String'>;
    readonly objectId: Prisma.FieldRef<"Period", 'String'>;
    readonly periodNumber: Prisma.FieldRef<"Period", 'Int'>;
    readonly status: Prisma.FieldRef<"Period", 'String'>;
    readonly openedBy: Prisma.FieldRef<"Period", 'String'>;
    readonly openedAt: Prisma.FieldRef<"Period", 'DateTime'>;
    readonly closedAt: Prisma.FieldRef<"Period", 'DateTime'>;
}
export type PeriodFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.PeriodSelect<ExtArgs> | null;
    omit?: Prisma.PeriodOmit<ExtArgs> | null;
    include?: Prisma.PeriodInclude<ExtArgs> | null;
    where: Prisma.PeriodWhereUniqueInput;
};
export type PeriodFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.PeriodSelect<ExtArgs> | null;
    omit?: Prisma.PeriodOmit<ExtArgs> | null;
    include?: Prisma.PeriodInclude<ExtArgs> | null;
    where: Prisma.PeriodWhereUniqueInput;
};
export type PeriodFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.PeriodSelect<ExtArgs> | null;
    omit?: Prisma.PeriodOmit<ExtArgs> | null;
    include?: Prisma.PeriodInclude<ExtArgs> | null;
    where?: Prisma.PeriodWhereInput;
    orderBy?: Prisma.PeriodOrderByWithRelationInput | Prisma.PeriodOrderByWithRelationInput[];
    cursor?: Prisma.PeriodWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.PeriodScalarFieldEnum | Prisma.PeriodScalarFieldEnum[];
};
export type PeriodFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.PeriodSelect<ExtArgs> | null;
    omit?: Prisma.PeriodOmit<ExtArgs> | null;
    include?: Prisma.PeriodInclude<ExtArgs> | null;
    where?: Prisma.PeriodWhereInput;
    orderBy?: Prisma.PeriodOrderByWithRelationInput | Prisma.PeriodOrderByWithRelationInput[];
    cursor?: Prisma.PeriodWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.PeriodScalarFieldEnum | Prisma.PeriodScalarFieldEnum[];
};
export type PeriodFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.PeriodSelect<ExtArgs> | null;
    omit?: Prisma.PeriodOmit<ExtArgs> | null;
    include?: Prisma.PeriodInclude<ExtArgs> | null;
    where?: Prisma.PeriodWhereInput;
    orderBy?: Prisma.PeriodOrderByWithRelationInput | Prisma.PeriodOrderByWithRelationInput[];
    cursor?: Prisma.PeriodWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.PeriodScalarFieldEnum | Prisma.PeriodScalarFieldEnum[];
};
export type PeriodCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.PeriodSelect<ExtArgs> | null;
    omit?: Prisma.PeriodOmit<ExtArgs> | null;
    include?: Prisma.PeriodInclude<ExtArgs> | null;
    data: Prisma.XOR<Prisma.PeriodCreateInput, Prisma.PeriodUncheckedCreateInput>;
};
export type PeriodCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    data: Prisma.PeriodCreateManyInput | Prisma.PeriodCreateManyInput[];
    skipDuplicates?: boolean;
};
export type PeriodCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.PeriodSelectCreateManyAndReturn<ExtArgs> | null;
    omit?: Prisma.PeriodOmit<ExtArgs> | null;
    data: Prisma.PeriodCreateManyInput | Prisma.PeriodCreateManyInput[];
    skipDuplicates?: boolean;
    include?: Prisma.PeriodIncludeCreateManyAndReturn<ExtArgs> | null;
};
export type PeriodUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.PeriodSelect<ExtArgs> | null;
    omit?: Prisma.PeriodOmit<ExtArgs> | null;
    include?: Prisma.PeriodInclude<ExtArgs> | null;
    data: Prisma.XOR<Prisma.PeriodUpdateInput, Prisma.PeriodUncheckedUpdateInput>;
    where: Prisma.PeriodWhereUniqueInput;
};
export type PeriodUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    data: Prisma.XOR<Prisma.PeriodUpdateManyMutationInput, Prisma.PeriodUncheckedUpdateManyInput>;
    where?: Prisma.PeriodWhereInput;
    limit?: number;
};
export type PeriodUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.PeriodSelectUpdateManyAndReturn<ExtArgs> | null;
    omit?: Prisma.PeriodOmit<ExtArgs> | null;
    data: Prisma.XOR<Prisma.PeriodUpdateManyMutationInput, Prisma.PeriodUncheckedUpdateManyInput>;
    where?: Prisma.PeriodWhereInput;
    limit?: number;
    include?: Prisma.PeriodIncludeUpdateManyAndReturn<ExtArgs> | null;
};
export type PeriodUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.PeriodSelect<ExtArgs> | null;
    omit?: Prisma.PeriodOmit<ExtArgs> | null;
    include?: Prisma.PeriodInclude<ExtArgs> | null;
    where: Prisma.PeriodWhereUniqueInput;
    create: Prisma.XOR<Prisma.PeriodCreateInput, Prisma.PeriodUncheckedCreateInput>;
    update: Prisma.XOR<Prisma.PeriodUpdateInput, Prisma.PeriodUncheckedUpdateInput>;
};
export type PeriodDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.PeriodSelect<ExtArgs> | null;
    omit?: Prisma.PeriodOmit<ExtArgs> | null;
    include?: Prisma.PeriodInclude<ExtArgs> | null;
    where: Prisma.PeriodWhereUniqueInput;
};
export type PeriodDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.PeriodWhereInput;
    limit?: number;
};
export type Period$factsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.PeriodFactSelect<ExtArgs> | null;
    omit?: Prisma.PeriodFactOmit<ExtArgs> | null;
    include?: Prisma.PeriodFactInclude<ExtArgs> | null;
    where?: Prisma.PeriodFactWhereInput;
    orderBy?: Prisma.PeriodFactOrderByWithRelationInput | Prisma.PeriodFactOrderByWithRelationInput[];
    cursor?: Prisma.PeriodFactWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.PeriodFactScalarFieldEnum | Prisma.PeriodFactScalarFieldEnum[];
};
export type Period$slaEventsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
export type Period$auditLogsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.AuditLogSelect<ExtArgs> | null;
    omit?: Prisma.AuditLogOmit<ExtArgs> | null;
    include?: Prisma.AuditLogInclude<ExtArgs> | null;
    where?: Prisma.AuditLogWhereInput;
    orderBy?: Prisma.AuditLogOrderByWithRelationInput | Prisma.AuditLogOrderByWithRelationInput[];
    cursor?: Prisma.AuditLogWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.AuditLogScalarFieldEnum | Prisma.AuditLogScalarFieldEnum[];
};
export type PeriodDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.PeriodSelect<ExtArgs> | null;
    omit?: Prisma.PeriodOmit<ExtArgs> | null;
    include?: Prisma.PeriodInclude<ExtArgs> | null;
};
