import type * as runtime from "@prisma/client/runtime/client";
import type * as Prisma from "../internal/prismaNamespace.js";
export type ZeroReportModel = runtime.Types.Result.DefaultSelection<Prisma.$ZeroReportPayload>;
export type AggregateZeroReport = {
    _count: ZeroReportCountAggregateOutputType | null;
    _min: ZeroReportMinAggregateOutputType | null;
    _max: ZeroReportMaxAggregateOutputType | null;
};
export type ZeroReportMinAggregateOutputType = {
    id: string | null;
    objectId: string | null;
    status: string | null;
    createdBy: string | null;
    approvedAt: Date | null;
    createdAt: Date | null;
};
export type ZeroReportMaxAggregateOutputType = {
    id: string | null;
    objectId: string | null;
    status: string | null;
    createdBy: string | null;
    approvedAt: Date | null;
    createdAt: Date | null;
};
export type ZeroReportCountAggregateOutputType = {
    id: number;
    objectId: number;
    status: number;
    createdBy: number;
    approvedAt: number;
    createdAt: number;
    _all: number;
};
export type ZeroReportMinAggregateInputType = {
    id?: true;
    objectId?: true;
    status?: true;
    createdBy?: true;
    approvedAt?: true;
    createdAt?: true;
};
export type ZeroReportMaxAggregateInputType = {
    id?: true;
    objectId?: true;
    status?: true;
    createdBy?: true;
    approvedAt?: true;
    createdAt?: true;
};
export type ZeroReportCountAggregateInputType = {
    id?: true;
    objectId?: true;
    status?: true;
    createdBy?: true;
    approvedAt?: true;
    createdAt?: true;
    _all?: true;
};
export type ZeroReportAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.ZeroReportWhereInput;
    orderBy?: Prisma.ZeroReportOrderByWithRelationInput | Prisma.ZeroReportOrderByWithRelationInput[];
    cursor?: Prisma.ZeroReportWhereUniqueInput;
    take?: number;
    skip?: number;
    _count?: true | ZeroReportCountAggregateInputType;
    _min?: ZeroReportMinAggregateInputType;
    _max?: ZeroReportMaxAggregateInputType;
};
export type GetZeroReportAggregateType<T extends ZeroReportAggregateArgs> = {
    [P in keyof T & keyof AggregateZeroReport]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregateZeroReport[P]> : Prisma.GetScalarType<T[P], AggregateZeroReport[P]>;
};
export type ZeroReportGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.ZeroReportWhereInput;
    orderBy?: Prisma.ZeroReportOrderByWithAggregationInput | Prisma.ZeroReportOrderByWithAggregationInput[];
    by: Prisma.ZeroReportScalarFieldEnum[] | Prisma.ZeroReportScalarFieldEnum;
    having?: Prisma.ZeroReportScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: ZeroReportCountAggregateInputType | true;
    _min?: ZeroReportMinAggregateInputType;
    _max?: ZeroReportMaxAggregateInputType;
};
export type ZeroReportGroupByOutputType = {
    id: string;
    objectId: string;
    status: string;
    createdBy: string;
    approvedAt: Date | null;
    createdAt: Date;
    _count: ZeroReportCountAggregateOutputType | null;
    _min: ZeroReportMinAggregateOutputType | null;
    _max: ZeroReportMaxAggregateOutputType | null;
};
export type GetZeroReportGroupByPayload<T extends ZeroReportGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<ZeroReportGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof ZeroReportGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], ZeroReportGroupByOutputType[P]> : Prisma.GetScalarType<T[P], ZeroReportGroupByOutputType[P]>;
}>>;
export type ZeroReportWhereInput = {
    AND?: Prisma.ZeroReportWhereInput | Prisma.ZeroReportWhereInput[];
    OR?: Prisma.ZeroReportWhereInput[];
    NOT?: Prisma.ZeroReportWhereInput | Prisma.ZeroReportWhereInput[];
    id?: Prisma.StringFilter<"ZeroReport"> | string;
    objectId?: Prisma.StringFilter<"ZeroReport"> | string;
    status?: Prisma.StringFilter<"ZeroReport"> | string;
    createdBy?: Prisma.StringFilter<"ZeroReport"> | string;
    approvedAt?: Prisma.DateTimeNullableFilter<"ZeroReport"> | Date | string | null;
    createdAt?: Prisma.DateTimeFilter<"ZeroReport"> | Date | string;
    object?: Prisma.XOR<Prisma.ObjectScalarRelationFilter, Prisma.ObjectWhereInput>;
    creator?: Prisma.XOR<Prisma.UserScalarRelationFilter, Prisma.UserWhereInput>;
};
export type ZeroReportOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    objectId?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
    createdBy?: Prisma.SortOrder;
    approvedAt?: Prisma.SortOrderInput | Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    object?: Prisma.ObjectOrderByWithRelationInput;
    creator?: Prisma.UserOrderByWithRelationInput;
};
export type ZeroReportWhereUniqueInput = Prisma.AtLeast<{
    id?: string;
    AND?: Prisma.ZeroReportWhereInput | Prisma.ZeroReportWhereInput[];
    OR?: Prisma.ZeroReportWhereInput[];
    NOT?: Prisma.ZeroReportWhereInput | Prisma.ZeroReportWhereInput[];
    objectId?: Prisma.StringFilter<"ZeroReport"> | string;
    status?: Prisma.StringFilter<"ZeroReport"> | string;
    createdBy?: Prisma.StringFilter<"ZeroReport"> | string;
    approvedAt?: Prisma.DateTimeNullableFilter<"ZeroReport"> | Date | string | null;
    createdAt?: Prisma.DateTimeFilter<"ZeroReport"> | Date | string;
    object?: Prisma.XOR<Prisma.ObjectScalarRelationFilter, Prisma.ObjectWhereInput>;
    creator?: Prisma.XOR<Prisma.UserScalarRelationFilter, Prisma.UserWhereInput>;
}, "id">;
export type ZeroReportOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    objectId?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
    createdBy?: Prisma.SortOrder;
    approvedAt?: Prisma.SortOrderInput | Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    _count?: Prisma.ZeroReportCountOrderByAggregateInput;
    _max?: Prisma.ZeroReportMaxOrderByAggregateInput;
    _min?: Prisma.ZeroReportMinOrderByAggregateInput;
};
export type ZeroReportScalarWhereWithAggregatesInput = {
    AND?: Prisma.ZeroReportScalarWhereWithAggregatesInput | Prisma.ZeroReportScalarWhereWithAggregatesInput[];
    OR?: Prisma.ZeroReportScalarWhereWithAggregatesInput[];
    NOT?: Prisma.ZeroReportScalarWhereWithAggregatesInput | Prisma.ZeroReportScalarWhereWithAggregatesInput[];
    id?: Prisma.StringWithAggregatesFilter<"ZeroReport"> | string;
    objectId?: Prisma.StringWithAggregatesFilter<"ZeroReport"> | string;
    status?: Prisma.StringWithAggregatesFilter<"ZeroReport"> | string;
    createdBy?: Prisma.StringWithAggregatesFilter<"ZeroReport"> | string;
    approvedAt?: Prisma.DateTimeNullableWithAggregatesFilter<"ZeroReport"> | Date | string | null;
    createdAt?: Prisma.DateTimeWithAggregatesFilter<"ZeroReport"> | Date | string;
};
export type ZeroReportCreateInput = {
    id?: string;
    status?: string;
    approvedAt?: Date | string | null;
    createdAt?: Date | string;
    object: Prisma.ObjectCreateNestedOneWithoutZeroReportsInput;
    creator: Prisma.UserCreateNestedOneWithoutZeroReportsInput;
};
export type ZeroReportUncheckedCreateInput = {
    id?: string;
    objectId: string;
    status?: string;
    createdBy: string;
    approvedAt?: Date | string | null;
    createdAt?: Date | string;
};
export type ZeroReportUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    approvedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    object?: Prisma.ObjectUpdateOneRequiredWithoutZeroReportsNestedInput;
    creator?: Prisma.UserUpdateOneRequiredWithoutZeroReportsNestedInput;
};
export type ZeroReportUncheckedUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    objectId?: Prisma.StringFieldUpdateOperationsInput | string;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    createdBy?: Prisma.StringFieldUpdateOperationsInput | string;
    approvedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type ZeroReportCreateManyInput = {
    id?: string;
    objectId: string;
    status?: string;
    createdBy: string;
    approvedAt?: Date | string | null;
    createdAt?: Date | string;
};
export type ZeroReportUpdateManyMutationInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    approvedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type ZeroReportUncheckedUpdateManyInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    objectId?: Prisma.StringFieldUpdateOperationsInput | string;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    createdBy?: Prisma.StringFieldUpdateOperationsInput | string;
    approvedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type ZeroReportListRelationFilter = {
    every?: Prisma.ZeroReportWhereInput;
    some?: Prisma.ZeroReportWhereInput;
    none?: Prisma.ZeroReportWhereInput;
};
export type ZeroReportOrderByRelationAggregateInput = {
    _count?: Prisma.SortOrder;
};
export type ZeroReportCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    objectId?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
    createdBy?: Prisma.SortOrder;
    approvedAt?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
};
export type ZeroReportMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    objectId?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
    createdBy?: Prisma.SortOrder;
    approvedAt?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
};
export type ZeroReportMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    objectId?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
    createdBy?: Prisma.SortOrder;
    approvedAt?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
};
export type ZeroReportCreateNestedManyWithoutCreatorInput = {
    create?: Prisma.XOR<Prisma.ZeroReportCreateWithoutCreatorInput, Prisma.ZeroReportUncheckedCreateWithoutCreatorInput> | Prisma.ZeroReportCreateWithoutCreatorInput[] | Prisma.ZeroReportUncheckedCreateWithoutCreatorInput[];
    connectOrCreate?: Prisma.ZeroReportCreateOrConnectWithoutCreatorInput | Prisma.ZeroReportCreateOrConnectWithoutCreatorInput[];
    createMany?: Prisma.ZeroReportCreateManyCreatorInputEnvelope;
    connect?: Prisma.ZeroReportWhereUniqueInput | Prisma.ZeroReportWhereUniqueInput[];
};
export type ZeroReportUncheckedCreateNestedManyWithoutCreatorInput = {
    create?: Prisma.XOR<Prisma.ZeroReportCreateWithoutCreatorInput, Prisma.ZeroReportUncheckedCreateWithoutCreatorInput> | Prisma.ZeroReportCreateWithoutCreatorInput[] | Prisma.ZeroReportUncheckedCreateWithoutCreatorInput[];
    connectOrCreate?: Prisma.ZeroReportCreateOrConnectWithoutCreatorInput | Prisma.ZeroReportCreateOrConnectWithoutCreatorInput[];
    createMany?: Prisma.ZeroReportCreateManyCreatorInputEnvelope;
    connect?: Prisma.ZeroReportWhereUniqueInput | Prisma.ZeroReportWhereUniqueInput[];
};
export type ZeroReportUpdateManyWithoutCreatorNestedInput = {
    create?: Prisma.XOR<Prisma.ZeroReportCreateWithoutCreatorInput, Prisma.ZeroReportUncheckedCreateWithoutCreatorInput> | Prisma.ZeroReportCreateWithoutCreatorInput[] | Prisma.ZeroReportUncheckedCreateWithoutCreatorInput[];
    connectOrCreate?: Prisma.ZeroReportCreateOrConnectWithoutCreatorInput | Prisma.ZeroReportCreateOrConnectWithoutCreatorInput[];
    upsert?: Prisma.ZeroReportUpsertWithWhereUniqueWithoutCreatorInput | Prisma.ZeroReportUpsertWithWhereUniqueWithoutCreatorInput[];
    createMany?: Prisma.ZeroReportCreateManyCreatorInputEnvelope;
    set?: Prisma.ZeroReportWhereUniqueInput | Prisma.ZeroReportWhereUniqueInput[];
    disconnect?: Prisma.ZeroReportWhereUniqueInput | Prisma.ZeroReportWhereUniqueInput[];
    delete?: Prisma.ZeroReportWhereUniqueInput | Prisma.ZeroReportWhereUniqueInput[];
    connect?: Prisma.ZeroReportWhereUniqueInput | Prisma.ZeroReportWhereUniqueInput[];
    update?: Prisma.ZeroReportUpdateWithWhereUniqueWithoutCreatorInput | Prisma.ZeroReportUpdateWithWhereUniqueWithoutCreatorInput[];
    updateMany?: Prisma.ZeroReportUpdateManyWithWhereWithoutCreatorInput | Prisma.ZeroReportUpdateManyWithWhereWithoutCreatorInput[];
    deleteMany?: Prisma.ZeroReportScalarWhereInput | Prisma.ZeroReportScalarWhereInput[];
};
export type ZeroReportUncheckedUpdateManyWithoutCreatorNestedInput = {
    create?: Prisma.XOR<Prisma.ZeroReportCreateWithoutCreatorInput, Prisma.ZeroReportUncheckedCreateWithoutCreatorInput> | Prisma.ZeroReportCreateWithoutCreatorInput[] | Prisma.ZeroReportUncheckedCreateWithoutCreatorInput[];
    connectOrCreate?: Prisma.ZeroReportCreateOrConnectWithoutCreatorInput | Prisma.ZeroReportCreateOrConnectWithoutCreatorInput[];
    upsert?: Prisma.ZeroReportUpsertWithWhereUniqueWithoutCreatorInput | Prisma.ZeroReportUpsertWithWhereUniqueWithoutCreatorInput[];
    createMany?: Prisma.ZeroReportCreateManyCreatorInputEnvelope;
    set?: Prisma.ZeroReportWhereUniqueInput | Prisma.ZeroReportWhereUniqueInput[];
    disconnect?: Prisma.ZeroReportWhereUniqueInput | Prisma.ZeroReportWhereUniqueInput[];
    delete?: Prisma.ZeroReportWhereUniqueInput | Prisma.ZeroReportWhereUniqueInput[];
    connect?: Prisma.ZeroReportWhereUniqueInput | Prisma.ZeroReportWhereUniqueInput[];
    update?: Prisma.ZeroReportUpdateWithWhereUniqueWithoutCreatorInput | Prisma.ZeroReportUpdateWithWhereUniqueWithoutCreatorInput[];
    updateMany?: Prisma.ZeroReportUpdateManyWithWhereWithoutCreatorInput | Prisma.ZeroReportUpdateManyWithWhereWithoutCreatorInput[];
    deleteMany?: Prisma.ZeroReportScalarWhereInput | Prisma.ZeroReportScalarWhereInput[];
};
export type ZeroReportCreateNestedManyWithoutObjectInput = {
    create?: Prisma.XOR<Prisma.ZeroReportCreateWithoutObjectInput, Prisma.ZeroReportUncheckedCreateWithoutObjectInput> | Prisma.ZeroReportCreateWithoutObjectInput[] | Prisma.ZeroReportUncheckedCreateWithoutObjectInput[];
    connectOrCreate?: Prisma.ZeroReportCreateOrConnectWithoutObjectInput | Prisma.ZeroReportCreateOrConnectWithoutObjectInput[];
    createMany?: Prisma.ZeroReportCreateManyObjectInputEnvelope;
    connect?: Prisma.ZeroReportWhereUniqueInput | Prisma.ZeroReportWhereUniqueInput[];
};
export type ZeroReportUncheckedCreateNestedManyWithoutObjectInput = {
    create?: Prisma.XOR<Prisma.ZeroReportCreateWithoutObjectInput, Prisma.ZeroReportUncheckedCreateWithoutObjectInput> | Prisma.ZeroReportCreateWithoutObjectInput[] | Prisma.ZeroReportUncheckedCreateWithoutObjectInput[];
    connectOrCreate?: Prisma.ZeroReportCreateOrConnectWithoutObjectInput | Prisma.ZeroReportCreateOrConnectWithoutObjectInput[];
    createMany?: Prisma.ZeroReportCreateManyObjectInputEnvelope;
    connect?: Prisma.ZeroReportWhereUniqueInput | Prisma.ZeroReportWhereUniqueInput[];
};
export type ZeroReportUpdateManyWithoutObjectNestedInput = {
    create?: Prisma.XOR<Prisma.ZeroReportCreateWithoutObjectInput, Prisma.ZeroReportUncheckedCreateWithoutObjectInput> | Prisma.ZeroReportCreateWithoutObjectInput[] | Prisma.ZeroReportUncheckedCreateWithoutObjectInput[];
    connectOrCreate?: Prisma.ZeroReportCreateOrConnectWithoutObjectInput | Prisma.ZeroReportCreateOrConnectWithoutObjectInput[];
    upsert?: Prisma.ZeroReportUpsertWithWhereUniqueWithoutObjectInput | Prisma.ZeroReportUpsertWithWhereUniqueWithoutObjectInput[];
    createMany?: Prisma.ZeroReportCreateManyObjectInputEnvelope;
    set?: Prisma.ZeroReportWhereUniqueInput | Prisma.ZeroReportWhereUniqueInput[];
    disconnect?: Prisma.ZeroReportWhereUniqueInput | Prisma.ZeroReportWhereUniqueInput[];
    delete?: Prisma.ZeroReportWhereUniqueInput | Prisma.ZeroReportWhereUniqueInput[];
    connect?: Prisma.ZeroReportWhereUniqueInput | Prisma.ZeroReportWhereUniqueInput[];
    update?: Prisma.ZeroReportUpdateWithWhereUniqueWithoutObjectInput | Prisma.ZeroReportUpdateWithWhereUniqueWithoutObjectInput[];
    updateMany?: Prisma.ZeroReportUpdateManyWithWhereWithoutObjectInput | Prisma.ZeroReportUpdateManyWithWhereWithoutObjectInput[];
    deleteMany?: Prisma.ZeroReportScalarWhereInput | Prisma.ZeroReportScalarWhereInput[];
};
export type ZeroReportUncheckedUpdateManyWithoutObjectNestedInput = {
    create?: Prisma.XOR<Prisma.ZeroReportCreateWithoutObjectInput, Prisma.ZeroReportUncheckedCreateWithoutObjectInput> | Prisma.ZeroReportCreateWithoutObjectInput[] | Prisma.ZeroReportUncheckedCreateWithoutObjectInput[];
    connectOrCreate?: Prisma.ZeroReportCreateOrConnectWithoutObjectInput | Prisma.ZeroReportCreateOrConnectWithoutObjectInput[];
    upsert?: Prisma.ZeroReportUpsertWithWhereUniqueWithoutObjectInput | Prisma.ZeroReportUpsertWithWhereUniqueWithoutObjectInput[];
    createMany?: Prisma.ZeroReportCreateManyObjectInputEnvelope;
    set?: Prisma.ZeroReportWhereUniqueInput | Prisma.ZeroReportWhereUniqueInput[];
    disconnect?: Prisma.ZeroReportWhereUniqueInput | Prisma.ZeroReportWhereUniqueInput[];
    delete?: Prisma.ZeroReportWhereUniqueInput | Prisma.ZeroReportWhereUniqueInput[];
    connect?: Prisma.ZeroReportWhereUniqueInput | Prisma.ZeroReportWhereUniqueInput[];
    update?: Prisma.ZeroReportUpdateWithWhereUniqueWithoutObjectInput | Prisma.ZeroReportUpdateWithWhereUniqueWithoutObjectInput[];
    updateMany?: Prisma.ZeroReportUpdateManyWithWhereWithoutObjectInput | Prisma.ZeroReportUpdateManyWithWhereWithoutObjectInput[];
    deleteMany?: Prisma.ZeroReportScalarWhereInput | Prisma.ZeroReportScalarWhereInput[];
};
export type NullableDateTimeFieldUpdateOperationsInput = {
    set?: Date | string | null;
};
export type ZeroReportCreateWithoutCreatorInput = {
    id?: string;
    status?: string;
    approvedAt?: Date | string | null;
    createdAt?: Date | string;
    object: Prisma.ObjectCreateNestedOneWithoutZeroReportsInput;
};
export type ZeroReportUncheckedCreateWithoutCreatorInput = {
    id?: string;
    objectId: string;
    status?: string;
    approvedAt?: Date | string | null;
    createdAt?: Date | string;
};
export type ZeroReportCreateOrConnectWithoutCreatorInput = {
    where: Prisma.ZeroReportWhereUniqueInput;
    create: Prisma.XOR<Prisma.ZeroReportCreateWithoutCreatorInput, Prisma.ZeroReportUncheckedCreateWithoutCreatorInput>;
};
export type ZeroReportCreateManyCreatorInputEnvelope = {
    data: Prisma.ZeroReportCreateManyCreatorInput | Prisma.ZeroReportCreateManyCreatorInput[];
    skipDuplicates?: boolean;
};
export type ZeroReportUpsertWithWhereUniqueWithoutCreatorInput = {
    where: Prisma.ZeroReportWhereUniqueInput;
    update: Prisma.XOR<Prisma.ZeroReportUpdateWithoutCreatorInput, Prisma.ZeroReportUncheckedUpdateWithoutCreatorInput>;
    create: Prisma.XOR<Prisma.ZeroReportCreateWithoutCreatorInput, Prisma.ZeroReportUncheckedCreateWithoutCreatorInput>;
};
export type ZeroReportUpdateWithWhereUniqueWithoutCreatorInput = {
    where: Prisma.ZeroReportWhereUniqueInput;
    data: Prisma.XOR<Prisma.ZeroReportUpdateWithoutCreatorInput, Prisma.ZeroReportUncheckedUpdateWithoutCreatorInput>;
};
export type ZeroReportUpdateManyWithWhereWithoutCreatorInput = {
    where: Prisma.ZeroReportScalarWhereInput;
    data: Prisma.XOR<Prisma.ZeroReportUpdateManyMutationInput, Prisma.ZeroReportUncheckedUpdateManyWithoutCreatorInput>;
};
export type ZeroReportScalarWhereInput = {
    AND?: Prisma.ZeroReportScalarWhereInput | Prisma.ZeroReportScalarWhereInput[];
    OR?: Prisma.ZeroReportScalarWhereInput[];
    NOT?: Prisma.ZeroReportScalarWhereInput | Prisma.ZeroReportScalarWhereInput[];
    id?: Prisma.StringFilter<"ZeroReport"> | string;
    objectId?: Prisma.StringFilter<"ZeroReport"> | string;
    status?: Prisma.StringFilter<"ZeroReport"> | string;
    createdBy?: Prisma.StringFilter<"ZeroReport"> | string;
    approvedAt?: Prisma.DateTimeNullableFilter<"ZeroReport"> | Date | string | null;
    createdAt?: Prisma.DateTimeFilter<"ZeroReport"> | Date | string;
};
export type ZeroReportCreateWithoutObjectInput = {
    id?: string;
    status?: string;
    approvedAt?: Date | string | null;
    createdAt?: Date | string;
    creator: Prisma.UserCreateNestedOneWithoutZeroReportsInput;
};
export type ZeroReportUncheckedCreateWithoutObjectInput = {
    id?: string;
    status?: string;
    createdBy: string;
    approvedAt?: Date | string | null;
    createdAt?: Date | string;
};
export type ZeroReportCreateOrConnectWithoutObjectInput = {
    where: Prisma.ZeroReportWhereUniqueInput;
    create: Prisma.XOR<Prisma.ZeroReportCreateWithoutObjectInput, Prisma.ZeroReportUncheckedCreateWithoutObjectInput>;
};
export type ZeroReportCreateManyObjectInputEnvelope = {
    data: Prisma.ZeroReportCreateManyObjectInput | Prisma.ZeroReportCreateManyObjectInput[];
    skipDuplicates?: boolean;
};
export type ZeroReportUpsertWithWhereUniqueWithoutObjectInput = {
    where: Prisma.ZeroReportWhereUniqueInput;
    update: Prisma.XOR<Prisma.ZeroReportUpdateWithoutObjectInput, Prisma.ZeroReportUncheckedUpdateWithoutObjectInput>;
    create: Prisma.XOR<Prisma.ZeroReportCreateWithoutObjectInput, Prisma.ZeroReportUncheckedCreateWithoutObjectInput>;
};
export type ZeroReportUpdateWithWhereUniqueWithoutObjectInput = {
    where: Prisma.ZeroReportWhereUniqueInput;
    data: Prisma.XOR<Prisma.ZeroReportUpdateWithoutObjectInput, Prisma.ZeroReportUncheckedUpdateWithoutObjectInput>;
};
export type ZeroReportUpdateManyWithWhereWithoutObjectInput = {
    where: Prisma.ZeroReportScalarWhereInput;
    data: Prisma.XOR<Prisma.ZeroReportUpdateManyMutationInput, Prisma.ZeroReportUncheckedUpdateManyWithoutObjectInput>;
};
export type ZeroReportCreateManyCreatorInput = {
    id?: string;
    objectId: string;
    status?: string;
    approvedAt?: Date | string | null;
    createdAt?: Date | string;
};
export type ZeroReportUpdateWithoutCreatorInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    approvedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    object?: Prisma.ObjectUpdateOneRequiredWithoutZeroReportsNestedInput;
};
export type ZeroReportUncheckedUpdateWithoutCreatorInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    objectId?: Prisma.StringFieldUpdateOperationsInput | string;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    approvedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type ZeroReportUncheckedUpdateManyWithoutCreatorInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    objectId?: Prisma.StringFieldUpdateOperationsInput | string;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    approvedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type ZeroReportCreateManyObjectInput = {
    id?: string;
    status?: string;
    createdBy: string;
    approvedAt?: Date | string | null;
    createdAt?: Date | string;
};
export type ZeroReportUpdateWithoutObjectInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    approvedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    creator?: Prisma.UserUpdateOneRequiredWithoutZeroReportsNestedInput;
};
export type ZeroReportUncheckedUpdateWithoutObjectInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    createdBy?: Prisma.StringFieldUpdateOperationsInput | string;
    approvedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type ZeroReportUncheckedUpdateManyWithoutObjectInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    createdBy?: Prisma.StringFieldUpdateOperationsInput | string;
    approvedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type ZeroReportSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    objectId?: boolean;
    status?: boolean;
    createdBy?: boolean;
    approvedAt?: boolean;
    createdAt?: boolean;
    object?: boolean | Prisma.ObjectDefaultArgs<ExtArgs>;
    creator?: boolean | Prisma.UserDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["zeroReport"]>;
