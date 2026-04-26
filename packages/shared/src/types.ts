// Shared TypeScript enums and types for CCIP platform
// Used across apps/api, apps/web, apps/mobile

// ─── User Roles ─────────────────────────────────────────────────────────────

export enum UserRole {
  Stroycontrol = 'stroycontrol',
  Director = 'director',
  Admin = 'admin',
}

// ─── Object Status ───────────────────────────────────────────────────────────

export enum ObjectStatus {
  Active = 'active',
  Completed = 'completed',
  Suspended = 'suspended',
}

// ─── Participant Roles ────────────────────────────────────────────────────────

export enum ParticipantRole {
  GeneralContractor = 'general_contractor',
  Developer = 'developer',
  Designer = 'designer',
  StroycontrolOrg = 'stroycontrol_org',
}

// ─── BoQ ─────────────────────────────────────────────────────────────────────

export enum BoqChangeType {
  Initial = 'initial',
  Volume = 'volume',
  Cost = 'cost',
  Structural = 'structural',
}

export enum BoqItemStatus {
  Active = 'active',
  ExcludedFromScope = 'excluded_from_scope',
}

// ─── Zero Report ──────────────────────────────────────────────────────────────

export enum ZeroReportStatus {
  Draft = 'draft',
  PendingApproval = 'pending_approval',
  Approved = 'approved',
  Rejected = 'rejected',
}

export enum ZeroReportItemSource {
  FieldMeasurement = 'field_measurement',
  ExecDocs = 'exec_docs',
  Ks2 = 'ks2',
}

// ─── Period ───────────────────────────────────────────────────────────────────

export enum PeriodStatus {
  Open = 'open',
  WaitingGp = 'waiting_gp',
  Verifying = 'verifying',
  Closed = 'closed',
  ForceClosed = 'force_closed',
}

export enum ZeroPeriodReason {
  Weather = 'weather',
  DesignChange = 'design_change',
  PermitSuspension = 'permit_suspension',
  FinancingPause = 'financing_pause',
  ForceMajeure = 'force_majeure',
  Seasonal = 'seasonal',
}

// ─── Discrepancy ──────────────────────────────────────────────────────────────

export enum DiscrepancyType {
  Type1 = 1,
  Type2 = 2,
}

export enum DiscrepancyStatus {
  Open = 'open',
  ScOverride = 'sc_override',
  DirectorResolved = 'director_resolved',
  ForcedScFigure = 'forced_sc_figure',
  Cancelled = 'cancelled',
}

// ─── Spike Response ───────────────────────────────────────────────────────────

export enum SpikeResponse {
  PlannedConcentration = 'planned_concentration',
  InputError = 'input_error',
  NoReaction = 'no_reaction',
}

// ─── SLA ─────────────────────────────────────────────────────────────────────

export enum SlaScenario {
  A = 'A',
  B = 'B',
}

export enum SlaEventType {
  NotifyDirectorDay3 = 'notify_director_day3',
  ForceCloseDay5 = 'force_close_day5',
  DirectorDeadlineDay7 = 'director_deadline_day7',
  ScFigureAppliedDay14 = 'sc_figure_applied_day14',
}

// ─── Sync ────────────────────────────────────────────────────────────────────

export enum SyncOperation {
  SubmitFact = 'submit_fact',
  UploadPhoto = 'upload_photo',
  SubmitGpTemplate = 'submit_gp_template',
  AddDiscrepancyNote = 'add_discrepancy_note',
  OpenPeriod = 'open_period',
  ClosePeriod = 'close_period',
}

export enum SyncStatus {
  Pending = 'pending',
  Applied = 'applied',
  Conflict = 'conflict',
  Rejected = 'rejected',
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export enum AuditAction {
  Insert = 'insert',
  Update = 'update',
  Delete = 'delete',
  AdminCorrection = 'admin_correction',
  ForceClose = 'force_close',
}

// ─── Baseline Update ──────────────────────────────────────────────────────────

export enum BaselineUpdateStatus {
  Pending = 'pending',
  Approved = 'approved',
  Rejected = 'rejected',
}

// ─── Documents ────────────────────────────────────────────────────────────────

export enum L2DocumentType {
  Ssr = 'ssr',
  Rdc = 'rdc',
  CalendarPlan = 'calendar_plan',
  Other = 'other',
}

// ─── System Config ────────────────────────────────────────────────────────────

export enum SystemConfigValueType {
  Numeric = 'numeric',
  Text = 'text',
  Boolean = 'boolean',
}

// Well-known system config keys (L0 parameters)
export enum SystemConfigKey {
  NFlagThreshold = 'N_flag_threshold',
  MFlagWindow = 'M_flag_window',
  WeightThreshold = 'weight_threshold',
  ForecastGapAlert = 'forecast_gap_alert',
  ToleranceThreshold = 'tolerance_threshold',
  OverrunWarningLimit = 'overrun_warning_limit',
  AvgPacePeriods = 'avg_pace_periods',
  DecayFactor = 'decay_factor',
  SpikeThreshold = 'spike_threshold',
  ZeroReportAlertDays = 'zero_report_alert_days',
  BaselineCorrectionThreshold = 'baseline_correction_threshold',
}

// ─── Device Tokens ────────────────────────────────────────────────────────────

export enum DevicePlatform {
  Android = 'android',
  Ios = 'ios',
}

// ─── Org Plans ────────────────────────────────────────────────────────────────

export enum OrgPlan {
  Starter = 'starter',
  Professional = 'professional',
  Enterprise = 'enterprise',
}
