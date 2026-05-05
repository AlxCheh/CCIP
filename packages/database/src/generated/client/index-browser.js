
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.OrganizationScalarFieldEnum = {
  id: 'id',
  name: 'name',
  slug: 'slug',
  plan: 'plan',
  isActive: 'isActive',
  createdAt: 'createdAt'
};

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  email: 'email',
  name: 'name',
  role: 'role',
  passwordHash: 'passwordHash',
  isActive: 'isActive',
  createdAt: 'createdAt',
  organizationId: 'organizationId'
};

exports.Prisma.SystemConfigScalarFieldEnum = {
  key: 'key',
  organizationId: 'organizationId',
  valueType: 'valueType',
  valueNumeric: 'valueNumeric',
  valueText: 'valueText',
  description: 'description',
  updatedAt: 'updatedAt',
  updatedBy: 'updatedBy'
};

exports.Prisma.ConstructionObjectScalarFieldEnum = {
  id: 'id',
  name: 'name',
  objectClass: 'objectClass',
  address: 'address',
  permitNumber: 'permitNumber',
  permitDate: 'permitDate',
  constructionStart: 'constructionStart',
  connectionDate: 'connectionDate',
  status: 'status',
  createdAt: 'createdAt',
  createdBy: 'createdBy',
  organizationId: 'organizationId',
  summaryReportUrl: 'summaryReportUrl',
  summaryReportGeneratedAt: 'summaryReportGeneratedAt'
};

exports.Prisma.ObjectParticipantScalarFieldEnum = {
  id: 'id',
  objectId: 'objectId',
  participantRole: 'participantRole',
  orgName: 'orgName',
  contactPerson: 'contactPerson',
  contactEmail: 'contactEmail',
  validFrom: 'validFrom',
  validTo: 'validTo',
  isCurrent: 'isCurrent',
  changedReason: 'changedReason',
  changedAt: 'changedAt',
  changedBy: 'changedBy'
};

exports.Prisma.L2DocumentScalarFieldEnum = {
  id: 'id',
  objectId: 'objectId',
  docType: 'docType',
  version: 'version',
  filePath: 'filePath',
  uploadedAt: 'uploadedAt',
  uploadedBy: 'uploadedBy'
};

exports.Prisma.BoqVersionScalarFieldEnum = {
  id: 'id',
  objectId: 'objectId',
  versionNumber: 'versionNumber',
  changeType: 'changeType',
  changeReason: 'changeReason',
  changeDocument: 'changeDocument',
  createdAt: 'createdAt',
  createdBy: 'createdBy',
  approvedAt: 'approvedAt',
  approvedBy: 'approvedBy',
  isActive: 'isActive'
};

exports.Prisma.BoqItemScalarFieldEnum = {
  id: 'id',
  boqVersionId: 'boqVersionId',
  workLineageId: 'workLineageId',
  workCode: 'workCode',
  name: 'name',
  unit: 'unit',
  planVolume: 'planVolume',
  contractValue: 'contractValue',
  weightCoef: 'weightCoef',
  isCritical: 'isCritical',
  status: 'status',
  predecessorItemId: 'predecessorItemId'
};

exports.Prisma.BoqItemLineageLinkScalarFieldEnum = {
  sourceItemId: 'sourceItemId',
  lineageId: 'lineageId',
  weight: 'weight',
  createdAt: 'createdAt'
};

exports.Prisma.ZeroReportScalarFieldEnum = {
  id: 'id',
  objectId: 'objectId',
  boqVersionId: 'boqVersionId',
  status: 'status',
  submittedAt: 'submittedAt',
  submittedBy: 'submittedBy',
  approvedAt: 'approvedAt',
  approvedBy: 'approvedBy',
  alertSentAt: 'alertSentAt',
  notes: 'notes'
};

exports.Prisma.ZeroReportItemScalarFieldEnum = {
  id: 'id',
  zeroReportId: 'zeroReportId',
  boqItemId: 'boqItemId',
  factVolume: 'factVolume',
  source: 'source',
  doc1Value: 'doc1Value',
  doc2Value: 'doc2Value',
  doc3Value: 'doc3Value',
  crossVerified: 'crossVerified',
  notes: 'notes'
};

