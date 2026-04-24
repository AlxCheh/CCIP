import type * as runtime from "@prisma/client/runtime/client";
import type * as Prisma from "../internal/prismaNamespace.js";
export type SyncQueueModel = runtime.Types.Result.DefaultSelection<Prisma.$SyncQueuePayload>;
export type AggregateSyncQueue = {
    _count: SyncQueueCountAggregateOutputType | null;
    _avg: SyncQueueAvgAggregateOutputType | null;
    _sum: SyncQueueSumAggregateOutputType | null;
    _min: SyncQueueMinAggregateOutputType | null;
    _max: SyncQueueMaxAggregateOutputType | null;
};
export type SyncQueueAvgAggregateOutputType = {
    value: number | null;
};
export type SyncQueueSumAggregateOutputType = {
    value: number | null;
};
export type SyncQueueMinAggregateOutputType = {
    id: string | null;
    periodId: string | null;
    workLineageId: string | null;
    clientTimestamp: Date | null;
    value: number | null;
    status: string | null;
    resolvedNote: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
};
export type SyncQueueMaxAggregateOutputType = {
    id: string | null;
    periodId: string | null;
    workLineageId: string | null;
    clientTimestamp: Date | null;
    value: number | null;
    status: string | null;
    resolvedNote: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
};
export type SyncQueueCountAggregateOutputType = {
    id: number;
    periodId: number;
    workLineageId: number;
    clientTimestamp: number;
    value: number;
    status: number;
    conflictData: number;
    resolvedNote: number;
    createdAt: number;
    updatedAt: number;
    _all: number;
};
export type SyncQueueAvgAggregateInputType = {
    value?: true;
};
export type SyncQueueSumAggregateInputType = {
    value?: true;
};
export type SyncQueueMinAggregateInputType = {
    id?: true;
    periodId?: true;
    workLineageId?: true;
    clientTimestamp?: true;
    value?: true;
    status?: true;
    resolvedNote?: true;
    createdAt?: true;
    updatedAt?: true;
};
export type SyncQueueMaxAggregateInputType = {
    id?: true;
    periodId?: true;
    workLineageId?: true;
    clientTimestamp?: true;
    value?: true;
    status?: true;
    resolvedNote?: true;
    createdAt?: true;
    updatedAt?: true;
};
export type SyncQueueCountAggregateInputType = {
    id?: true;
    periodId?: true;
    workLineageId?: true;
    clientTimestamp?: true;
    value?: true;
    status?: true;
    conflictData?: true;
    resolvedNote?: true;
    createdAt?: true;
    updatedAt?: true;
    _all?: true;
};
export type SyncQueueAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.SyncQueueWhereInput;
    orderBy?: Prisma.SyncQueueOrderByWithRelationInput | Prisma.SyncQueueOrderByWithRelationInput[];
    cursor?: Prisma.SyncQueueWhereUniqueInput;
    take?: number;
    skip?: number;
    _count?: true | SyncQueueCountAggregateInputType;
    _avg?: SyncQueueAvgAggregateInputType;
    _sum?: SyncQueueSumAggregateInputType;
    _min?: SyncQueueMinAggregateInputType;
    _max?: SyncQueueMaxAggregateInputType;
};
export type GetSyncQueueAggregateType<T extends SyncQueueAggregateArgs> = {
    [P in keyof T & keyof AggregateSyncQueue]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregateSyncQueue[P]> : Prisma.GetScalarType<T[P], AggregateSyncQueue[P]>;
};
export type SyncQueueGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.SyncQueueWhereInput;
    orderBy?: Prisma.SyncQueueOrderByWithAggregationInput | Prisma.SyncQueueOrderByWithAggregationInput[];
    by: Prisma.SyncQueueScalarFieldEnum[] | Prisma.SyncQueueScalarFieldEnum;
    having?: Prisma.SyncQueueScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: SyncQueueCountAggregateInputType | true;
    _avg?: SyncQueueAvgAggregateInputType;
    _sum?: SyncQueueSumAggregateInputType;
    _min?: SyncQueueMinAggregateInputType;
    _max?: SyncQueueMaxAggregateInputType;
};
export type SyncQueueGroupByOutputType = {
    id: string;
    periodId: string;
    workLineageId: string;
    clientTimestamp: Date;
    value: number;
    status: string;
    conflictData: runtime.JsonValue | null;
    resolvedNote: string | null;
    createdAt: Date;
    updatedAt: Date;
    _count: SyncQueueCountAggregateOutputType | null;
    _avg: SyncQueueAvgAggregateOutputType | null;
    _sum: SyncQueueSumAggregateOutputType | null;
    _min: SyncQueueMinAggregateOutputType | null;
    _max: SyncQueueMaxAggregateOutputType | null;
};
export type GetSyncQueueGroupByPayload<T extends SyncQueueGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<SyncQueueGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof SyncQueueGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], SyncQueueGroupByOutputType[P]> : Prisma.GetScalarType<T[P], SyncQueueGroupByOutputType[P]>;
}>>;
export type SyncQueueWhereInput = {
    AND?: Prisma.SyncQueueWhereInput | Prisma.SyncQueueWhereInput[];
    OR?: Prisma.SyncQueueWhereInput[];
    NOT?: Prisma.SyncQueueWhereInput | Prisma.SyncQueueWhereInput[];
    id?: Prisma.StringFilter<"SyncQueue"> | string;
    periodId?: Prisma.StringFilter<"SyncQueue"> | string;
    workLineageId?: Prisma.StringFilter<"SyncQueue"> | string;
    clientTimestamp?: Prisma.DateTimeFilter<"SyncQueue"> | Date | string;
    value?: Prisma.FloatFilter<"SyncQueue"> | number;
    status?: Prisma.StringFilter<"SyncQueue"> | string;
    conflictData?: Prisma.JsonNullableFilter<"SyncQueue">;
    resolvedNote?: Prisma.StringNullableFilter<"SyncQueue"> | string | null;
    createdAt?: Prisma.DateTimeFilter<"SyncQueue"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"SyncQueue"> | Date | string;
};
export type SyncQueueOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    periodId?: Prisma.SortOrder;
    workLineageId?: Prisma.SortOrder;
    clientTimestamp?: Prisma.SortOrder;
    value?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
    conflictData?: Prisma.SortOrderInput | Prisma.SortOrder;
    resolvedNote?: Prisma.SortOrderInput | Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type SyncQueueWhereUniqueInput = Prisma.AtLeast<{
    id?: string;
    AND?: Prisma.SyncQueueWhereInput | Prisma.SyncQueueWhereInput[];
    OR?: Prisma.SyncQueueWhereInput[];
    NOT?: Prisma.SyncQueueWhereInput | Prisma.SyncQueueWhereInput[];
    periodId?: Prisma.StringFilter<"SyncQueue"> | string;
    workLineageId?: Prisma.StringFilter<"SyncQueue"> | string;
    clientTimestamp?: Prisma.DateTimeFilter<"SyncQueue"> | Date | string;
    value?: Prisma.FloatFilter<"SyncQueue"> | number;
    status?: Prisma.StringFilter<"SyncQueue"> | string;
    conflictData?: Prisma.JsonNullableFilter<"SyncQueue">;
    resolvedNote?: Prisma.StringNullableFilter<"SyncQueue"> | string | null;
    createdAt?: Prisma.DateTimeFilter<"SyncQueue"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"SyncQueue"> | Date | string;
}, "id">;
export type SyncQueueOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    periodId?: Prisma.SortOrder;
    workLineageId?: Prisma.SortOrder;
    clientTimestamp?: Prisma.SortOrder;
    value?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
    conflictData?: Prisma.SortOrderInput | Prisma.SortOrder;
    resolvedNote?: Prisma.SortOrderInput | Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    _count?: Prisma.SyncQueueCountOrderByAggregateInput;
    _avg?: Prisma.SyncQueueAvgOrderByAggregateInput;
    _max?: Prisma.SyncQueueMaxOrderByAggregateInput;
    _min?: Prisma.SyncQueueMinOrderByAggregateInput;
    _sum?: Prisma.SyncQueueSumOrderByAggregateInput;
};
export type SyncQueueScalarWhereWithAggregatesInput = {
    AND?: Prisma.SyncQueueScalarWhereWithAggregatesInput | Prisma.SyncQueueScalarWhereWithAggregatesInput[];
    OR?: Prisma.SyncQueueScalarWhereWithAggregatesInput[];
    NOT?: Prisma.SyncQueueScalarWhereWithAggregatesInput | Prisma.SyncQueueScalarWhereWithAggregatesInput[];
    id?: Prisma.StringWithAggregatesFilter<"SyncQueue"> | string;
    periodId?: Prisma.StringWithAggregatesFilter<"SyncQueue"> | string;
    workLineageId?: Prisma.StringWithAggregatesFilter<"SyncQueue"> | string;
    clientTimestamp?: Prisma.DateTimeWithAggregatesFilter<"SyncQueue"> | Date | string;
    value?: Prisma.FloatWithAggregatesFilter<"SyncQueue"> | number;
    status?: Prisma.StringWithAggregatesFilter<"SyncQueue"> | string;
    conflictData?: Prisma.JsonNullableWithAggregatesFilter<"SyncQueue">;
    resolvedNote?: Prisma.StringNullableWithAggregatesFilter<"SyncQueue"> | string | null;
    createdAt?: Prisma.DateTimeWithAggregatesFilter<"SyncQueue"> | Date | string;
    updatedAt?: Prisma.DateTimeWithAggregatesFilter<"SyncQueue"> | Date | string;
};
export type SyncQueueCreateInput = {
    id?: string;
    periodId: string;
    workLineageId: string;
    clientTimestamp: Date | string;
    value: number;
    status?: string;
    conflictData?: Prisma.NullableJsonNullValueInput | runtime.InputJsonValue;
    resolvedNote?: string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type SyncQueueUncheckedCreateInput = {
    id?: string;
    periodId: string;
    workLineageId: string;
    clientTimestamp: Date | string;
    value: number;
    status?: string;
    conflictData?: Prisma.NullableJsonNullValueInput | runtime.InputJsonValue;
    resolvedNote?: string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type SyncQueueUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    periodId?: Prisma.StringFieldUpdateOperationsInput | string;
    workLineageId?: Prisma.StringFieldUpdateOperationsInput | string;
    clientTimestamp?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    value?: Prisma.FloatFieldUpdateOperationsInput | number;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    conflictData?: Prisma.NullableJsonNullValueInput | runtime.InputJsonValue;
    resolvedNote?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type SyncQueueUncheckedUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    periodId?: Prisma.StringFieldUpdateOperationsInput | string;
    workLineageId?: Prisma.StringFieldUpdateOperationsInput | string;
    clientTimestamp?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    value?: Prisma.FloatFieldUpdateOperationsInput | number;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    conflictData?: Prisma.NullableJsonNullValueInput | runtime.InputJsonValue;
    resolvedNote?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type SyncQueueCreateManyInput = {
    id?: string;
    periodId: string;
    workLineageId: string;
    clientTimestamp: Date | string;
    value: number;
    status?: string;
    conflictData?: Prisma.NullableJsonNullValueInput | runtime.InputJsonValue;
    resolvedNote?: string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type SyncQueueUpdateManyMutationInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    periodId?: Prisma.StringFieldUpdateOperationsInput | string;
    workLineageId?: Prisma.StringFieldUpdateOperationsInput | string;
    clientTimestamp?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    value?: Prisma.FloatFieldUpdateOperationsInput | number;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    conflictData?: Prisma.NullableJsonNullValueInput | runtime.InputJsonValue;
    resolvedNote?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type SyncQueueUncheckedUpdateManyInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    periodId?: Prisma.StringFieldUpdateOperationsInput | string;
    workLineageId?: Prisma.StringFieldUpdateOperationsInput | string;
    clientTimestamp?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    value?: Prisma.FloatFieldUpdateOperationsInput | number;
    status?: Prisma.StringFieldUpdateOperationsInput | string;
    conflictData?: Prisma.NullableJsonNullValueInput | runtime.InputJsonValue;
    resolvedNote?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type SyncQueueCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    periodId?: Prisma.SortOrder;
    workLineageId?: Prisma.SortOrder;
    clientTimestamp?: Prisma.SortOrder;
    value?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
    conflictData?: Prisma.SortOrder;
    resolvedNote?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type SyncQueueAvgOrderByAggregateInput = {
    value?: Prisma.SortOrder;
};
export type SyncQueueMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    periodId?: Prisma.SortOrder;
    workLineageId?: Prisma.SortOrder;
    clientTimestamp?: Prisma.SortOrder;
    value?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
    resolvedNote?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type SyncQueueMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    periodId?: Prisma.SortOrder;
    workLineageId?: Prisma.SortOrder;
    clientTimestamp?: Prisma.SortOrder;
    value?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
    resolvedNote?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type SyncQueueSumOrderByAggregateInput = {
    value?: Prisma.SortOrder;
};
export type FloatFieldUpdateOperationsInput = {
    set?: number;
    increment?: number;
    decrement?: number;
    multiply?: number;
    divide?: number;
};
export type SyncQueueSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    periodId?: boolean;
    workLineageId?: boolean;
    clientTimestamp?: boolean;
    value?: boolean;
    status?: boolean;
    conflictData?: boolean;
    resolvedNote?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
}, ExtArgs["result"]["syncQueue"]>;
export type SyncQueueSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    periodId?: boolean;
    workLineageId?: boolean;
    clientTimestamp?: boolean;
    value?: boolean;
    status?: boolean;
    conflictData?: boolean;
    resolvedNote?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
}, ExtArgs["result"]["syncQueue"]>;
export type SyncQueueSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    periodId?: boolean;
    workLineageId?: boolean;
    clientTimestamp?: boolean;
    value?: boolean;
    status?: boolean;
    conflictData?: boolean;
    resolvedNote?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
}, ExtArgs["result"]["syncQueue"]>;
export type SyncQueueSelectScalar = {
    id?: boolean;
    periodId?: boolean;
    workLineageId?: boolean;
    clientTimestamp?: boolean;
    value?: boolean;
    status?: boolean;
    conflictData?: boolean;
    resolvedNote?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
};
export type SyncQueueOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "periodId" | "workLineageId" | "clientTimestamp" | "value" | "status" | "conflictData" | "resolvedNote" | "createdAt" | "updatedAt", ExtArgs["result"]["syncQueue"]>;
export type $SyncQueuePayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "SyncQueue";
    objects: {};
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: string;
        periodId: string;
        workLineageId: string;
        clientTimestamp: Date;
        value: number;
        status: string;
        conflictData: runtime.JsonValue | null;
        resolvedNote: string | null;
        createdAt: Date;
        updatedAt: Date;
    }, ExtArgs["result"]["syncQueue"]>;
    composites: {};
};
export type SyncQueueGetPayload<S extends boolean | null | undefined | SyncQueueDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$SyncQueuePayload, S>;
export type SyncQueueCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<SyncQueueFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: SyncQueueCountAggregateInputType | true;
};
export interface SyncQueueDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['SyncQueue'];
        meta: {
            name: 'SyncQueue';
        };
    };
    findUnique<T extends SyncQueueFindUniqueArgs>(args: Prisma.SelectSubset<T, SyncQueueFindUniqueArgs<ExtArgs>>): Prisma.Prisma__SyncQueueClient<runtime.Types.Result.GetResult<Prisma.$SyncQueuePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    findUniqueOrThrow<T extends SyncQueueFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, SyncQueueFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__SyncQueueClient<runtime.Types.Result.GetResult<Prisma.$SyncQueuePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    findFirst<T extends SyncQueueFindFirstArgs>(args?: Prisma.SelectSubset<T, SyncQueueFindFirstArgs<ExtArgs>>): Prisma.Prisma__SyncQueueClient<runtime.Types.Result.GetResult<Prisma.$SyncQueuePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    findFirstOrThrow<T extends SyncQueueFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, SyncQueueFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__SyncQueueClient<runtime.Types.Result.GetResult<Prisma.$SyncQueuePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    findMany<T extends SyncQueueFindManyArgs>(args?: Prisma.SelectSubset<T, SyncQueueFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$SyncQueuePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    create<T extends SyncQueueCreateArgs>(args: Prisma.SelectSubset<T, SyncQueueCreateArgs<ExtArgs>>): Prisma.Prisma__SyncQueueClient<runtime.Types.Result.GetResult<Prisma.$SyncQueuePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    createMany<T extends SyncQueueCreateManyArgs>(args?: Prisma.SelectSubset<T, SyncQueueCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    createManyAndReturn<T extends SyncQueueCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, SyncQueueCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$SyncQueuePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    delete<T extends SyncQueueDeleteArgs>(args: Prisma.SelectSubset<T, SyncQueueDeleteArgs<ExtArgs>>): Prisma.Prisma__SyncQueueClient<runtime.Types.Result.GetResult<Prisma.$SyncQueuePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    update<T extends SyncQueueUpdateArgs>(args: Prisma.SelectSubset<T, SyncQueueUpdateArgs<ExtArgs>>): Prisma.Prisma__SyncQueueClient<runtime.Types.Result.GetResult<Prisma.$SyncQueuePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    deleteMany<T extends SyncQueueDeleteManyArgs>(args?: Prisma.SelectSubset<T, SyncQueueDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    updateMany<T extends SyncQueueUpdateManyArgs>(args: Prisma.SelectSubset<T, SyncQueueUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    updateManyAndReturn<T extends SyncQueueUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, SyncQueueUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$SyncQueuePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    upsert<T extends SyncQueueUpsertArgs>(args: Prisma.SelectSubset<T, SyncQueueUpsertArgs<ExtArgs>>): Prisma.Prisma__SyncQueueClient<runtime.Types.Result.GetResult<Prisma.$SyncQueuePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    count<T extends SyncQueueCountArgs>(args?: Prisma.Subset<T, SyncQueueCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], SyncQueueCountAggregateOutputType> : number>;
    aggregate<T extends SyncQueueAggregateArgs>(args: Prisma.Subset<T, SyncQueueAggregateArgs>): Prisma.PrismaPromise<GetSyncQueueAggregateType<T>>;
    groupBy<T extends SyncQueueGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: SyncQueueGroupByArgs['orderBy'];
    } : {
        orderBy?: SyncQueueGroupByArgs['orderBy'];
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
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, SyncQueueGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSyncQueueGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    readonly fields: SyncQueueFieldRefs;
}
export interface Prisma__SyncQueueClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): runtime.Types.Utils.JsPromise<TResult1 | TResult2>;
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): runtime.Types.Utils.JsPromise<T | TResult>;
    finally(onfinally?: (() => void) | undefined | null): runtime.Types.Utils.JsPromise<T>;
}
export interface SyncQueueFieldRefs {
    readonly id: Prisma.FieldRef<"SyncQueue", 'String'>;
    readonly periodId: Prisma.FieldRef<"SyncQueue", 'String'>;
    readonly workLineageId: Prisma.FieldRef<"SyncQueue", 'String'>;
    readonly clientTimestamp: Prisma.FieldRef<"SyncQueue", 'DateTime'>;
    readonly value: Prisma.FieldRef<"SyncQueue", 'Float'>;
    readonly status: Prisma.FieldRef<"SyncQueue", 'String'>;
    readonly conflictData: Prisma.FieldRef<"SyncQueue", 'Json'>;
    readonly resolvedNote: Prisma.FieldRef<"SyncQueue", 'String'>;
    readonly createdAt: Prisma.FieldRef<"SyncQueue", 'DateTime'>;
    readonly updatedAt: Prisma.FieldRef<"SyncQueue", 'DateTime'>;
}
export type SyncQueueFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.SyncQueueSelect<ExtArgs> | null;
    omit?: Prisma.SyncQueueOmit<ExtArgs> | null;
    where: Prisma.SyncQueueWhereUniqueInput;
};
export type SyncQueueFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.SyncQueueSelect<ExtArgs> | null;
    omit?: Prisma.SyncQueueOmit<ExtArgs> | null;
    where: Prisma.SyncQueueWhereUniqueInput;
};
export type SyncQueueFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.SyncQueueSelect<ExtArgs> | null;
    omit?: Prisma.SyncQueueOmit<ExtArgs> | null;
    where?: Prisma.SyncQueueWhereInput;
    orderBy?: Prisma.SyncQueueOrderByWithRelationInput | Prisma.SyncQueueOrderByWithRelationInput[];
    cursor?: Prisma.SyncQueueWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.SyncQueueScalarFieldEnum | Prisma.SyncQueueScalarFieldEnum[];
};
export type SyncQueueFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.SyncQueueSelect<ExtArgs> | null;
    omit?: Prisma.SyncQueueOmit<ExtArgs> | null;
    where?: Prisma.SyncQueueWhereInput;
    orderBy?: Prisma.SyncQueueOrderByWithRelationInput | Prisma.SyncQueueOrderByWithRelationInput[];
    cursor?: Prisma.SyncQueueWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.SyncQueueScalarFieldEnum | Prisma.SyncQueueScalarFieldEnum[];
};
export type SyncQueueFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.SyncQueueSelect<ExtArgs> | null;
    omit?: Prisma.SyncQueueOmit<ExtArgs> | null;
    where?: Prisma.SyncQueueWhereInput;
    orderBy?: Prisma.SyncQueueOrderByWithRelationInput | Prisma.SyncQueueOrderByWithRelationInput[];
    cursor?: Prisma.SyncQueueWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.SyncQueueScalarFieldEnum | Prisma.SyncQueueScalarFieldEnum[];
};
export type SyncQueueCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.SyncQueueSelect<ExtArgs> | null;
    omit?: Prisma.SyncQueueOmit<ExtArgs> | null;
    data: Prisma.XOR<Prisma.SyncQueueCreateInput, Prisma.SyncQueueUncheckedCreateInput>;
};
export type SyncQueueCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    data: Prisma.SyncQueueCreateManyInput | Prisma.SyncQueueCreateManyInput[];
    skipDuplicates?: boolean;
};
export type SyncQueueCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.SyncQueueSelectCreateManyAndReturn<ExtArgs> | null;
    omit?: Prisma.SyncQueueOmit<ExtArgs> | null;
    data: Prisma.SyncQueueCreateManyInput | Prisma.SyncQueueCreateManyInput[];
    skipDuplicates?: boolean;
};
export type SyncQueueUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.SyncQueueSelect<ExtArgs> | null;
    omit?: Prisma.SyncQueueOmit<ExtArgs> | null;
    data: Prisma.XOR<Prisma.SyncQueueUpdateInput, Prisma.SyncQueueUncheckedUpdateInput>;
    where: Prisma.SyncQueueWhereUniqueInput;
};
export type SyncQueueUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    data: Prisma.XOR<Prisma.SyncQueueUpdateManyMutationInput, Prisma.SyncQueueUncheckedUpdateManyInput>;
    where?: Prisma.SyncQueueWhereInput;
    limit?: number;
};
export type SyncQueueUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.SyncQueueSelectUpdateManyAndReturn<ExtArgs> | null;
    omit?: Prisma.SyncQueueOmit<ExtArgs> | null;
    data: Prisma.XOR<Prisma.SyncQueueUpdateManyMutationInput, Prisma.SyncQueueUncheckedUpdateManyInput>;
    where?: Prisma.SyncQueueWhereInput;
    limit?: number;
};
export type SyncQueueUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.SyncQueueSelect<ExtArgs> | null;
    omit?: Prisma.SyncQueueOmit<ExtArgs> | null;
    where: Prisma.SyncQueueWhereUniqueInput;
    create: Prisma.XOR<Prisma.SyncQueueCreateInput, Prisma.SyncQueueUncheckedCreateInput>;
    update: Prisma.XOR<Prisma.SyncQueueUpdateInput, Prisma.SyncQueueUncheckedUpdateInput>;
};
export type SyncQueueDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.SyncQueueSelect<ExtArgs> | null;
    omit?: Prisma.SyncQueueOmit<ExtArgs> | null;
    where: Prisma.SyncQueueWhereUniqueInput;
};
export type SyncQueueDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.SyncQueueWhereInput;
    limit?: number;
};
export type SyncQueueDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.SyncQueueSelect<ExtArgs> | null;
    omit?: Prisma.SyncQueueOmit<ExtArgs> | null;
};
