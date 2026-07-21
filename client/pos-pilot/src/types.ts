export type Role = 'OWNER' | 'MANAGER' | 'STAFF' | 'SERVER';
export type SyncState = 'SYNCED' | 'PENDING' | 'SYNCING' | 'OFFLINE' | 'FAILED' | 'CONFLICT';
export type BillStatus = 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'MESITA';
export type PaymentRecordMethod = PaymentMethod | 'EXTERNAL';
export type PaymentStatus = 'PENDING' | 'CONFIRMED' | 'POS_REGISTERED' | 'MANUAL_REVIEW' | 'FAILED';

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
}

export interface RestaurantSummary {
  id: string;
  name: string;
  currency: string;
  timeZone: string;
  posConsoleEnabled: boolean;
  sandbox?: boolean;
}

export interface IntegrationStatus {
  status: 'CONNECTED' | 'DEGRADED' | 'OFFLINE' | 'DISABLED';
  label?: string;
  lastCheckedAt?: string | null;
  catalogLastSyncedAt?: string | null;
}

export interface DiningZone {
  id: string;
  name: string;
  sortOrder: number;
  active?: boolean;
}

export interface BillSummary {
  id: string;
  status: BillStatus;
  syncState: SyncState;
  totalCents: number;
  balanceCents: number;
  diners: number;
  remoteNumber?: string | null;
  editLocked?: boolean;
  conflictId?: string | null;
}

export interface DiningTable {
  id: string;
  zoneId: string;
  name: string;
  capacity: number;
  sortOrder: number;
  active?: boolean;
  activeBill?: BillSummary | null;
}

export interface CatalogProduct {
  id: string;
  externalId: string;
  name: string;
  category: string;
  priceCents: number;
  available: boolean;
  taxCode?: string | null;
}

export interface BillItem {
  id?: string;
  clientLineId: string;
  productId: string;
  externalProductId?: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents?: number;
  notes: string;
}

export interface BillTotals {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
}

export interface PaymentEligibility {
  eligible: boolean;
  reason?: string | null;
  verifiedAt?: string | null;
}

export interface PosConflict {
  id: string;
  detectedAt: string;
  reason: string;
  kind?: string | null;
  allowedActions?: ReadonlyArray<'ACCEPT_REMOTE' | 'RETRY_LOCAL'> | null;
  remoteSummary?: string | null;
}

export interface FiscalState {
  preNumber?: string | null;
  preStatus?: string | null;
  facNumber?: string | null;
  facStatus?: string | null;
  sriStatus?: string | null;
  sriAuthorizedAt?: string | null;
}

export interface PaymentRecord {
  id: string;
  method: PaymentRecordMethod | null;
  amountCents: number;
  status: PaymentStatus;
  providerStatus?: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED' | null;
  posRegistrationStatus?: 'PENDING' | 'REGISTERED' | 'RETRYABLE' | 'MANUAL_REVIEW' | null;
  source?: 'STAFF' | 'MESITA' | 'CONTIFICO' | null;
  idempotencyKey?: string | null;
  allowedActions?: ReadonlyArray<'ACCEPT_REMOTE' | 'RETRY_SAME'> | null;
  reconciliationRequired?: boolean;
  providerOutcomeAmbiguous?: boolean;
  registrationLeaseStale?: boolean;
  message?: string | null;
  manualReference?: string | null;
  posReference?: string | null;
  createdAt: string;
}

export interface Bill {
  id: string;
  tableId: string;
  revision: number;
  status: BillStatus;
  syncState: SyncState;
  diners: number;
  notes: string;
  items: BillItem[];
  totals: BillTotals;
  payments: PaymentRecord[];
  fiscal: FiscalState;
  remoteDocumentId?: string | null;
  remoteNumber?: string | null;
  remoteFingerprint?: string | null;
  lastSyncedAt?: string | null;
  firstPaymentAt?: string | null;
  editLocked: boolean;
  paymentEligibility?: PaymentEligibility | null;
  conflict?: PosConflict | null;
}

export interface PaymentMethodCapability {
  method: PaymentMethod;
  label: string;
  enabled: boolean;
  disabledReason?: string | null;
}

export interface BootstrapResponse {
  restaurant: RestaurantSummary;
  user: SessionUser;
  integration: IntegrationStatus;
  zones: DiningZone[];
  tables: DiningTable[];
  catalog: CatalogProduct[];
  paymentMethods: PaymentMethodCapability[];
}

export interface OrderDraft {
  diners: number;
  notes: string;
  items: BillItem[];
}

export interface SaveDraftRequest extends OrderDraft {
  expectedRevision: number;
}

export interface SettlementRequest {
  method: PaymentMethod;
  amountCents: number;
  manualReference?: string;
  idempotencyKey: string;
}

export interface SettlementResult {
  bill: Bill;
  payment: PaymentRecord;
  message?: string;
}

export interface HistoryRecord {
  id: string;
  tableName: string;
  openedAt: string;
  closedAt?: string | null;
  totalCents: number;
  pre: { number?: string | null; status?: string | null };
  payments: PaymentRecord[];
  fac: { number?: string | null; status?: string | null } | null;
  sri: { status?: string | null; authorizedAt?: string | null } | null;
}

export interface HistoryResponse {
  records: HistoryRecord[];
  nextCursor?: string | null;
}

export interface PrintSnapshot {
  verifiedAt: string;
  restaurant: { name: string; taxId?: string | null; address?: string | null };
  zone?: { name: string } | null;
  table: { name: string };
  bill: Bill;
  pre?: { number?: string | null; status?: string | null };
  payments?: PaymentRecord[];
  fiscal?: FiscalState;
}
