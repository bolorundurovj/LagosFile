// ── Field Mappings: LIRS Form A sections → filing data ────

/**
 * Define which fields to inject for each step of Form A.
 * Each mapping uses the selector strategy from field-selectors.js.
 *
 * Strategy priority: byName > byLabelText > byAriaLabel
 */
const FIELD_MAPPINGS = {
  income: [
    { finder: 'byName',       args: ['salary'],         field: 'income.employment' },
    { finder: 'byLabelText',  args: ['salary'],         field: 'income.employment' },
    { finder: 'byName',       args: ['business'],       field: 'income.business' },
    { finder: 'byLabelText',  args: ['business'],       field: 'income.business' },
    { finder: 'byName',       args: ['rental'],         field: 'income.rental' },
    { finder: 'byLabelText',  args: ['rental'],         field: 'income.rental' },
    { finder: 'byName',       args: ['dividend'],       field: 'income.dividend' },
    { finder: 'byLabelText',  args: ['dividend'],       field: 'income.dividend' },
    { finder: 'byName',       args: ['interest'],       field: 'income.interest' },
    { finder: 'byLabelText',  args: ['interest'],       field: 'income.interest' },
    { finder: 'byName',       args: ['capital'],        field: 'income.capitalGain' },
    { finder: 'byLabelText',  args: ['capital gain'],   field: 'income.capitalGain' },
    { finder: 'byName',       args: ['digital'],        field: 'income.digitalAsset' },
    { finder: 'byLabelText',  args: ['digital asset'],  field: 'income.digitalAsset' },
    { finder: 'byName',       args: ['royalty'],        field: 'income.royalty' },
    { finder: 'byLabelText',  args: ['royalty'],        field: 'income.royalty' },
    { finder: 'byName',       args: ['prize'],          field: 'income.prize' },
    { finder: 'byLabelText',  args: ['prize'],          field: 'income.prize' },
    { finder: 'byName',       args: ['other'],          field: 'income.other' },
    { finder: 'byLabelText',  args: ['other'],          field: 'income.other' },
    // Foreign income
    { finder: 'byLabelText',  args: ['foreign'],        field: 'income.foreignIncome.totalUsd' },
    { finder: 'byLabelText',  args: ['exchange rate'],   field: 'income.foreignIncome.fxRateUsed' },
  ],

  accommodation: [
    { finder: 'byLabelText',  args: ['accommodation'],  field: 'accommodation.type',    select: true },
    { finder: 'byLabelText',  args: ['ownership'],      field: 'accommodation.ownership', select: true },
    { finder: 'byName',       args: ['rentPaid'],       field: 'accommodation.rentPaid' },
    { finder: 'byLabelText',  args: ['rent paid'],      field: 'accommodation.rentPaid' },
    { finder: 'byName',       args: ['employerRent'],   field: 'accommodation.rentPaidByEmployer' },
    { finder: 'byLabelText',  args: ['employer'],       field: 'accommodation.rentPaidByEmployer' },
    { finder: 'byName',       args: ['dateStart'],      field: 'accommodation.dateStarted' },
    { finder: 'byLabelText',  args: ['start date'],     field: 'accommodation.dateStarted' },
    { finder: 'byName',       args: ['dateEnd'],        field: 'accommodation.dateEnd' },
    { finder: 'byLabelText',  args: ['end date'],       field: 'accommodation.dateEnd' },
  ],

  deductions: [
    { finder: 'byName',       args: ['pension'],        field: 'deductions.pension' },
    { finder: 'byLabelText',  args: ['pension'],        field: 'deductions.pension' },
    { finder: 'byName',       args: ['nhf'],            field: 'deductions.nhf' },
    { finder: 'byLabelText',  args: ['national housing fund'], field: 'deductions.nhf' },
    { finder: 'byName',       args: ['nhis'],           field: 'deductions.nhis' },
    { finder: 'byLabelText',  args: ['health insurance'], field: 'deductions.nhis' },
    { finder: 'byName',       args: ['life'],           field: 'deductions.lifeAssurance' },
    { finder: 'byLabelText',  args: ['life assurance'], field: 'deductions.lifeAssurance' },
  ],

  login: [
    { finder: 'byName',       args: ['payerId'],        field: 'taxpayer.payerId' },
    { finder: 'byLabelText',  args: ['payer id'],       field: 'taxpayer.payerId' },
    { finder: 'byName',       args: ['password'],       field: '__password__' },
    { finder: 'byLabelText',  args: ['password'],       field: '__password__' },
  ],
};

/**
 * Resolve a dotted path from the filing data object.
 * e.g. "income.foreignIncome.totalUsd" -> filingData.income.foreignIncome.totalUsd
 * @param {object} obj
 * @param {string} path
 * @returns {*}
 */
function resolveDataPath(obj, path) {
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
}

/**
 * Format the Payer ID with the correct prefix.
 * @param {string} tin
 * @param {string} [entityType='individual']
 * @returns {string}
 */
function formatPayerId(tin, entityType = 'individual') {
  const prefix = entityType === 'individual' ? 'N-' : 'C-';
  if (tin.startsWith('N-') || tin.startsWith('C-')) return tin;
  return `${prefix}${tin}`;
}

if (typeof window !== 'undefined') {
  window.__lirsMappings = { FIELD_MAPPINGS, resolveDataPath, formatPayerId };
}