export type ZeroReportSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    objectId?: boolean;
    status?: boolean;
    createdBy?: boolean;
    approvedAt?: boolean;
    createdAt?: boolean;
    object?: boolean | Prisma.ObjectDefaultArgs<ExtArgs>;
    creator?: boolean | Prisma.UserDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["zeroReport"]>;
export type ZeroReportSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    objectId?: boolean;
    status?: boolean;
    createdBy?: boolean;
    approvedAt?: boolean;
    createdAt?: boolean;
    object?: boolean | Prisma.ObjectDefaultArgs<ExtArgs>;
    creator?: boolean | Prisma.UserDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["zeroReport"]>;
export type ZeroReportSelectScalar = {
    id?: boolean;
    objectId?: boolean;
    status?: boolean;
    createdBy?: boolean;
    approvedAt?: boolean;
    createdAt?: boolean;
};
export type ZeroReportOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "objectId" | "status" | "createdBy" | "approvedAt" | "createdAt", ExtArgs["result"]["zeroReport"]>;
export type ZeroReportInclude<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    object?: boolean | Prisma.ObjectDefaultArgs<ExtArgs>;
    creator?: boolean | Prisma.UserDefaultArgs<ExtArgs>;
};
export type ZeroReportIncludeCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    object?: boolean | Prisma.ObjectDefaultArgs<ExtArgs>;
    creator?: boolean | Prisma.UserDefaultArgs<ExtArgs>;
};
export type ZeroReportIncludeUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    object?: boolean | Prisma.ObjectDefaultArgs<ExtArgs>;
    creator?: boolean | Prisma.UserDefaultArgs<ExtArgs>;
};
export type $ZeroReportPayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "ZeroReport";
    objects: {
        object: Prisma.$ObjectPayload<ExtArgs>;
        creator: Prisma.$UserPayload<ExtArgs>;
    };
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: string;
        objectId: string;
        status: string;
        createdBy: string;
        approvedAt: Date | null;
        createdAt: Date;
    }, ExtArgs["result"]["zeroReport"]>;
    composites: {};
};
export type ZeroReportGetPayload<S extends boolean | null | undefined | ZeroReportDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$ZeroReportPayload, S>;
export type ZeroReportCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<ZeroReportFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: ZeroReportCountAggregateInputType | true;
};
export interface ZeroReportDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['ZeroReport'];
        meta: {
            name: 'ZeroReport';
        };
    };
    findUnique<T extends ZeroReportFindUniqueArgs>(args: Prisma.SelectSubset<T, ZeroReportFindUniqueArgs<ExtArgs>>): Prisma.Prisma__ZeroReportClient<runtime.Types.Result.GetResult<Prisma.$ZeroReportPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    findUniqueOrThrow<T extends ZeroReportFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, ZeroReportFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__ZeroReportClient<runtime.Types.Result.GetResult<Prisma.$ZeroReportPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    findFirst<T extends ZeroReportFindFirstArgs>(args?: Prisma.SelectSubset<T, ZeroReportFindFirstArgs<ExtArgs>>): Prisma.Prisma__ZeroReportClient<runtime.Types.Result.GetResult<Prisma.$ZeroReportPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    findFirstOrThrow<T extends ZeroReportFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, ZeroReportFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__ZeroReportClient<runtime.Types.Result.GetResult<Prisma.$ZeroReportPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    findMany<T extends ZeroReportFindManyArgs>(args?: Prisma.SelectSubset<T, ZeroReportFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$ZeroReportPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    create<T extends ZeroReportCreateArgs>(args: Prisma.SelectSubset<T, ZeroReportCreateArgs<ExtArgs>>): Prisma.Prisma__ZeroReportClient<runtime.Types.Result.GetResult<Prisma.$ZeroReportPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    createMany<T extends ZeroReportCreateManyArgs>(args?: Prisma.SelectSubset<T, ZeroReportCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    createManyAndReturn<T extends ZeroReportCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, ZeroReportCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$ZeroReportPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    delete<T extends ZeroReportDeleteArgs>(args: Prisma.SelectSubset<T, ZeroReportDeleteArgs<ExtArgs>>): Prisma.Prisma__ZeroReportClient<runtime.Types.Result.GetResult<Prisma.$ZeroReportPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    update<T extends ZeroReportUpdateArgs>(args: Prisma.SelectSubset<T, ZeroReportUpdateArgs<ExtArgs>>): Prisma.Prisma__ZeroReportClient<runtime.Types.Result.GetResult<Prisma.$ZeroReportPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    deleteMany<T extends ZeroReportDeleteManyArgs>(args?: Prisma.SelectSubset<T, ZeroReportDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    updateMany<T extends ZeroReportUpdateManyArgs>(args: Prisma.SelectSubset<T, ZeroReportUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    updateManyAndReturn<T extends ZeroReportUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, ZeroReportUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$ZeroReportPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    upsert<T extends ZeroReportUpsertArgs>(args: Prisma.SelectSubset<T, ZeroReportUpsertArgs<ExtArgs>>): Prisma.Prisma__ZeroReportClient<runtime.Types.Result.GetResult<Prisma.$ZeroReportPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    count<T extends ZeroReportCountArgs>(args?: Prisma.Subset<T, ZeroReportCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], ZeroReportCountAggregateOutputType> : number>;
    aggregate<T extends ZeroReportAggregateArgs>(args: Prisma.Subset<T, ZeroReportAggregateArgs>): Prisma.PrismaPromise<GetZeroReportAggregateType<T>>;
    groupBy<T extends ZeroReportGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: ZeroReportGroupByArgs['orderBy'];
    } : {
        orderBy?: ZeroReportGroupByArgs['orderBy'];
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
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, ZeroReportGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetZeroReportGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    readonly fields: ZeroReportFieldRefs;
}
export interface Prisma__ZeroReportClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    object<T extends Prisma.ObjectDefaultArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.ObjectDefaultArgs<ExtArgs>>): Prisma.Prisma__ObjectClient<runtime.Types.Result.GetResult<Prisma.$ObjectPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>;
    creator<T extends Prisma.UserDefaultArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.UserDefaultArgs<ExtArgs>>): Prisma.Prisma__UserClient<runtime.Types.Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>;
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): runtime.Types.Utils.JsPromise<TResult1 | TResult2>;
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): runtime.Types.Utils.JsPromise<T | TResult>;
    finally(onfinally?: (() => void) | undefined | null): runtime.Types.Utils.JsPromise<T>;
}
export interface ZeroReportFieldRefs {
    readonly id: Prisma.FieldRef<"ZeroReport", 'String'>;
    readonly objectId: Prisma.FieldRef<"ZeroReport", 'String'>;
    readonly status: Prisma.FieldRef<"ZeroReport", 'String'>;
    readonly createdBy: Prisma.FieldRef<"ZeroReport", 'String'>;
    readonly approvedAt: Prisma.FieldRef<"ZeroReport", 'DateTime'>;
    readonly createdAt: Prisma.FieldRef<"ZeroReport", 'DateTime'>;
}
export type ZeroReportFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.ZeroReportSelect<ExtArgs> | null;
    omit?: Prisma.ZeroReportOmit<ExtArgs> | null;
    include?: Prisma.ZeroReportInclude<ExtArgs> | null;
    where: Prisma.ZeroReportWhereUniqueInput;
};
export type ZeroReportFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.ZeroReportSelect<ExtArgs> | null;
    omit?: Prisma.ZeroReportOmit<ExtArgs> | null;
    include?: Prisma.ZeroReportInclude<ExtArgs> | null;
    where: Prisma.ZeroReportWhereUniqueInput;
};
export type ZeroReportFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.ZeroReportSelect<ExtArgs> | null;
    omit?: Prisma.ZeroReportOmit<ExtArgs> | null;
    include?: Prisma.ZeroReportInclude<ExtArgs> | null;
    where?: Prisma.ZeroReportWhereInput;
    orderBy?: Prisma.ZeroReportOrderByWithRelationInput | Prisma.ZeroReportOrderByWithRelationInput[];
    cursor?: Prisma.ZeroReportWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.ZeroReportScalarFieldEnum | Prisma.ZeroReportScalarFieldEnum[];
};
export type ZeroReportFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.ZeroReportSelect<ExtArgs> | null;
    omit?: Prisma.ZeroReportOmit<ExtArgs> | null;
    include?: Prisma.ZeroReportInclude<ExtArgs> | null;
    where?: Prisma.ZeroReportWhereInput;
    orderBy?: Prisma.ZeroReportOrderByWithRelationInput | Prisma.ZeroReportOrderByWithRelationInput[];
    cursor?: Prisma.ZeroReportWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.ZeroReportScalarFieldEnum | Prisma.ZeroReportScalarFieldEnum[];
};
export type ZeroReportFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.ZeroReportSelect<ExtArgs> | null;
    omit?: Prisma.ZeroReportOmit<ExtArgs> | null;
    include?: Prisma.ZeroReportInclude<ExtArgs> | null;
    where?: Prisma.ZeroReportWhereInput;
    orderBy?: Prisma.ZeroReportOrderByWithRelationInput | Prisma.ZeroReportOrderByWithRelationInput[];
    cursor?: Prisma.ZeroReportWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.ZeroReportScalarFieldEnum | Prisma.ZeroReportScalarFieldEnum[];
};
export type ZeroReportCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.ZeroReportSelect<ExtArgs> | null;
    omit?: Prisma.ZeroReportOmit<ExtArgs> | null;
    include?: Prisma.ZeroReportInclude<ExtArgs> | null;
    data: Prisma.XOR<Prisma.ZeroReportCreateInput, Prisma.ZeroReportUncheckedCreateInput>;
};
export type ZeroReportCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    data: Prisma.ZeroReportCreateManyInput | Prisma.ZeroReportCreateManyInput[];
    skipDuplicates?: boolean;
};
export type ZeroReportCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.ZeroReportSelectCreateManyAndReturn<ExtArgs> | null;
    omit?: Prisma.ZeroReportOmit<ExtArgs> | null;
    data: Prisma.ZeroReportCreateManyInput | Prisma.ZeroReportCreateManyInput[];
    skipDuplicates?: boolean;
    include?: Prisma.ZeroReportIncludeCreateManyAndReturn<ExtArgs> | null;
};
export type ZeroReportUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.ZeroReportSelect<ExtArgs> | null;
    omit?: Prisma.ZeroReportOmit<ExtArgs> | null;
    include?: Prisma.ZeroReportInclude<ExtArgs> | null;
    data: Prisma.XOR<Prisma.ZeroReportUpdateInput, Prisma.ZeroReportUncheckedUpdateInput>;
    where: Prisma.ZeroReportWhereUniqueInput;
};
export type ZeroReportUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    data: Prisma.XOR<Prisma.ZeroReportUpdateManyMutationInput, Prisma.ZeroReportUncheckedUpdateManyInput>;
    where?: Prisma.ZeroReportWhereInput;
    limit?: number;
};
export type ZeroReportUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.ZeroReportSelectUpdateManyAndReturn<ExtArgs> | null;
    omit?: Prisma.ZeroReportOmit<ExtArgs> | null;
    data: Prisma.XOR<Prisma.ZeroReportUpdateManyMutationInput, Prisma.ZeroReportUncheckedUpdateManyInput>;
    where?: Prisma.ZeroReportWhereInput;
    limit?: number;
    include?: Prisma.ZeroReportIncludeUpdateManyAndReturn<ExtArgs> | null;
};
export type ZeroReportUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.ZeroReportSelect<ExtArgs> | null;
    omit?: Prisma.ZeroReportOmit<ExtArgs> | null;
    include?: Prisma.ZeroReportInclude<ExtArgs> | null;
    where: Prisma.ZeroReportWhereUniqueInput;
    create: Prisma.XOR<Prisma.ZeroReportCreateInput, Prisma.ZeroReportUncheckedCreateInput>;
    update: Prisma.XOR<Prisma.ZeroReportUpdateInput, Prisma.ZeroReportUncheckedUpdateInput>;
};
export type ZeroReportDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.ZeroReportSelect<ExtArgs> | null;
    omit?: Prisma.ZeroReportOmit<ExtArgs> | null;
    include?: Prisma.ZeroReportInclude<ExtArgs> | null;
    where: Prisma.ZeroReportWhereUniqueInput;
};
export type ZeroReportDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.ZeroReportWhereInput;
    limit?: number;
};
export type ZeroReportDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.ZeroReportSelect<ExtArgs> | null;
    omit?: Prisma.ZeroReportOmit<ExtArgs> | null;
    include?: Prisma.ZeroReportInclude<ExtArgs> | null;
};