exports.Prisma.PeriodScalarFieldEnum = {
  id: 'id',
  objectId: 'objectId',
  periodNumber: 'periodNumber',
  boqVersionId: 'boqVersionId',
  status: 'status',
  openedAt: 'openedAt',
  openedBy: 'openedBy',
  gpTemplateSentAt: 'gpTemplateSentAt',
  gpSubmissionToken: 'gpSubmissionToken',
  gpTokenExpiresAt: 'gpTokenExpiresAt',
  gpSubmittedAt: 'gpSubmittedAt',
  gpSubmittedByName: 'gpSubmittedByName',
  siteVisitAt: 'siteVisitAt',
  siteVisitBy: 'siteVisitBy',
  closedAt: 'closedAt',
  closedBy: 'closedBy',
  isZeroPeriod: 'isZeroPeriod',
  zeroPeriodReason: 'zeroPeriodReason',
  reportUrl: 'reportUrl',
  reportGeneratedAt: 'reportGeneratedAt',
  reportGenerationFailed: 'reportGenerationFailed'
};

exports.Prisma.PeriodFactScalarFieldEnum = {
  id: 'id',
  periodId: 'periodId',
  boqItemId: 'boqItemId',
  gpVolume: 'gpVolume',
  gpNote: 'gpNote',
  scVolume: 'scVolume',
  acceptedVolume: 'acceptedVolume',
  discrepancyType: 'discrepancyType',
  discrepancyStatus: 'discrepancyStatus',
  overrunPct: 'overrunPct',
  overrunNote: 'overrunNote',
  isSpike: 'isSpike',
  spikeResponse: 'spikeResponse',
  version: 'version'
};

exports.Prisma.DiscrepancyScalarFieldEnum = {
  id: 'id',
  periodFactId: 'periodFactId',
  type: 'type',
  status: 'status',
  gpPosition: 'gpPosition',
  scPosition: 'scPosition',
  directorDecision: 'directorDecision',
  resolvedAt: 'resolvedAt',
  resolvedBy: 'resolvedBy',
  createdAt: 'createdAt'
};

exports.Prisma.PhotoScalarFieldEnum = {
  id: 'id',
  periodId: 'periodId',
  boqItemId: 'boqItemId',
  filePath: 'filePath',
  takenAt: 'takenAt',
  uploadedBy: 'uploadedBy',
  createdAt: 'createdAt'
};

exports.Prisma.SlaEventScalarFieldEnum = {
  id: 'id',
  periodId: 'periodId',
  boqItemId: 'boqItemId',
  scenario: 'scenario',
  eventType: 'eventType',
  scheduledAt: 'scheduledAt',
  executedAt: 'executedAt',
  isCancelled: 'isCancelled'
};

exports.Prisma.NotificationScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  type: 'type',
  referenceTable: 'referenceTable',
  referenceId: 'referenceId',
  message: 'message',
  createdAt: 'createdAt',
  readAt: 'readAt'
};

exports.Prisma.ReadinessSnapshotScalarFieldEnum = {
  id: 'id',
  periodId: 'periodId',
  objectId: 'objectId',
  objectReadinessPct: 'objectReadinessPct',
  weightedForecastDate: 'weightedForecastDate',
  criticalPathForecastDate: 'criticalPathForecastDate',
  gapFlag: 'gapFlag',
  calculatedAt: 'calculatedAt'
};

exports.Prisma.WorkPaceScalarFieldEnum = {
  id: 'id',
  periodId: 'periodId',
  boqItemId: 'boqItemId',
  periodVolume: 'periodVolume',
  weightedPace: 'weightedPace',
  isExcluded: 'isExcluded'
};

