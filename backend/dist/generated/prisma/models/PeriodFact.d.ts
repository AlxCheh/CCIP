import type * as runtime from "@prisma/client/runtime/client";
import type * as Prisma from "../internal/prismaNamespace.js";
export type PeriodFactModel = runtime.Types.Result.DefaultSelection<Prisma.$PeriodFactPayload>;
export type AggregatePeriodFact = {
    _count: PeriodFactCountAggregateOutputType | null;
    _avg: PeriodFactAvgAggregateOutputType | null;
    _sum: PeriodFactSumAggregateOutputType | null;
    _min: PeriodFactMinAggregateOutputType | null;
    _max: PeriodFactMaxAggregateOutputType | null;
};
export type PeriodFactAvgAggregateOutputType = {
    scVolume: number | null;
    gpVolume: number | null;
};
export type PeriodFactSumAggregateOutputType = {
    scVolume: number | null;
    gpVolume: number | null;
};
export type PeriodFactMinAggregateOutputType = {
    id: string | null;
    periodId: string | null;
    workLineageId: string | null;
    scVolume: number | null;
    gpVolume: number | null;
    updatedAt: Date | null;
    updatedBy: string | null;
};
export type PeriodFactMaxAggregateOutputType = {
    id: string | null;
    periodId: string | null;
    workLineageId: string | null;
    scVolume: number | null;
    gpVolume: number | null;
    updatedAt: Date | null;
    updatedBy: string | null;
};
export type PeriodFactCountAggregateOutputType = {
    id: number;
    periodId: number;
    workLineageId: number;
    scVolume: number;
    gpVolume: number;
    updatedAt: number;
    updatedBy: number;
    _all: number;
};
export type PeriodFactAvgAggregateInputType = {
    scVolume?: true;
    gpVolume?: true;
};
export type PeriodFactSumAggregateInputType = {
    scVolume?: true;
    gpVolume?: true;
};
export type PeriodFactMinAggregateInputType = {
    id?: true;
    periodId?: true;
    workLineageId?: true;
    scVolume?: true;
    gpVolume?: true;
    updatedAt?: true;
    updatedBy?: true;
};
export type PeriodFactMaxAggregateInputType = {
    id?: true;
    periodId?: true;
    workLineageId?: true;
    scVolume?: true;
    gpVolume?: true;
    updatedAt?: true;
    updatedBy?: true;
};
export type PeriodFactCountAggregateInputType = {
    id?: true;
    periodId?: true;
    workLineageId?: true;
    scVolume?: true;
    gpVolume?: true;
    updatedAt?: true;
    updatedBy?: true;
    _all?: true;
};
export type PeriodFactAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.PeriodFactWhereInput;
    orderBy?: Prisma.PeriodFactOrderByWithRelationInput | Prisma.PeriodFactOrderByWithRelationInput[];
    cursor?: Prisma.PeriodFactWhereUniqueInput;
    take?: number;
    skip?: number;
    _count?: true | PeriodFactCountAggregateInputType;
    _avg?: PeriodFactAvgAggregateInputType;
    _sum?: PeriodFactSumAggregateInputType;
    _min?: PeriodFactMinAggregateInputType;
    _max?: PeriodFactMaxAggregateInputType;
};
export type GetPeriodFactAggregateType<T extends PeriodFactAggregateArgs> = {
    [P in keyof T & keyof AggregatePeriodFact]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregatePeriodFact[P]> : Prisma.GetScalarType<T[P], AggregatePeriodFact[P]>;
};
export type PeriodFactGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.PeriodFactWhereInput;
    orderBy?: Prisma.PeriodFactOrderByWithAggregationInput | Prisma.PeriodFactOrderByWithAggregationInput[];
    by: Prisma.PeriodFactScalarFieldEnum[] | Prisma.PeriodFactScalarFieldEnum;
    having?: Prisma.PeriodFactScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: PeriodFactCountAggregateInputType | true;
    _avg?: PeriodFactAvgAggregateInputType;
    _sum?: PeriodFactSumAggregateInputType;
    _min?: PeriodFactMinAggregateInputType;
    _max?: PeriodFactMaxAggregateInputType;
};
export type PeriodFactGroupByOutputType = {
    id: string;
    periodId: string;
    workLineageId: string;
    scVolume: number | null;
    gpVolume: number | null;
    updatedAt: Date;
    updatedBy: string | null;
    _count: PeriodFactCountAggregateOutputType | null;
    _avg: PeriodFactAvgAggregateOutputType | null;
    _sum: PeriodFactSumAggregateOutputType | null;
    _min: PeriodFactMinAggregateOutputType | null;
    _max: PeriodFactMaxAggregateOutputType | null;
};
export type GetPeriodFactGroupByPayload<T extends PeriodFactGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<PeriodFactGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof PeriodFactGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], PeriodFactGroupByOutputType[P]> : Prisma.GetScalarType<T[P], PeriodFactGroupByOutputType[P]>;
}>>;
export type PeriodFactWhereInput = {
    AND?: Prisma.PeriodFactWhereInput | Prisma.PeriodFactWhereInput[];
    OR?: Prisma.PeriodFactWhereInput[];
    NOT?: Prisma.PeriodFactWhereInput | Prisma.PeriodFactWhereInput[];
    id?: Prisma.StringFilter<"PeriodFact"> | string;
    periodId?: Prisma.StringFilter<"PeriodFact"> | string;
    workLineageId?: Prisma.StringFilter<"PeriodFact"> | string;
    scVolume?: Prisma.FloatNullableFilter<"PeriodFact"> | number | null;
    gpVolume?: Prisma.FloatNullableFilter<"PeriodFact"> | number | null;
    updatedAt?: Prisma.DateTimeFilter<"PeriodFact"> | Date | string;
    updatedBy?: Prisma.StringNullableFilter<"PeriodFact"> | string | null;
    period?: Prisma.XOR<Prisma.PeriodScalarRelationFilter, Prisma.PeriodWhereInput>;
};
export type PeriodFactOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    periodId?: Prisma.SortOrder;
    workLineageId?: Prisma.SortOrder;
    scVolume?: Prisma.SortOrderInput | Prisma.SortOrder;
    gpVolume?: Prisma.SortOrderInput | Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    updatedBy?: Prisma.SortOrderInput | Prisma.SortOrder;
    period?: Prisma.PeriodOrderByWithRelationInput;
};
export type PeriodFactWhereUniqueInput = Prisma.AtLeast<{
    id?: string;
    periodId_workLineageId?: Prisma.PeriodFactPeriodIdWorkLineageIdCompoundUniqueInput;
    AND?: Prisma.PeriodFactWhereInput | Prisma.PeriodFactWhereInput[];
    OR?: Prisma.PeriodFactWhereInput[];
    NOT?: Prisma.PeriodFactWhereInput | Prisma.PeriodFactWhereInput[];
    periodId?: Prisma.StringFilter<"PeriodFact"> | string;
    workLineageId?: Prisma.StringFilter<"PeriodFact"> | string;
    scVolume?: Prisma.FloatNullableFilter<"PeriodFact"> | number | null;
    gpVolume?: Prisma.FloatNullableFilter<"PeriodFact"> | number | null;
    updatedAt?: Prisma.DateTimeFilter<"PeriodFact"> | Date | string;
    updatedBy?: Prisma.StringNullableFilter<"PeriodFact"> | string | null;
    period?: Prisma.XOR<Prisma.PeriodScalarRelationFilter, Prisma.PeriodWhereInput>;
}, "id" | "periodId_workLineageId">;
export type PeriodFactOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    periodId?: Prisma.SortOrder;
    workLineageId?: Prisma.SortOrder;
    scVolume?: Prisma.SortOrderInput | Prisma.SortOrder;
    gpVolume?: Prisma.SortOrderInput | Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    updatedBy?: Prisma.SortOrderInput | Prisma.SortOrder;
    _count?: Prisma.PeriodFactCountOrderByAggregateInput;
    _avg?: Prisma.PeriodFactAvgOrderByAggregateInput;
    _max?: Prisma.PeriodFactMaxOrderByAggregateInput;
    _min?: Prisma.PeriodFactMinOrderByAggregateInput;
    _sum?: Prisma.PeriodFactSumOrderByAggregateInput;
};
export type PeriodFactScalarWhereWithAggregatesInput = {
    AND?: Prisma.PeriodFactScalarWhereWithAggregatesInput | Prisma.PeriodFactScalarWhereWithAggregatesInput[];
    OR?: Prisma.PeriodFactScalarWhereWithAggregatesInput[];
    NOT?: Prisma.PeriodFactScalarWhereWithAggregatesInput | Prisma.PeriodFactScalarWhereWithAggregatesInput[];
    id?: Prisma.StringWithAggregatesFilter<"PeriodFact"> | string;
    periodId?: Prisma.StringWithAggregatesFilter<"PeriodFact"> | string;
    workLineageId?: Prisma.StringWithAggregatesFilter<"PeriodFact"> | string;
    scVolume?: Prisma.FloatNullableWithAggregatesFilter<"PeriodFact"> | number | null;
    gpVolume?: Prisma.FloatNullableWithAggregatesFilter<"PeriodFact"> | number | null;
    updatedAt?: Prisma.DateTimeWithAggregatesFilter<"PeriodFact"> | Date | string;
    updatedBy?: Prisma.StringNullableWithAggregatesFilter<"PeriodFact"> | string | null;
};
export type PeriodFactCreateInput = {
    id?: string;
    workLineageId: string;
    scVolume?: number | null;
    gpVolume?: number | null;
    updatedAt?: Date | string;
    updatedBy?: string | null;
    period: Prisma.PeriodCreateNestedOneWithoutFactsInput;
};
export type PeriodFactUncheckedCreateInput = {
    id?: string;
    periodId: string;
    workLineageId: string;
    scVolume?: number | null;
    gpVolume?: number | null;
    updatedAt?: Date | string;
    updatedBy?: string | null;
};
export type PeriodFactUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    workLineageId?: Prisma.StringFieldUpdateOperationsInput | string;
    scVolume?: Prisma.NullableFloatFieldUpdateOperationsInput | number | null;
    gpVolume?: Prisma.NullableFloatFieldUpdateOperationsInput | number | null;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedBy?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    period?: Prisma.PeriodUpdateOneRequiredWithoutFactsNestedInput;
};
export type PeriodFactUncheckedUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    periodId?: Prisma.StringFieldUpdateOperationsInput | string;
    workLineageId?: Prisma.StringFieldUpdateOperationsInput | string;
    scVolume?: Prisma.NullableFloatFieldUpdateOperationsInput | number | null;
    gpVolume?: Prisma.NullableFloatFieldUpdateOperationsInput | number | null;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedBy?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
};
export type PeriodFactCreateManyInput = {
    id?: string;
    periodId: string;
    workLineageId: string;
    scVolume?: number | null;
    gpVolume?: number | null;
    updatedAt?: Date | string;
    updatedBy?: string | null;
};
export type PeriodFactUpdateManyMutationInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    workLineageId?: Prisma.StringFieldUpdateOperationsInput | string;
    scVolume?: Prisma.NullableFloatFieldUpdateOperationsInput | number | null;
    gpVolume?: Prisma.NullableFloatFieldUpdateOperationsInput | number | null;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedBy?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
};
export type PeriodFactUncheckedUpdateManyInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    periodId?: Prisma.StringFieldUpdateOperationsInput | string;
    workLineageId?: Prisma.StringFieldUpdateOperationsInput | string;
    scVolume?: Prisma.NullableFloatFieldUpdateOperationsInput | number | null;
    gpVolume?: Prisma.NullableFloatFieldUpdateOperationsInput | number | null;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedBy?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
};
export type PeriodFactListRelationFilter = {
    every?: Prisma.PeriodFactWhereInput;
    some?: Prisma.PeriodFactWhereInput;
    none?: Prisma.PeriodFactWhereInput;
};
export type PeriodFactOrderByRelationAggregateInput = {
    _count?: Prisma.SortOrder;
};
export type PeriodFactPeriodIdWorkLineageIdCompoundUniqueInput = {
    periodId: string;
    workLineageId: string;
};
export type PeriodFactCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    periodId?: Prisma.SortOrder;
    workLineageId?: Prisma.SortOrder;
    scVolume?: Prisma.SortOrder;
    gpVolume?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    updatedBy?: Prisma.SortOrder;
};
export type PeriodFactAvgOrderByAggregateInput = {
    scVolume?: Prisma.SortOrder;
    gpVolume?: Prisma.SortOrder;
};
export type PeriodFactMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    periodId?: Prisma.SortOrder;
    workLineageId?: Prisma.SortOrder;
    scVolume?: Prisma.SortOrder;
    gpVolume?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    updatedBy?: Prisma.SortOrder;
};
export type PeriodFactMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    periodId?: Prisma.SortOrder;
    workLineageId?: Prisma.SortOrder;
    scVolume?: Prisma.SortOrder;
    gpVolume?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    updatedBy?: Prisma.SortOrder;
};
export type PeriodFactSumOrderByAggregateInput = {
    scVolume?: Prisma.SortOrder;
    gpVolume?: Prisma.SortOrder;
};
export type PeriodFactCreateNestedManyWithoutPeriodInput = {
    create?: Prisma.XOR<Prisma.PeriodFactCreateWithoutPeriodInput, Prisma.PeriodFactUncheckedCreateWithoutPeriodInput> | Prisma.PeriodFactCreateWithoutPeriodInput[] | Prisma.PeriodFactUncheckedCreateWithoutPeriodInput[];
    connectOrCreate?: Prisma.PeriodFactCreateOrConnectWithoutPeriodInput | Prisma.PeriodFactCreateOrConnectWithoutPeriodInput[];
    createMany?: Prisma.PeriodFactCreateManyPeriodInputEnvelope;
    connect?: Prisma.PeriodFactWhereUniqueInput | Prisma.PeriodFactWhereUniqueInput[];
};
export type PeriodFactUncheckedCreateNestedManyWithoutPeriodInput = {
    create?: Prisma.XOR<Prisma.PeriodFactCreateWithoutPeriodInput, Prisma.PeriodFactUncheckedCreateWithoutPeriodInput> | Prisma.PeriodFactCreateWithoutPeriodInput[] | Prisma.PeriodFactUncheckedCreateWithoutPeriodInput[];
    connectOrCreate?: Prisma.PeriodFactCreateOrConnectWithoutPeriodInput | Prisma.PeriodFactCreateOrConnectWithoutPeriodInput[];
    createMany?: Prisma.PeriodFactCreateManyPeriodInputEnvelope;
    connect?: Prisma.PeriodFactWhereUniqueInput | Prisma.PeriodFactWhereUniqueInput[];
};
export type PeriodFactUpdateManyWithoutPeriodNestedInput = {
    create?: Prisma.XOR<Prisma.PeriodFactCreateWithoutPeriodInput, Prisma.PeriodFactUncheckedCreateWithoutPeriodInput> | Prisma.PeriodFactCreateWithoutPeriodInput[] | Prisma.PeriodFactUncheckedCreateWithoutPeriodInput[];
    connectOrCreate?: Prisma.PeriodFactCreateOrConnectWithoutPeriodInput | Prisma.PeriodFactCreateOrConnectWithoutPeriodInput[];
    upsert?: Prisma.PeriodFactUpsertWithWhereUniqueWithoutPeriodInput | Prisma.PeriodFactUpsertWithWhereUniqueWithoutPeriodInput[];
    createMany?: Prisma.PeriodFactCreateManyPeriodInputEnvelope;
    set?: Prisma.PeriodFactWhereUniqueInput | Prisma.PeriodFactWhereUniqueInput[];
    disconnect?: Prisma.PeriodFactWhereUniqueInput | Prisma.PeriodFactWhereUniqueInput[];
    delete?: Prisma.PeriodFactWhereUniqueInput | Prisma.PeriodFactWhereUniqueInput[];
    connect?: Prisma.PeriodFactWhereUniqueInput | Prisma.PeriodFactWhereUniqueInput[];
    update?: Prisma.PeriodFactUpdateWithWhereUniqueWithoutPeriodInput | Prisma.PeriodFactUpdateWithWhereUniqueWithoutPeriodInput[];
    updateMany?: Prisma.PeriodFactUpdateManyWithWhereWithoutPeriodInput | Prisma.PeriodFactUpdateManyWithWhereWithoutPeriodInput[];
    deleteMany?: Prisma.PeriodFactScalarWhereInput | Prisma.PeriodFactScalarWhereInput[];
};
export type PeriodFactUncheckedUpdateManyWithoutPeriodNestedInput = {
    create?: Prisma.XOR<Prisma.PeriodFactCreateWithoutPeriodInput, Prisma.PeriodFactUncheckedCreateWithoutPeriodInput> | Prisma.PeriodFactCreateWithoutPeriodInput[] | Prisma.PeriodFactUncheckedCreateWithoutPeriodInput[];
    connectOrCreate?: Prisma.PeriodFactCreateOrConnectWithoutPeriodInput | Prisma.PeriodFactCreateOrConnectWithoutPeriodInput[];
    upsert?: Prisma.PeriodFactUpsertWithWhereUniqueWithoutPeriodInput | Prisma.PeriodFactUpsertWithWhereUniqueWithoutPeriodInput[];
    createMany?: Prisma.PeriodFactCreateManyPeriodInputEnvelope;
    set?: Prisma.PeriodFactWhereUniqueInput | Prisma.PeriodFactWhereUniqueInput[];
    disconnect?: Prisma.PeriodFactWhereUniqueInput | Prisma.PeriodFactWhereUniqueInput[];
    delete?: Prisma.PeriodFactWhereUniqueInput | Prisma.PeriodFactWhereUniqueInput[];
    connect?: Prisma.PeriodFactWhereUniqueInput | Prisma.PeriodFactWhereUniqueInput[];
    update?: Prisma.PeriodFactUpdateWithWhereUniqueWithoutPeriodInput | Prisma.PeriodFactUpdateWithWhereUniqueWithoutPeriodInput[];
    updateMany?: Prisma.PeriodFactUpdateManyWithWhereWithoutPeriodInput | Prisma.PeriodFactUpdateManyWithWhereWithoutPeriodInput[];
    deleteMany?: Prisma.PeriodFactScalarWhereInput | Prisma.PeriodFactScalarWhereInput[];
};
export type NullableFloatFieldUpdateOperationsInput = {
    set?: number | null;
    increment?: number;
    decrement?: number;
    multiply?: number;
    divide?: number;
};
export type PeriodFactCreateWithoutPeriodInput = {
    id?: string;
    workLineageId: string;
    scVolume?: number | null;
    gpVolume?: number | null;
    updatedAt?: Date | string;
    updatedBy?: string | null;
};
export type PeriodFactUncheckedCreateWithoutPeriodInput = {
    id?: string;
    workLineageId: string;
    scVolume?: number | null;
    gpVolume?: number | null;
    updatedAt?: Date | string;
    updatedBy?: string | null;
};
export type PeriodFactCreateOrConnectWithoutPeriodInput = {
    where: Prisma.PeriodFactWhereUniqueInput;
    create: Prisma.XOR<Prisma.PeriodFactCreateWithoutPeriodInput, Prisma.PeriodFactUncheckedCreateWithoutPeriodInput>;
};
export type PeriodFactCreateManyPeriodInputEnvelope = {
    data: Prisma.PeriodFactCreateManyPeriodInput | Prisma.PeriodFactCreateManyPeriodInput[];
    skipDuplicates?: boolean;
};
export type PeriodFactUpsertWithWhereUniqueWithoutPeriodInput = {
    where: Prisma.PeriodFactWhereUniqueInput;
    update: Prisma.XOR<Prisma.PeriodFactUpdateWithoutPeriodInput, Prisma.PeriodFactUncheckedUpdateWithoutPeriodInput>;
    create: Prisma.XOR<Prisma.PeriodFactCreateWithoutPeriodInput, Prisma.PeriodFactUncheckedCreateWithoutPeriodInput>;
};
export type PeriodFactUpdateWithWhereUniqueWithoutPeriodInput = {
    where: Prisma.PeriodFactWhereUniqueInput;
    data: Prisma.XOR<Prisma.PeriodFactUpdateWithoutPeriodInput, Prisma.PeriodFactUncheckedUpdateWithoutPeriodInput>;
};
export type PeriodFactUpdateManyWithWhereWithoutPeriodInput = {
    where: Prisma.PeriodFactScalarWhereInput;
    data: Prisma.XOR<Prisma.PeriodFactUpdateManyMutationInput, Prisma.PeriodFactUncheckedUpdateManyWithoutPeriodInput>;
};
export type PeriodFactScalarWhereInput = {
    AND?: Prisma.PeriodFactScalarWhereInput | Prisma.PeriodFactScalarWhereInput[];
    OR?: Prisma.PeriodFactScalarWhereInput[];
    NOT?: Prisma.PeriodFactScalarWhereInput | Prisma.PeriodFactScalarWhereInput[];
    id?: Prisma.StringFilter<"PeriodFact"> | string;
    periodId?: Prisma.StringFilter<"PeriodFact"> | string;
    workLineageId?: Prisma.StringFilter<"PeriodFact"> | string;
    scVolume?: Prisma.FloatNullableFilter<"PeriodFact"> | number | null;
    gpVolume?: Prisma.FloatNullableFilter<"PeriodFact"> | number | null;
    updatedAt?: Prisma.DateTimeFilter<"PeriodFact"> | Date | string;
    updatedBy?: Prisma.StringNullableFilter<"PeriodFact"> | string | null;
};
export type PeriodFactCreateManyPeriodInput = {
    id?: string;
    workLineageId: string;
    scVolume?: number | null;
    gpVolume?: number | null;
    updatedAt?: Date | string;
    updatedBy?: string | null;
};
export type PeriodFactUpdateWithoutPeriodInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    workLineageId?: Prisma.StringFieldUpdateOperationsInput | string;
    scVolume?: Prisma.NullableFloatFieldUpdateOperationsInput | number | null;
    gpVolume?: Prisma.NullableFloatFieldUpdateOperationsInput | number | null;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedBy?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
};
export type PeriodFactUncheckedUpdateWithoutPeriodInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    workLineageId?: Prisma.StringFieldUpdateOperationsInput | string;
    scVolume?: Prisma.NullableFloatFieldUpdateOperationsInput | number | null;
    gpVolume?: Prisma.NullableFloatFieldUpdateOperationsInput | number | null;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedBy?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
};
export type PeriodFactUncheckedUpdateManyWithoutPeriodInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    workLineageId?: Prisma.StringFieldUpdateOperationsInput | string;
    scVolume?: Prisma.NullableFloatFieldUpdateOperationsInput | number | null;
    gpVolume?: Prisma.NullableFloatFieldUpdateOperationsInput | number | null;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedBy?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
};
export type PeriodFactSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    periodId?: boolean;
    workLineageId?: boolean;
    scVolume?: boolean;
    gpVolume?: boolean;
    updatedAt?: boolean;
    updatedBy?: boolean;
    period?: boolean | Prisma.PeriodDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["periodFact"]>;
