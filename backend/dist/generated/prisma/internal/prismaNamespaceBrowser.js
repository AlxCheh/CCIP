"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonNullValueFilter = exports.NullsOrder = exports.QueryMode = exports.NullableJsonNullValueInput = exports.SortOrder = exports.AuditLogScalarFieldEnum = exports.SlaEventScalarFieldEnum = exports.SyncQueueScalarFieldEnum = exports.PeriodFactScalarFieldEnum = exports.PeriodScalarFieldEnum = exports.ZeroReportScalarFieldEnum = exports.ObjectScalarFieldEnum = exports.UserScalarFieldEnum = exports.TransactionIsolationLevel = exports.ModelName = exports.AnyNull = exports.JsonNull = exports.DbNull = exports.NullTypes = exports.Decimal = void 0;
const runtime = __importStar(require("@prisma/client/runtime/index-browser"));
exports.Decimal = runtime.Decimal;
exports.NullTypes = {
    DbNull: runtime.NullTypes.DbNull,
    JsonNull: runtime.NullTypes.JsonNull,
    AnyNull: runtime.NullTypes.AnyNull,
};
exports.DbNull = runtime.DbNull;
exports.JsonNull = runtime.JsonNull;
exports.AnyNull = runtime.AnyNull;
exports.ModelName = {
    User: 'User',
    Object: 'Object',
    ZeroReport: 'ZeroReport',
    Period: 'Period',
    PeriodFact: 'PeriodFact',
    SyncQueue: 'SyncQueue',
    SlaEvent: 'SlaEvent',
    AuditLog: 'AuditLog'
};
exports.TransactionIsolationLevel = runtime.makeStrictEnum({
    ReadUncommitted: 'ReadUncommitted',
    ReadCommitted: 'ReadCommitted',
    RepeatableRead: 'RepeatableRead',
    Serializable: 'Serializable'
});
exports.UserScalarFieldEnum = {
    id: 'id',
    email: 'email',
    role: 'role',
    name: 'name',
    createdAt: 'createdAt'
};
exports.ObjectScalarFieldEnum = {
    id: 'id',
    name: 'name',
    address: 'address',
    createdAt: 'createdAt'
};
exports.ZeroReportScalarFieldEnum = {
    id: 'id',
    objectId: 'objectId',
    status: 'status',
    createdBy: 'createdBy',
    approvedAt: 'approvedAt',
    createdAt: 'createdAt'
};
exports.PeriodScalarFieldEnum = {
    id: 'id',
    objectId: 'objectId',
    periodNumber: 'periodNumber',
    status: 'status',
    openedBy: 'openedBy',
    openedAt: 'openedAt',
    closedAt: 'closedAt'
};
exports.PeriodFactScalarFieldEnum = {
    id: 'id',
    periodId: 'periodId',
    workLineageId: 'workLineageId',
    scVolume: 'scVolume',
    gpVolume: 'gpVolume',
    updatedAt: 'updatedAt',
    updatedBy: 'updatedBy'
};
exports.SyncQueueScalarFieldEnum = {
    id: 'id',
    periodId: 'periodId',
    workLineageId: 'workLineageId',
    clientTimestamp: 'clientTimestamp',
    value: 'value',
    status: 'status',
    conflictData: 'conflictData',
    resolvedNote: 'resolvedNote',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
};
exports.SlaEventScalarFieldEnum = {
    id: 'id',
    periodId: 'periodId',
    eventType: 'eventType',
    scenario: 'scenario',
    scheduledAt: 'scheduledAt',
    executedAt: 'executedAt',
    createdAt: 'createdAt'
};
exports.AuditLogScalarFieldEnum = {
    id: 'id',
    periodId: 'periodId',
    actorId: 'actorId',
    action: 'action',
    payload: 'payload',
    createdAt: 'createdAt'
};
exports.SortOrder = {
    asc: 'asc',
    desc: 'desc'
};
exports.NullableJsonNullValueInput = {
    DbNull: exports.DbNull,
    JsonNull: exports.JsonNull
};
exports.QueryMode = {
    default: 'default',
    insensitive: 'insensitive'
};
exports.NullsOrder = {
    first: 'first',
    last: 'last'
};
exports.JsonNullValueFilter = {
    DbNull: exports.DbNull,
    JsonNull: exports.JsonNull,
    AnyNull: exports.AnyNull
};
//# sourceMappingURL=prismaNamespaceBrowser.js.map