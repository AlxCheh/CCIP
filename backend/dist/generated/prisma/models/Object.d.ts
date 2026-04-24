import type * as runtime from "@prisma/client/runtime/client";
import type * as Prisma from "../internal/prismaNamespace.js";
export type ObjectModel = runtime.Types.Result.DefaultSelection<Prisma.$ObjectPayload>;
export type AggregateObject = {
    _count: ObjectCountAggregateOutputType | null;
    _min: ObjectMinAggregateOutputType | null;
    _max: ObjectMaxAggregateOutputType | null;
};
export type ObjectMinAggregateOutputType = {
    id: string | null;
    name: string | null;
    address: string | null;
    createdAt: Date | null;
};
export type ObjectMaxAggregateOutputType = {
    id: string | null;
    name: string | null;
    address: string | null;
    createdAt: Date | null;
};
export type ObjectCountAggregateOutputType = {
    id: number;
    name: number;
    address: number;
    createdAt: number;
    _all: number;
};
export type ObjectMinAggregateInputType = {
    id?: true;
    name?: true;
    address?: true;
    createdAt?: true;
};
export type ObjectMaxAggregateInputType = {
    id?: true;
    name?: true;
    address?: true;
    createdAt?: true;
};
export type ObjectCountAggregateInputType = {
    id?: true;
    name?: true;
    address?: true;
    createdAt?: true;
    _all?: true;
};
export type ObjectAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.ObjectWhereInput;
    orderBy?: Prisma.ObjectOrderByWithRelationInput | Prisma.ObjectOrderByWithRelationInput[];
    cursor?: Prisma.ObjectWhereUniqueInput;
    take?: number;
    skip?: number;
    _count?: true | ObjectCountAggregateInputType;
    _min?: ObjectMinAggregateInputType;
    _max?: ObjectMaxAggregateInputType;
};
export type GetObjectAggregateType<T extends ObjectAggregateArgs> = {
    [P in keyof T & keyof AggregateObject]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregateObject[P]> : Prisma.GetScalarType<T[P], AggregateObject[P]>;
};
export type ObjectGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.ObjectWhereInput;
    orderBy?: Prisma.ObjectOrderByWithAggregationInput | Prisma.ObjectOrderByWithAggregationInput[];
    by: Prisma.ObjectScalarFieldEnum[] | Prisma.ObjectScalarFieldEnum;
    having?: Prisma.ObjectScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: ObjectCountAggregateInputType | true;
    _min?: ObjectMinAggregateInputType;
    _max?: ObjectMaxAggregateInputType;
};
export type ObjectGroupByOutputType = {
    id: string;
    name: string;
    address: string | null;
    createdAt: Date;
    _count: ObjectCountAggregateOutputType | null;
    _min: ObjectMinAggregateOutputType | null;
    _max: ObjectMaxAggregateOutputType | null;
};
export type GetObjectGroupByPayload<T extends ObjectGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<ObjectGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof ObjectGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], ObjectGroupByOutputType[P]> : Prisma.GetScalarType<T[P], ObjectGroupByOutputType[P]>;
}>>;
export type ObjectWhereInput = {
    AND?: Prisma.ObjectWhereInput | Prisma.ObjectWhereInput[];
    OR?: Prisma.ObjectWhereInput[];
    NOT?: Prisma.ObjectWhereInput | Prisma.ObjectWhereInput[];
    id?: Prisma.StringFilter<"Object"> | string;
    name?: Prisma.StringFilter<"Object"> | string;
    address?: Prisma.StringNullableFilter<"Object"> | string | null;
    createdAt?: Prisma.DateTimeFilter<"Object"> | Date | string;
    periods?: Prisma.PeriodListRelationFilter;
    zeroReports?: Prisma.ZeroReportListRelationFilter;
};
export type ObjectOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    address?: Prisma.SortOrderInput | Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    periods?: Prisma.PeriodOrderByRelationAggregateInput;
    zeroReports?: Prisma.ZeroReportOrderByRelationAggregateInput;
};
export type ObjectWhereUniqueInput = Prisma.AtLeast<{
    id?: string;
    AND?: Prisma.ObjectWhereInput | Prisma.ObjectWhereInput[];
    OR?: Prisma.ObjectWhereInput[];
    NOT?: Prisma.ObjectWhereInput | Prisma.ObjectWhereInput[];
    name?: Prisma.StringFilter<"Object"> | string;
    address?: Prisma.StringNullableFilter<"Object"> | string | null;
    createdAt?: Prisma.DateTimeFilter<"Object"> | Date | string;
    periods?: Prisma.PeriodListRelationFilter;
    zeroReports?: Prisma.ZeroReportListRelationFilter;
}, "id">;
export type ObjectOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    address?: Prisma.SortOrderInput | Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    _count?: Prisma.ObjectCountOrderByAggregateInput;
    _max?: Prisma.ObjectMaxOrderByAggregateInput;
    _min?: Prisma.ObjectMinOrderByAggregateInput;
};
export type ObjectScalarWhereWithAggregatesInput = {
    AND?: Prisma.ObjectScalarWhereWithAggregatesInput | Prisma.ObjectScalarWhereWithAggregatesInput[];
    OR?: Prisma.ObjectScalarWhereWithAggregatesInput[];
    NOT?: Prisma.ObjectScalarWhereWithAggregatesInput | Prisma.ObjectScalarWhereWithAggregatesInput[];
    id?: Prisma.StringWithAggregatesFilter<"Object"> | string;
    name?: Prisma.StringWithAggregatesFilter<"Object"> | string;
    address?: Prisma.StringNullableWithAggregatesFilter<"Object"> | string | null;
    createdAt?: Prisma.DateTimeWithAggregatesFilter<"Object"> | Date | string;
};
export type ObjectCreateInput = {
    id?: string;
    name: string;
    address?: string | null;
    createdAt?: Date | string;
    periods?: Prisma.PeriodCreateNestedManyWithoutObjectInput;
    zeroReports?: Prisma.ZeroReportCreateNestedManyWithoutObjectInput;
};
export type ObjectUncheckedCreateInput = {
    id?: string;
    name: string;
    address?: string | null;
    createdAt?: Date | string;
    periods?: Prisma.PeriodUncheckedCreateNestedManyWithoutObjectInput;
    zeroReports?: Prisma.ZeroReportUncheckedCreateNestedManyWithoutObjectInput;
};
export type ObjectUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    address?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    periods?: Prisma.PeriodUpdateManyWithoutObjectNestedInput;
    zeroReports?: Prisma.ZeroReportUpdateManyWithoutObjectNestedInput;
};
export type ObjectUncheckedUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    address?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    periods?: Prisma.PeriodUncheckedUpdateManyWithoutObjectNestedInput;
    zeroReports?: Prisma.ZeroReportUncheckedUpdateManyWithoutObjectNestedInput;
};
export type ObjectCreateManyInput = {
    id?: string;
    name: string;
    address?: string | null;
    createdAt?: Date | string;
};
export type ObjectUpdateManyMutationInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    address?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type ObjectUncheckedUpdateManyInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    address?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type ObjectCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    address?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
};
export type ObjectMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    address?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
};
export type ObjectMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    address?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
};
export type ObjectScalarRelationFilter = {
    is?: Prisma.ObjectWhereInput;
    isNot?: Prisma.ObjectWhereInput;
};
export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null;
};
export type ObjectCreateNestedOneWithoutZeroReportsInput = {
    create?: Prisma.XOR<Prisma.ObjectCreateWithoutZeroReportsInput, Prisma.ObjectUncheckedCreateWithoutZeroReportsInput>;
    connectOrCreate?: Prisma.ObjectCreateOrConnectWithoutZeroReportsInput;
    connect?: Prisma.ObjectWhereUniqueInput;
};
export type ObjectUpdateOneRequiredWithoutZeroReportsNestedInput = {
    create?: Prisma.XOR<Prisma.ObjectCreateWithoutZeroReportsInput, Prisma.ObjectUncheckedCreateWithoutZeroReportsInput>;
    connectOrCreate?: Prisma.ObjectCreateOrConnectWithoutZeroReportsInput;
    upsert?: Prisma.ObjectUpsertWithoutZeroReportsInput;
    connect?: Prisma.ObjectWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.ObjectUpdateToOneWithWhereWithoutZeroReportsInput, Prisma.ObjectUpdateWithoutZeroReportsInput>, Prisma.ObjectUncheckedUpdateWithoutZeroReportsInput>;
};
export type ObjectCreateNestedOneWithoutPeriodsInput = {
    create?: Prisma.XOR<Prisma.ObjectCreateWithoutPeriodsInput, Prisma.ObjectUncheckedCreateWithoutPeriodsInput>;
    connectOrCreate?: Prisma.ObjectCreateOrConnectWithoutPeriodsInput;
    connect?: Prisma.ObjectWhereUniqueInput;
};
export type ObjectUpdateOneRequiredWithoutPeriodsNestedInput = {
    create?: Prisma.XOR<Prisma.ObjectCreateWithoutPeriodsInput, Prisma.ObjectUncheckedCreateWithoutPeriodsInput>;
    connectOrCreate?: Prisma.ObjectCreateOrConnectWithoutPeriodsInput;
    upsert?: Prisma.ObjectUpsertWithoutPeriodsInput;
    connect?: Prisma.ObjectWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.ObjectUpdateToOneWithWhereWithoutPeriodsInput, Prisma.ObjectUpdateWithoutPeriodsInput>, Prisma.ObjectUncheckedUpdateWithoutPeriodsInput>;
};
export type ObjectCreateWithoutZeroReportsInput = {
    id?: string;
    name: string;
    address?: string | null;
    createdAt?: Date | string;
    periods?: Prisma.PeriodCreateNestedManyWithoutObjectInput;
};
export type ObjectUncheckedCreateWithoutZeroReportsInput = {
    id?: string;
    name: string;
    address?: string | null;
    createdAt?: Date | string;
    periods?: Prisma.PeriodUncheckedCreateNestedManyWithoutObjectInput;
};
export type ObjectCreateOrConnectWithoutZeroReportsInput = {
    where: Prisma.ObjectWhereUniqueInput;
    create: Prisma.XOR<Prisma.ObjectCreateWithoutZeroReportsInput, Prisma.ObjectUncheckedCreateWithoutZeroReportsInput>;
};
export type ObjectUpsertWithoutZeroReportsInput = {
    update: Prisma.XOR<Prisma.ObjectUpdateWithoutZeroReportsInput, Prisma.ObjectUncheckedUpdateWithoutZeroReportsInput>;
    create: Prisma.XOR<Prisma.ObjectCreateWithoutZeroReportsInput, Prisma.ObjectUncheckedCreateWithoutZeroReportsInput>;
    where?: Prisma.ObjectWhereInput;
};
export type ObjectUpdateToOneWithWhereWithoutZeroReportsInput = {
    where?: Prisma.ObjectWhereInput;
    data: Prisma.XOR<Prisma.ObjectUpdateWithoutZeroReportsInput, Prisma.ObjectUncheckedUpdateWithoutZeroReportsInput>;
};
export type ObjectUpdateWithoutZeroReportsInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    address?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    periods?: Prisma.PeriodUpdateManyWithoutObjectNestedInput;
};
export type ObjectUncheckedUpdateWithoutZeroReportsInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    address?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    periods?: Prisma.PeriodUncheckedUpdateManyWithoutObjectNestedInput;
};
export type ObjectCreateWithoutPeriodsInput = {
    id?: string;
    name: string;
    address?: string | null;
    createdAt?: Date | string;
    zeroReports?: Prisma.ZeroReportCreateNestedManyWithoutObjectInput;
};
export type ObjectUncheckedCreateWithoutPeriodsInput = {
    id?: string;
    name: string;
    address?: string | null;
    createdAt?: Date | string;
    zeroReports?: Prisma.ZeroReportUncheckedCreateNestedManyWithoutObjectInput;
};
export type ObjectCreateOrConnectWithoutPeriodsInput = {
    where: Prisma.ObjectWhereUniqueInput;
    create: Prisma.XOR<Prisma.ObjectCreateWithoutPeriodsInput, Prisma.ObjectUncheckedCreateWithoutPeriodsInput>;
};
export type ObjectUpsertWithoutPeriodsInput = {
    update: Prisma.XOR<Prisma.ObjectUpdateWithoutPeriodsInput, Prisma.ObjectUncheckedUpdateWithoutPeriodsInput>;
    create: Prisma.XOR<Prisma.ObjectCreateWithoutPeriodsInput, Prisma.ObjectUncheckedCreateWithoutPeriodsInput>;
    where?: Prisma.ObjectWhereInput;
};
export type ObjectUpdateToOneWithWhereWithoutPeriodsInput = {
    where?: Prisma.ObjectWhereInput;
    data: Prisma.XOR<Prisma.ObjectUpdateWithoutPeriodsInput, Prisma.ObjectUncheckedUpdateWithoutPeriodsInput>;
};
export type ObjectUpdateWithoutPeriodsInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    address?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    zeroReports?: Prisma.ZeroReportUpdateManyWithoutObjectNestedInput;
};
export type ObjectUncheckedUpdateWithoutPeriodsInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    address?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    zeroReports?: Prisma.ZeroReportUncheckedUpdateManyWithoutObjectNestedInput;
};
export type ObjectCountOutputType = {
    periods: number;
    zeroReports: number;
};
export type ObjectCountOutputTypeSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    periods?: boolean | ObjectCountOutputTypeCountPeriodsArgs;
    zeroReports?: boolean | ObjectCountOutputTypeCountZeroReportsArgs;
};
export type ObjectCountOutputTypeDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.ObjectCountOutputTypeSelect<ExtArgs> | null;
};
export type ObjectCountOutputTypeCountPeriodsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.PeriodWhereInput;
};
export type ObjectCountOutputTypeCountZeroReportsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.ZeroReportWhereInput;
};
export type ObjectSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    name?: boolean;
    address?: boolean;
    createdAt?: boolean;
    periods?: boolean | Prisma.Object$periodsArgs<ExtArgs>;
    zeroReports?: boolean | Prisma.Object$zeroReportsArgs<ExtArgs>;
    _count?: boolean | Prisma.ObjectCountOutputTypeDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["object"]>;
