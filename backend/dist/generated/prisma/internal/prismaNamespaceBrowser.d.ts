import * as runtime from "@prisma/client/runtime/index-browser";
export type * from '../models.js';
export type * from './prismaNamespace.js';
export declare const Decimal: typeof runtime.Decimal;
export declare const NullTypes: {
    DbNull: (new (secret: never) => typeof runtime.DbNull);
    JsonNull: (new (secret: never) => typeof runtime.JsonNull);
    AnyNull: (new (secret: never) => typeof runtime.AnyNull);
};
export declare const DbNull: any;
export declare const JsonNull: any;
export declare const AnyNull: any;
export declare const ModelName: {
    readonly User: "User";
    readonly Object: "Object";
    readonly ZeroReport: "ZeroReport";
    readonly Period: "Period";
    readonly PeriodFact: "PeriodFact";
    readonly SyncQueue: "SyncQueue";
    readonly SlaEvent: "SlaEvent";
    readonly AuditLog: "AuditLog";
};
export type ModelName = (typeof ModelName)[keyof typeof ModelName];
export declare const TransactionIsolationLevel: {
    readonly ReadUncommitted: "ReadUncommitted";
    readonly ReadCommitted: "ReadCommitted";
    readonly RepeatableRead: "RepeatableRead";
    readonly Serializable: "Serializable";
};
export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel];
export declare const UserScalarFieldEnum: {
    readonly id: "id";
    readonly email: "email";
    readonly role: "role";
    readonly name: "name";
    readonly createdAt: "createdAt";
};
export type UserScalarFieldEnum = (typeof UserScalarFieldEnum)[keyof typeof UserScalarFieldEnum];
export declare const ObjectScalarFieldEnum: {
    readonly id: "id";
    readonly name: "name";
    readonly address: "address";
    readonly createdAt: "createdAt";
};
export type ObjectScalarFieldEnum = (typeof ObjectScalarFieldEnum)[keyof typeof ObjectScalarFieldEnum];
export declare const ZeroReportScalarFieldEnum: {
    readonly id: "id";
    readonly objectId: "objectId";
    readonly status: "status";
    readonly createdBy: "createdBy";
    readonly approvedAt: "approvedAt";
    readonly createdAt: "createdAt";
};
export type ZeroReportScalarFieldEnum = (typeof ZeroReportScalarFieldEnum)[keyof typeof ZeroReportScalarFieldEnum];
export declare const PeriodScalarFieldEnum: {
    readonly id: "id";
    readonly objectId: "objectId";
    readonly periodNumber: "periodNumber";
    readonly status: "status";
    readonly openedBy: "openedBy";
    readonly openedAt: "openedAt";
    readonly closedAt: "closedAt";
};
export type PeriodScalarFieldEnum = (typeof PeriodScalarFieldEnum)[keyof typeof PeriodScalarFieldEnum];
export declare const PeriodFactScalarFieldEnum: {
    readonly id: "id";
    readonly periodId: "periodId";
    readonly workLineageId: "workLineageId";
    readonly scVolume: "scVolume";
    readonly gpVolume: "gpVolume";
    readonly updatedAt: "updatedAt";
    readonly updatedBy: "updatedBy";
};
export type PeriodFactScalarFieldEnum = (typeof PeriodFactScalarFieldEnum)[keyof typeof PeriodFactScalarFieldEnum];
export declare const SyncQueueScalarFieldEnum: {
    readonly id: "id";
    readonly periodId: "periodId";
    readonly workLineageId: "workLineageId";
    readonly clientTimestamp: "clientTimestamp";
    readonly value: "value";
    readonly status: "status";
    readonly conflictData: "conflictData";
    readonly resolvedNote: "resolvedNote";
    readonly createdAt: "createdAt";
    readonly updatedAt: "updatedAt";
};
export type SyncQueueScalarFieldEnum = (typeof SyncQueueScalarFieldEnum)[keyof typeof SyncQueueScalarFieldEnum];
export declare const SlaEventScalarFieldEnum: {
    readonly id: "id";
    readonly periodId: "periodId";
    readonly eventType: "eventType";
    readonly scenario: "scenario";
    readonly scheduledAt: "scheduledAt";
    readonly executedAt: "executedAt";
    readonly createdAt: "createdAt";
};
export type SlaEventScalarFieldEnum = (typeof SlaEventScalarFieldEnum)[keyof typeof SlaEventScalarFieldEnum];
export declare const AuditLogScalarFieldEnum: {
    readonly id: "id";
    readonly periodId: "periodId";
    readonly actorId: "actorId";
    readonly action: "action";
    readonly payload: "payload";
    readonly createdAt: "createdAt";
};
export type AuditLogScalarFieldEnum = (typeof AuditLogScalarFieldEnum)[keyof typeof AuditLogScalarFieldEnum];
export declare const SortOrder: {
    readonly asc: "asc";
    readonly desc: "desc";
};
export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder];
export declare const NullableJsonNullValueInput: {
    readonly DbNull: any;
    readonly JsonNull: any;
};
export type NullableJsonNullValueInput = (typeof NullableJsonNullValueInput)[keyof typeof NullableJsonNullValueInput];
export declare const QueryMode: {
    readonly default: "default";
    readonly insensitive: "insensitive";
};
export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode];
export declare const NullsOrder: {
    readonly first: "first";
    readonly last: "last";
};
export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder];
export declare const JsonNullValueFilter: {
    readonly DbNull: any;
    readonly JsonNull: any;
    readonly AnyNull: any;
};
export type JsonNullValueFilter = (typeof JsonNullValueFilter)[keyof typeof JsonNullValueFilter];
