import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { payeSummary } from 'nigeria-paye';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TAURI_DIR = join(ROOT, 'src-tauri');

// Deterministic Mulberry32 PRNG so failures are reproducible
function createRng(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = createRng(20250626);
const cases = [];

// 1. Deterministic edge cases around NTA 2025 band boundaries & rent relief cap
const edgeAnnualIncomes = [
  0, 300_000, 750_000, 800_000, 800_004, 1_500_000, 3_000_000, 5_000_000,
  12_000_000, 25_000_000, 50_000_000, 60_000_000, 120_000_000,
];
for (const annual of edgeAnnualIncomes) {
  const grossMonthly = annual / 12;
  cases.push({ grossMonthly, opts: { pension: false, nhf: false, nhis: 0, annualRent: 0 } });
  cases.push({ grossMonthly, opts: { pension: true, nhf: true, nhis: 5_000, annualRent: 2_500_000 } });
  cases.push({ grossMonthly, opts: { pension: true, nhf: false, nhis: 0, annualRent: 4_000_000 } });
}

// 2. 300 seeded random employment-only inputs across Nigerian income brackets
for (let i = 0; i < 300; i++) {
  // Log-uniform-ish spread from ₦20k/mo to ₦10m/mo so low, mid, and high brackets are all well-sampled
  const exp = 4.3 + rng() * 2.7; // 10^4.3 (~20k) to 10^7.0 (10m)
  const grossMonthly = Math.round(Math.pow(10, exp));
  const pension = rng() > 0.25;
  const nhf = rng() > 0.5;
  const nhis = rng() > 0.5 ? Math.round(rng() * 30_000) : 0;
  const annualRent = rng() > 0.3 ? Math.round(rng() * 5_000_000) : 0;
  const pensionable = pension && rng() > 0.5 ? Math.round(grossMonthly * (0.5 + rng() * 0.5)) : undefined;
  const basic = nhf && rng() > 0.5 ? Math.round((pensionable ?? grossMonthly) * (0.4 + rng() * 0.6)) : undefined;
  cases.push({
    grossMonthly,
    opts: { pension, nhf, nhis, annualRent, pensionable, basic },
  });
}

// Compute expected figures via nigeria-paye and construct matching annual inputs for Rust engine
const expected = [];
const rustInputs = [];
for (const c of cases) {
  const res = payeSummary(c.grossMonthly, c.opts);
  const pensionMonthly = res.deductions.find((d) => d.kind === 'pension')?.amount ?? 0;
  const nhfMonthly = res.deductions.find((d) => d.kind === 'nhf')?.amount ?? 0;
  const nhisMonthly = res.deductions.find((d) => d.kind === 'nhis')?.amount ?? 0;

  expected.push({
    grossMonthly: c.grossMonthly,
    opts: c.opts,
    chargeableAnnual: res.chargeableAnnual,
    annualPaye: res.paye.annual,
  });

  rustInputs.push({
    grossIncome: c.grossMonthly * 12,
    annualRent: c.opts.annualRent ?? 0,
    pension: pensionMonthly * 12,
    nhf: nhfMonthly * 12,
    nhis: nhisMonthly * 12,
    lifeAssurance: 0,
  });
}

// Run all cases through the Rust ComputationEngine in one batch
const proc = spawnSync(
  'cargo',
  ['run', '--quiet', '--example', 'compute_batch'],
  {
    cwd: TAURI_DIR,
    input: JSON.stringify(rustInputs),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  },
);

if (proc.status !== 0) {
  console.error('Rust compute_batch failed:\n', proc.stderr || proc.stdout);
  process.exit(proc.status ?? 1);
}

const rustOutputs = JSON.parse(proc.stdout.trim());
if (rustOutputs.length !== expected.length) {
  console.error(`Output length mismatch: expected ${expected.length}, got ${rustOutputs.length}`);
  process.exit(1);
}

const TOLERANCE_NGN = 1.0;
const failures = [];
let maxTaxDelta = 0;
let maxChargeableDelta = 0;

for (let i = 0; i < expected.length; i++) {
  const exp = expected[i];
  const got = rustOutputs[i];
  const chargeableDelta = Math.abs(got.chargeableIncome - exp.chargeableAnnual);
  const taxDelta = Math.abs(got.finalTaxPayable - exp.annualPaye);
  if (chargeableDelta > maxChargeableDelta) maxChargeableDelta = chargeableDelta;
  if (taxDelta > maxTaxDelta) maxTaxDelta = taxDelta;

  if (chargeableDelta > TOLERANCE_NGN || taxDelta > TOLERANCE_NGN) {
    failures.push({
      index: i,
      input: rustInputs[i],
      expectedChargeable: exp.chargeableAnnual,
      rustChargeable: got.chargeableIncome,
      expectedTax: exp.annualPaye,
      rustTax: got.finalTaxPayable,
      chargeableDelta,
      taxDelta,
    });
  }
}

if (failures.length > 0) {
  console.error(`PAYE cross-check FAILED: ${failures.length}/${expected.length} case(s) differed by more than ₦${TOLERANCE_NGN}`);
  console.error('First 5 failures:', JSON.stringify(failures.slice(0, 5), null, 2));
  process.exit(1);
}

console.log(
  `PAYE cross-check PASSED: ${expected.length} cases matched nigeria-paye@1.0.0 within ₦${TOLERANCE_NGN} ` +
  `(max chargeable delta: ₦${maxChargeableDelta.toFixed(4)}, max tax delta: ₦${maxTaxDelta.toFixed(4)}).`,
);