export type ObjectSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    name?: boolean;
    address?: boolean;
    createdAt?: boolean;
}, ExtArgs["result"]["object"]>;
export type ObjectSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    name?: boolean;
    address?: boolean;
    createdAt?: boolean;
}, ExtArgs["result"]["object"]>;
export type ObjectSelectScalar = {
    id?: boolean;
    name?: boolean;
    address?: boolean;
    createdAt?: boolean;
};
export type ObjectOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "name" | "address" | "createdAt", ExtArgs["result"]["object"]>;
export type ObjectInclude<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    periods?: boolean | Prisma.Object$periodsArgs<ExtArgs>;
    zeroReports?: boolean | Prisma.Object$zeroReportsArgs<ExtArgs>;
    _count?: boolean | Prisma.ObjectCountOutputTypeDefaultArgs<ExtArgs>;
};
export type ObjectIncludeCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {};
export type ObjectIncludeUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {};
export type $ObjectPayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "Object";
    objects: {
        periods: Prisma.$PeriodPayload<ExtArgs>[];
        zeroReports: Prisma.$ZeroReportPayload<ExtArgs>[];
    };
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: string;
        name: string;
        address: string | null;
        createdAt: Date;
    }, ExtArgs["result"]["object"]>;
    composites: {};
};
export type ObjectGetPayload<S extends boolean | null | undefined | ObjectDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$ObjectPayload, S>;
export type ObjectCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<ObjectFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: ObjectCountAggregateInputType | true;
};
export interface ObjectDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['Object'];
        meta: {
            name: 'Object';
        };
    };
    findUnique<T extends ObjectFindUniqueArgs>(args: Prisma.SelectSubset<T, ObjectFindUniqueArgs<ExtArgs>>): Prisma.Prisma__ObjectClient<runtime.Types.Result.GetResult<Prisma.$ObjectPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    findUniqueOrThrow<T extends ObjectFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, ObjectFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__ObjectClient<runtime.Types.Result.GetResult<Prisma.$ObjectPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    findFirst<T extends ObjectFindFirstArgs>(args?: Prisma.SelectSubset<T, ObjectFindFirstArgs<ExtArgs>>): Prisma.Prisma__ObjectClient<runtime.Types.Result.GetResult<Prisma.$ObjectPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    findFirstOrThrow<T extends ObjectFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, ObjectFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__ObjectClient<runtime.Types.Result.GetResult<Prisma.$ObjectPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    findMany<T extends ObjectFindManyArgs>(args?: Prisma.SelectSubset<T, ObjectFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$ObjectPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    create<T extends ObjectCreateArgs>(args: Prisma.SelectSubset<T, ObjectCreateArgs<ExtArgs>>): Prisma.Prisma__ObjectClient<runtime.Types.Result.GetResult<Prisma.$ObjectPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    createMany<T extends ObjectCreateManyArgs>(args?: Prisma.SelectSubset<T, ObjectCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    createManyAndReturn<T extends ObjectCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, ObjectCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$ObjectPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    delete<T extends ObjectDeleteArgs>(args: Prisma.SelectSubset<T, ObjectDeleteArgs<ExtArgs>>): Prisma.Prisma__ObjectClient<runtime.Types.Result.GetResult<Prisma.$ObjectPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    update<T extends ObjectUpdateArgs>(args: Prisma.SelectSubset<T, ObjectUpdateArgs<ExtArgs>>): Prisma.Prisma__ObjectClient<runtime.Types.Result.GetResult<Prisma.$ObjectPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    deleteMany<T extends ObjectDeleteManyArgs>(args?: Prisma.SelectSubset<T, ObjectDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    updateMany<T extends ObjectUpdateManyArgs>(args: Prisma.SelectSubset<T, ObjectUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    updateManyAndReturn<T extends ObjectUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, ObjectUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$ObjectPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    upsert<T extends ObjectUpsertArgs>(args: Prisma.SelectSubset<T, ObjectUpsertArgs<ExtArgs>>): Prisma.Prisma__ObjectClient<runtime.Types.Result.GetResult<Prisma.$ObjectPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    count<T extends ObjectCountArgs>(args?: Prisma.Subset<T, ObjectCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], ObjectCountAggregateOutputType> : number>;
    aggregate<T extends ObjectAggregateArgs>(args: Prisma.Subset<T, ObjectAggregateArgs>): Prisma.PrismaPromise<GetObjectAggregateType<T>>;
    groupBy<T extends ObjectGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: ObjectGroupByArgs['orderBy'];
    } : {
        orderBy?: ObjectGroupByArgs['orderBy'];
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
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, ObjectGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetObjectGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    readonly fields: ObjectFieldRefs;
}
export interface Prisma__ObjectClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    periods<T extends Prisma.Object$periodsArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.Object$periodsArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$PeriodPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
    zeroReports<T extends Prisma.Object$zeroReportsArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.Object$zeroReportsArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$ZeroReportPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): runtime.Types.Utils.JsPromise<TResult1 | TResult2>;
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): runtime.Types.Utils.JsPromise<T | TResult>;
    finally(onfinally?: (() => void) | undefined | null): runtime.Types.Utils.JsPromise<T>;
}
export interface ObjectFieldRefs {
    readonly id: Prisma.FieldRef<"Object", 'String'>;
    readonly name: Prisma.FieldRef<"Object", 'String'>;
    readonly address: Prisma.FieldRef<"Object", 'String'>;
    readonly createdAt: Prisma.FieldRef<"Object", 'DateTime'>;
}
export type ObjectFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.ObjectSelect<ExtArgs> | null;
    omit?: Prisma.ObjectOmit<ExtArgs> | null;
    include?: Prisma.ObjectInclude<ExtArgs> | null;
    where: Prisma.ObjectWhereUniqueInput;
};
export type ObjectFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.ObjectSelect<ExtArgs> | null;
    omit?: Prisma.ObjectOmit<ExtArgs> | null;
    include?: Prisma.ObjectInclude<ExtArgs> | null;
    where: Prisma.ObjectWhereUniqueInput;
};
export type ObjectFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.ObjectSelect<ExtArgs> | null;
    omit?: Prisma.ObjectOmit<ExtArgs> | null;
    include?: Prisma.ObjectInclude<ExtArgs> | null;
    where?: Prisma.ObjectWhereInput;
    orderBy?: Prisma.ObjectOrderByWithRelationInput | Prisma.ObjectOrderByWithRelationInput[];
    cursor?: Prisma.ObjectWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.ObjectScalarFieldEnum | Prisma.ObjectScalarFieldEnum[];
};
export type ObjectFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.ObjectSelect<ExtArgs> | null;
    omit?: Prisma.ObjectOmit<ExtArgs> | null;
    include?: Prisma.ObjectInclude<ExtArgs> | null;
    where?: Prisma.ObjectWhereInput;
    orderBy?: Prisma.ObjectOrderByWithRelationInput | Prisma.ObjectOrderByWithRelationInput[];
    cursor?: Prisma.ObjectWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.ObjectScalarFieldEnum | Prisma.ObjectScalarFieldEnum[];
};
export type ObjectFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.ObjectSelect<ExtArgs> | null;
    omit?: Prisma.ObjectOmit<ExtArgs> | null;
    include?: Prisma.ObjectInclude<ExtArgs> | null;
    where?: Prisma.ObjectWhereInput;
    orderBy?: Prisma.ObjectOrderByWithRelationInput | Prisma.ObjectOrderByWithRelationInput[];
    cursor?: Prisma.ObjectWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.ObjectScalarFieldEnum | Prisma.ObjectScalarFieldEnum[];
};
export type ObjectCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.ObjectSelect<ExtArgs> | null;
    omit?: Prisma.ObjectOmit<ExtArgs> | null;
    include?: Prisma.ObjectInclude<ExtArgs> | null;
    data: Prisma.XOR<Prisma.ObjectCreateInput, Prisma.ObjectUncheckedCreateInput>;
};
export type ObjectCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    data: Prisma.ObjectCreateManyInput | Prisma.ObjectCreateManyInput[];
    skipDuplicates?: boolean;
};
export type ObjectCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.ObjectSelectCreateManyAndReturn<ExtArgs> | null;
    omit?: Prisma.ObjectOmit<ExtArgs> | null;
    data: Prisma.ObjectCreateManyInput | Prisma.ObjectCreateManyInput[];
    skipDuplicates?: boolean;
};
export type ObjectUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.ObjectSelect<ExtArgs> | null;
    omit?: Prisma.ObjectOmit<ExtArgs> | null;
    include?: Prisma.ObjectInclude<ExtArgs> | null;
    data: Prisma.XOR<Prisma.ObjectUpdateInput, Prisma.ObjectUncheckedUpdateInput>;
    where: Prisma.ObjectWhereUniqueInput;
};
export type ObjectUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    data: Prisma.XOR<Prisma.ObjectUpdateManyMutationInput, Prisma.ObjectUncheckedUpdateManyInput>;
    where?: Prisma.ObjectWhereInput;
    limit?: number;
};
export type ObjectUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.ObjectSelectUpdateManyAndReturn<ExtArgs> | null;
    omit?: Prisma.ObjectOmit<ExtArgs> | null;
    data: Prisma.XOR<Prisma.ObjectUpdateManyMutationInput, Prisma.ObjectUncheckedUpdateManyInput>;
    where?: Prisma.ObjectWhereInput;
    limit?: number;
};
export type ObjectUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.ObjectSelect<ExtArgs> | null;
    omit?: Prisma.ObjectOmit<ExtArgs> | null;
    include?: Prisma.ObjectInclude<ExtArgs> | null;
    where: Prisma.ObjectWhereUniqueInput;
    create: Prisma.XOR<Prisma.ObjectCreateInput, Prisma.ObjectUncheckedCreateInput>;
    update: Prisma.XOR<Prisma.ObjectUpdateInput, Prisma.ObjectUncheckedUpdateInput>;
};
export type ObjectDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.ObjectSelect<ExtArgs> | null;
    omit?: Prisma.ObjectOmit<ExtArgs> | null;
    include?: Prisma.ObjectInclude<ExtArgs> | null;
    where: Prisma.ObjectWhereUniqueInput;
};
export type ObjectDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.ObjectWhereInput;
    limit?: number;
};
export type Object$periodsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
export type Object$zeroReportsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
export type ObjectDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.ObjectSelect<ExtArgs> | null;
    omit?: Prisma.ObjectOmit<ExtArgs> | null;
    include?: Prisma.ObjectInclude<ExtArgs> | null;
};