export type PeriodFactSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    periodId?: boolean;
    workLineageId?: boolean;
    scVolume?: boolean;
    gpVolume?: boolean;
    updatedAt?: boolean;
    updatedBy?: boolean;
    period?: boolean | Prisma.PeriodDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["periodFact"]>;
export type PeriodFactSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    periodId?: boolean;
    workLineageId?: boolean;
    scVolume?: boolean;
    gpVolume?: boolean;
    updatedAt?: boolean;
    updatedBy?: boolean;
    period?: boolean | Prisma.PeriodDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["periodFact"]>;
export type PeriodFactSelectScalar = {
    id?: boolean;
    periodId?: boolean;
    workLineageId?: boolean;
    scVolume?: boolean;
    gpVolume?: boolean;
    updatedAt?: boolean;
    updatedBy?: boolean;
};
export type PeriodFactOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "periodId" | "workLineageId" | "scVolume" | "gpVolume" | "updatedAt" | "updatedBy", ExtArgs["result"]["periodFact"]>;
export type PeriodFactInclude<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    period?: boolean | Prisma.PeriodDefaultArgs<ExtArgs>;
};
export type PeriodFactIncludeCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    period?: boolean | Prisma.PeriodDefaultArgs<ExtArgs>;
};
export type PeriodFactIncludeUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    period?: boolean | Prisma.PeriodDefaultArgs<ExtArgs>;
};
export type $PeriodFactPayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "PeriodFact";
    objects: {
        period: Prisma.$PeriodPayload<ExtArgs>;
    };
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: string;
        periodId: string;
        workLineageId: string;
        scVolume: number | null;
        gpVolume: number | null;
        updatedAt: Date;
        updatedBy: string | null;
    }, ExtArgs["result"]["periodFact"]>;
    composites: {};
};
export type PeriodFactGetPayload<S extends boolean | null | undefined | PeriodFactDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$PeriodFactPayload, S>;
export type PeriodFactCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<PeriodFactFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: PeriodFactCountAggregateInputType | true;
};
export interface PeriodFactDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['PeriodFact'];
        meta: {
            name: 'PeriodFact';
        };
    };
    findUnique<T extends PeriodFactFindUniqueArgs>(args: Prisma.SelectSubset<T, PeriodFactFindUniqueArgs<ExtArgs>>): Prisma.Prisma__PeriodFactClient<runtime.Types.Result.GetResult<Prisma.$PeriodFactPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    findUniqueOrThrow<T extends PeriodFactFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, PeriodFactFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__PeriodFactClient<runtime.Types.Result.GetResult<Prisma.$PeriodFactPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    findFirst<T extends PeriodFactFindFirstArgs>(args?: Prisma.SelectSubset<T, PeriodFactFindFirstArgs<ExtArgs>>): Prisma.Prisma__PeriodFactClient<runtime.Types.Result.GetResult<Prisma.$PeriodFactPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    findFirstOrThrow<T extends PeriodFactFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, PeriodFactFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__PeriodFactClient<runtime.Types.Result.GetResult<Prisma.$PeriodFactPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    findMany<T extends PeriodFactFindManyArgs>(args?: Prisma.SelectSubset<T, PeriodFactFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$PeriodFactPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    create<T extends PeriodFactCreateArgs>(args: Prisma.SelectSubset<T, PeriodFactCreateArgs<ExtArgs>>): Prisma.Prisma__PeriodFactClient<runtime.Types.Result.GetResult<Prisma.$PeriodFactPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    createMany<T extends PeriodFactCreateManyArgs>(args?: Prisma.SelectSubset<T, PeriodFactCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    createManyAndReturn<T extends PeriodFactCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, PeriodFactCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$PeriodFactPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    delete<T extends PeriodFactDeleteArgs>(args: Prisma.SelectSubset<T, PeriodFactDeleteArgs<ExtArgs>>): Prisma.Prisma__PeriodFactClient<runtime.Types.Result.GetResult<Prisma.$PeriodFactPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    update<T extends PeriodFactUpdateArgs>(args: Prisma.SelectSubset<T, PeriodFactUpdateArgs<ExtArgs>>): Prisma.Prisma__PeriodFactClient<runtime.Types.Result.GetResult<Prisma.$PeriodFactPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    deleteMany<T extends PeriodFactDeleteManyArgs>(args?: Prisma.SelectSubset<T, PeriodFactDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    updateMany<T extends PeriodFactUpdateManyArgs>(args: Prisma.SelectSubset<T, PeriodFactUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    updateManyAndReturn<T extends PeriodFactUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, PeriodFactUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$PeriodFactPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    upsert<T extends PeriodFactUpsertArgs>(args: Prisma.SelectSubset<T, PeriodFactUpsertArgs<ExtArgs>>): Prisma.Prisma__PeriodFactClient<runtime.Types.Result.GetResult<Prisma.$PeriodFactPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    count<T extends PeriodFactCountArgs>(args?: Prisma.Subset<T, PeriodFactCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], PeriodFactCountAggregateOutputType> : number>;
    aggregate<T extends PeriodFactAggregateArgs>(args: Prisma.Subset<T, PeriodFactAggregateArgs>): Prisma.PrismaPromise<GetPeriodFactAggregateType<T>>;
    groupBy<T extends PeriodFactGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: PeriodFactGroupByArgs['orderBy'];
    } : {
        orderBy?: PeriodFactGroupByArgs['orderBy'];
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
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, PeriodFactGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetPeriodFactGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    readonly fields: PeriodFactFieldRefs;
}
export interface Prisma__PeriodFactClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    period<T extends Prisma.PeriodDefaultArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.PeriodDefaultArgs<ExtArgs>>): Prisma.Prisma__PeriodClient<runtime.Types.Result.GetResult<Prisma.$PeriodPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>;
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): runtime.Types.Utils.JsPromise<TResult1 | TResult2>;
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): runtime.Types.Utils.JsPromise<T | TResult>;
    finally(onfinally?: (() => void) | undefined | null): runtime.Types.Utils.JsPromise<T>;
}
export interface PeriodFactFieldRefs {
    readonly id: Prisma.FieldRef<"PeriodFact", 'String'>;
    readonly periodId: Prisma.FieldRef<"PeriodFact", 'String'>;
    readonly workLineageId: Prisma.FieldRef<"PeriodFact", 'String'>;
    readonly scVolume: Prisma.FieldRef<"PeriodFact", 'Float'>;
    readonly gpVolume: Prisma.FieldRef<"PeriodFact", 'Float'>;
    readonly updatedAt: Prisma.FieldRef<"PeriodFact", 'DateTime'>;
    readonly updatedBy: Prisma.FieldRef<"PeriodFact", 'String'>;
}
export type PeriodFactFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.PeriodFactSelect<ExtArgs> | null;
    omit?: Prisma.PeriodFactOmit<ExtArgs> | null;
    include?: Prisma.PeriodFactInclude<ExtArgs> | null;
    where: Prisma.PeriodFactWhereUniqueInput;
};
export type PeriodFactFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.PeriodFactSelect<ExtArgs> | null;
    omit?: Prisma.PeriodFactOmit<ExtArgs> | null;
    include?: Prisma.PeriodFactInclude<ExtArgs> | null;
    where: Prisma.PeriodFactWhereUniqueInput;
};
export type PeriodFactFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
export type PeriodFactFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
export type PeriodFactFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
export type PeriodFactCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.PeriodFactSelect<ExtArgs> | null;
    omit?: Prisma.PeriodFactOmit<ExtArgs> | null;
    include?: Prisma.PeriodFactInclude<ExtArgs> | null;
    data: Prisma.XOR<Prisma.PeriodFactCreateInput, Prisma.PeriodFactUncheckedCreateInput>;
};
export type PeriodFactCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    data: Prisma.PeriodFactCreateManyInput | Prisma.PeriodFactCreateManyInput[];
    skipDuplicates?: boolean;
};
export type PeriodFactCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.PeriodFactSelectCreateManyAndReturn<ExtArgs> | null;
    omit?: Prisma.PeriodFactOmit<ExtArgs> | null;
    data: Prisma.PeriodFactCreateManyInput | Prisma.PeriodFactCreateManyInput[];
    skipDuplicates?: boolean;
    include?: Prisma.PeriodFactIncludeCreateManyAndReturn<ExtArgs> | null;
};
export type PeriodFactUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.PeriodFactSelect<ExtArgs> | null;
    omit?: Prisma.PeriodFactOmit<ExtArgs> | null;
    include?: Prisma.PeriodFactInclude<ExtArgs> | null;
    data: Prisma.XOR<Prisma.PeriodFactUpdateInput, Prisma.PeriodFactUncheckedUpdateInput>;
    where: Prisma.PeriodFactWhereUniqueInput;
};
export type PeriodFactUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    data: Prisma.XOR<Prisma.PeriodFactUpdateManyMutationInput, Prisma.PeriodFactUncheckedUpdateManyInput>;
    where?: Prisma.PeriodFactWhereInput;
    limit?: number;
};
export type PeriodFactUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.PeriodFactSelectUpdateManyAndReturn<ExtArgs> | null;
    omit?: Prisma.PeriodFactOmit<ExtArgs> | null;
    data: Prisma.XOR<Prisma.PeriodFactUpdateManyMutationInput, Prisma.PeriodFactUncheckedUpdateManyInput>;
    where?: Prisma.PeriodFactWhereInput;
    limit?: number;
    include?: Prisma.PeriodFactIncludeUpdateManyAndReturn<ExtArgs> | null;
};
export type PeriodFactUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.PeriodFactSelect<ExtArgs> | null;
    omit?: Prisma.PeriodFactOmit<ExtArgs> | null;
    include?: Prisma.PeriodFactInclude<ExtArgs> | null;
    where: Prisma.PeriodFactWhereUniqueInput;
    create: Prisma.XOR<Prisma.PeriodFactCreateInput, Prisma.PeriodFactUncheckedCreateInput>;
    update: Prisma.XOR<Prisma.PeriodFactUpdateInput, Prisma.PeriodFactUncheckedUpdateInput>;
};
export type PeriodFactDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.PeriodFactSelect<ExtArgs> | null;
    omit?: Prisma.PeriodFactOmit<ExtArgs> | null;
    include?: Prisma.PeriodFactInclude<ExtArgs> | null;
    where: Prisma.PeriodFactWhereUniqueInput;
};
export type PeriodFactDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.PeriodFactWhereInput;
    limit?: number;
};
export type PeriodFactDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.PeriodFactSelect<ExtArgs> | null;
    omit?: Prisma.PeriodFactOmit<ExtArgs> | null;
    include?: Prisma.PeriodFactInclude<ExtArgs> | null;
};
