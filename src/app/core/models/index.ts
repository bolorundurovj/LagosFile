export interface Taxpayer {
  id: string;
  fullName: string;
  tin: string;
  address?: string;
  phone?: string;
  email?: string;
  filingAgent?: string;
  createdAt: string;
}

export type FilingStatus = 'Draft' | 'Confirmed' | 'Submitted';

export interface Filing {
  id: string;
  taxpayerId: string;
  parentFilingId?: string;
  yearOfAssessment: number;
  status: FilingStatus;
  filingReference?: string;
  createdAt: string;
  confirmedAt?: string;
  totalIncomeNgn?: number;
  chargeableIncome?: number;
  taxPayable?: number;
  whtCredit?: number;
  netTaxPayable?: number;
  minimumTax?: number;
  finalTaxPayable?: number;
  taxConfigVersion: string;
}

export type IncomeType =
  | 'employment'
  | 'business'
  | 'rental'
  | 'dividend'
  | 'interest'
  | 'capital_gain_shares'
  | 'digital_asset'
  | 'royalty'
  | 'prize'
  | 'other';

export type FxRateSource = 'fawazahmed0' | 'exchangerate-api' | 'cache' | 'manual' | 'cbn_override';

export interface IncomeEntry {
  id: string;
  filingId: string;
  incomeType: IncomeType;
  description?: string;
  grossAmountNgn: number;
  isForeign: boolean;
  foreignCurrency?: string;
  foreignAmount?: number;
  incomeDate?: string;
  fxRateFetched?: number;
  fxRateCbnOverride?: number;
  fxRateUsed?: number;
  fxRateSource?: FxRateSource;
  foreignTaxPaidNgn?: number;
  isCgtExempt: boolean;
  cgtProceeds?: number;
  cgtGain?: number;
  documents: Document[];
}

export type AssetType =
  | 'computer_laptop'
  | 'router_networking'
  | 'monitor'
  | 'keyboard_peripherals'
  | 'camera_recording'
  | 'software_licence'
  | 'other';

export interface CapitalAllowance {
  id: string;
  filingId: string;
  assetDescription: string;
  assetType: AssetType;
  assetCost: number;
  acquisitionDate: string;
  taxWrittenDownValue: number;
  annualAllowanceRate: number;
  annualAllowanceAmount: number;
  documents: Document[];
}

export type ReliefType =
  | 'pension'
  | 'nhis'
  | 'nhf'
  | 'rent'
  | 'wht'
  | 'life_assurance'
  | 'foreign_tax'
  | 'other_approved';

export interface ReliefEntry {
  id: string;
  filingId: string;
  reliefType: ReliefType;
  claimedAmount: number;
  approvedAmount: number;
  whtRef?: string;
  whtIncomeType?: string;
  whtDate?: string;
  documents: Document[];
}

export interface Document {
  id: string;
  parentEntryId: string;
  parentEntryType: 'income_entry' | 'capital_allowance' | 'relief_entry';
  filePath: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  uploadedAt: string;
}

export interface FxCache {
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  rateDate: string;
  source: string;
  fetchedAt: string;
}

export interface TaxBand {
  lower: number;
  upper: number | null;
  rate: number;
}

export interface TaxConfig {
  id: string;
  versionLabel: string;
  governedBy: string;
  bands: TaxBand[];
  reliefCaps: {
    rentReliefCap: number;
    rentReliefRate: number;
  };
  cgtThresholds: {
    proceedsThreshold: number;
    gainThreshold: number;
  };
  allowanceRates: Record<string, number>;
  minimumTaxRate: number;
  isActive: boolean;
  lastModified: string;
  modifiedBy: string;
}

export interface BandResult {
  lower: number;
  upper: number | null;
  rate: number;
  taxableAmount: number;
  taxAmount: number;
}

export interface ComputationResult {
  totalGrossIncome: number;
  totalCapitalAllowances: number;
  proratedCapitalAllowances: number;
  totalDeductions: number;
  chargeableIncome: number;
  bandBreakdown: BandResult[];
  graduatedTax: number;
  whtCredits: number;
  netTaxPayable: number;
  minimumTax: number;
  finalTaxPayable: number;
  cgtExemptAmount: number;
  digitalAssetLossRingfenced: number;
  configVersion: string;
  rentReliefApplied: number;
}

export interface FxResult {
  rate: number | null;
  source: FxRateSource;
  rateDate: string;
  isCached: boolean;
  cacheDate?: string;
}

export interface AppSession {
  isUnlocked: boolean;
  taxpayerId?: string;
  taxpayer?: Taxpayer;
}

export interface WizardState {
  filingId?: string;
  yearOfAssessment: number;
  currentStep: 1 | 2 | 3 | 4;
  incomeEntries: IncomeEntry[];
  capitalAllowances: CapitalAllowance[];
  reliefEntries: ReliefEntry[];
  isDirty: boolean;
}

export interface AppStatus {
  hasDb: boolean;
  hasProfile: boolean;
  hasRecovery: boolean;
  biometricAvailable: boolean;
  biometricEnabled: boolean;
}

export interface LIRSAutomationResult {
  success: boolean;
  fallbackActive: boolean;
  message: string;
  pendingFilingPath?: string;
  filingId: string;
}

export interface LIRSFieldItem {
  label: string;
  value: string | number;
  copyText: string;
  description?: string;
}

export interface LIRSFieldGroup {
  section: string;
  fields: LIRSFieldItem[];
}