exports.Prisma.BaselineUpdateRequestScalarFieldEnum = {
  id: 'id',
  objectId: 'objectId',
  boqItemId: 'boqItemId',
  requestedBy: 'requestedBy',
  requestedAt: 'requestedAt',
  oldPlanVolume: 'oldPlanVolume',
  newPlanVolume: 'newPlanVolume',
  reason: 'reason',
  supportingDocument: 'supportingDocument',
  status: 'status',
  reviewedBy: 'reviewedBy',
  reviewedAt: 'reviewedAt',
  reviewNotes: 'reviewNotes',
  appliesFromPeriodId: 'appliesFromPeriodId'
};

exports.Prisma.ForecastScenarioScalarFieldEnum = {
  id: 'id',
  objectId: 'objectId',
  scenarioName: 'scenarioName',
  parameters: 'parameters',
  completionDate: 'completionDate',
  notes: 'notes',
  createdAt: 'createdAt',
  createdBy: 'createdBy'
};

exports.Prisma.MlFeatureScalarFieldEnum = {
  id: 'id',
  objectId: 'objectId',
  periodId: 'periodId',
  featureSet: 'featureSet',
  label: 'label',
  modelVersion: 'modelVersion',
  createdAt: 'createdAt'
};

exports.Prisma.AuditLogScalarFieldEnum = {
  id: 'id',
  tableName: 'tableName',
  recordId: 'recordId',
  action: 'action',
  oldData: 'oldData',
  newData: 'newData',
  performedBy: 'performedBy',
  performedAt: 'performedAt',
  reason: 'reason',
  organizationId: 'organizationId'
};

exports.Prisma.SyncQueueScalarFieldEnum = {
  id: 'id',
  deviceId: 'deviceId',
  userId: 'userId',
  operation: 'operation',
  payload: 'payload',
  clientTimestamp: 'clientTimestamp',
  serverReceivedAt: 'serverReceivedAt',
  status: 'status',
  conflictData: 'conflictData',
  resolvedAt: 'resolvedAt',
  resolvedBy: 'resolvedBy',
  lastKnownVersion: 'lastKnownVersion',
  boqVersionNumber: 'boqVersionNumber',
  isSyncing: 'isSyncing'
};

exports.Prisma.MvRefreshLogScalarFieldEnum = {
  viewName: 'viewName',
  refreshedAt: 'refreshedAt',
  periodId: 'periodId',
  isStale: 'isStale'
};

exports.Prisma.RefreshTokenScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  tokenHash: 'tokenHash',
  issuedAt: 'issuedAt',
  expiresAt: 'expiresAt',
  revokedAt: 'revokedAt',
  userAgent: 'userAgent',
  ipAddress: 'ipAddress'
};

exports.Prisma.DeviceTokenScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  fcmToken: 'fcmToken',
  platform: 'platform',
  deviceId: 'deviceId',
  registeredAt: 'registeredAt',
  isActive: 'isActive'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};


exports.Prisma.ModelName = {
  Organization: 'Organization',
  User: 'User',
  SystemConfig: 'SystemConfig',
  ConstructionObject: 'ConstructionObject',
  ObjectParticipant: 'ObjectParticipant',
  L2Document: 'L2Document',
  BoqVersion: 'BoqVersion',
  BoqItem: 'BoqItem',
  BoqItemLineageLink: 'BoqItemLineageLink',
  ZeroReport: 'ZeroReport',
  ZeroReportItem: 'ZeroReportItem',
  Period: 'Period',
  PeriodFact: 'PeriodFact',
  Discrepancy: 'Discrepancy',
  Photo: 'Photo',
  SlaEvent: 'SlaEvent',
  Notification: 'Notification',
  ReadinessSnapshot: 'ReadinessSnapshot',
  WorkPace: 'WorkPace',
  BaselineUpdateRequest: 'BaselineUpdateRequest',
  ForecastScenario: 'ForecastScenario',
  MlFeature: 'MlFeature',
  AuditLog: 'AuditLog',
  SyncQueue: 'SyncQueue',
  MvRefreshLog: 'MvRefreshLog',
  RefreshToken: 'RefreshToken',
  DeviceToken: 'DeviceToken'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
