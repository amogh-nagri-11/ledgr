// Invoices and payouts.
//
// Two populations, because they do different jobs:
//
//   LIVE       hand-authored, dated relative to today. These carry the
//              document-reasoning difficulty -- which agreement governs, when
//              the clock started. Small enough to inspect by eye.
//
//   HISTORICAL FY 2025-26, generated from a fixed seed. These carry the
//              classification difficulty at volume: coverage has to be judged
//              as at the supply date, so a vendor that was reclassified or
//              whose registration lapsed mid-year flips part way through its
//              own invoice run. This is what the retroactive audit reconstructs.
//
// The seed is fixed and the generator is pure, so the corpus regenerates
// identically. Hand it to a panel and let them re-run it.

import { addDays, today } from '../engine/dates.js';

const T = today();
const ago = (n) => addDays(T, -n);
const ahead = (n) => addDays(T, n);

// ---------------------------------------------------------------------------
// Live payables
// ---------------------------------------------------------------------------

export const liveInvoices = [
  { id: 'INV-4101', vendorId: 'V001', amount: 500000, invoiceDate: ago(52), description: 'MS plate, 14 MT' },
  { id: 'INV-4102', vendorId: 'V002', amount: 275000, invoiceDate: ago(48), description: 'Machined components, batch 22' },
  { id: 'INV-4103', vendorId: 'V003', amount:  64000, invoiceDate: ago(14), description: 'Corrugated cartons, 3000 nos' },
  { id: 'INV-4104', vendorId: 'V004', amount: 185000, invoiceDate: ago(44), description: 'Freight, Ahmedabad lane' },
  { id: 'INV-4105', vendorId: 'V005', amount: 920000, invoiceDate: ago(33), description: 'CNC controller units, 2 nos' },
  { id: 'INV-4106', vendorId: 'V006', amount: 110000, invoiceDate: ago(26), description: 'Printed product catalogues, 5000 nos, 32pp' },
  { id: 'INV-4107', vendorId: 'V007', amount: 340000, invoiceDate: ago(21), description: 'TMT bars, 8 MT Fe 500D, bought in and resold' },
  { id: 'INV-4108', vendorId: 'V008', amount: 268000, invoiceDate: ago(19), description: 'Fabricated mounting brackets, 240 sets, made to drawing BK-118 rev C' },
  { id: 'INV-4109', vendorId: 'V009', amount: 152000, invoiceDate: ago(24), description: 'Cotton wiping cloth, 400 kg' },
  { id: 'INV-4110', vendorId: 'V010', amount: 430000, invoiceDate: ago(23), description: 'Pressed steel components, 1500 nos' },
  { id: 'INV-4111', vendorId: 'V011', amount:  96000, invoiceDate: ago(17), description: 'Laminated boards, 180 sheets' },
  { id: 'INV-4112', vendorId: 'V012', amount:  74000, invoiceDate: ago(28), description: 'Freight, Jaipur to Pune, 3 trips' },
  { id: 'INV-4113', vendorId: 'V013', amount:  31000, invoiceDate: ago(16), description: 'Assorted office stationery' },
  { id: 'INV-4114', vendorId: 'V014', amount: 128000, invoiceDate: ago(13), description: 'Carbide insert tooling, 60 sets, against PO 4417' },
  { id: 'INV-4115', vendorId: 'V015', amount: 610000, invoiceDate: ago(30), description: 'LT distribution panel' },
  { id: 'INV-4116', vendorId: 'V016', amount: 208000, invoiceDate: ago(20), description: 'Isopropyl alcohol, 12 drums' },
  { id: 'INV-4117', vendorId: 'V017', amount:  87000, invoiceDate: ago(22), description: 'Annual report booklets, 1200 nos' },
  { id: 'INV-4118', vendorId: 'V018', amount: 143000, invoiceDate: ago(27), description: 'Hull inspection call, Mormugao' },
  { id: 'INV-4119', vendorId: 'V019', amount: 119000, invoiceDate: ago(18), description: 'Seasoned hardwood planks, 60 cft' },
  { id: 'INV-4120', vendorId: 'V020', amount:  92000, invoiceDate: ago(38), description: 'Moulded rubber gaskets, 2000 nos' },
  { id: 'INV-4121', vendorId: 'V022', amount: 355000, invoiceDate: ago(41), description: 'Grey iron castings, 60 nos' },
  { id: 'INV-4122', vendorId: 'V023', amount:  67000, invoiceDate: ago(15), description: 'Fabricated clamps, 900 nos' },
  { id: 'INV-4123', vendorId: 'V024', amount: 412000, invoiceDate: ago(12), description: 'BOPP film, 40 reels, supplied as received from the overseas mill' },
  { id: 'INV-4124', vendorId: 'V001', amount: 236000, invoiceDate: ago(37), description: 'MS angle sections, 6 MT' },
  { id: 'INV-4125', vendorId: 'V021', amount:   8400, invoiceDate: ago(11), description: 'Assorted fasteners and fixings' },
].map((i) => ({ ...i, currency: 'INR', period: 'live' }));

/** RazorpayX payouts already booked against live invoices. */
export const livePayouts = {
  // Money is in motion, but it lands after the statutory deadline.
  'INV-4115': { payoutId: 'pout_SEEDlate4115', status: 'scheduled', date: ahead(9), amount: 610000, mode: 'NEFT', source: 'seed' },
  // Settled inside the deadline; the compliance item is closed.
  'INV-4120': { payoutId: 'pout_SEEDdone4120', status: 'processed', date: ago(4), amount: 92000, mode: 'NEFT', source: 'seed', utr: 'UTRSEED4120' },
};

// ---------------------------------------------------------------------------
// Historical ledger, FY 2025-26
// ---------------------------------------------------------------------------

export const CORPUS_SEED = 20260904;

/** mulberry32 -- small, fast, deterministic. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FY_START = '2025-04-01';
const FY_END = '2026-03-31';

/**
 * Vendors that appear in last year's ledger, with how many invoices each ran
 * and the goods/services they supplied. Deliberately weighted so the vendors
 * whose coverage CHANGES mid-year carry a lot of invoices -- that is where a
 * "classify by today's status" audit goes wrong at scale.
 */
const HISTORICAL_PROFILE = [
  { vendorId: 'V001', count: 14, min:  80000, max: 520000, what: 'MS plate and sections' },
  { vendorId: 'V002', count: 11, min: 120000, max: 380000, what: 'machined components' },
  { vendorId: 'V003', count:  9, min:  22000, max:  95000, what: 'corrugated packaging' },
  { vendorId: 'V004', count: 12, min:  45000, max: 210000, what: 'road freight' },
  { vendorId: 'V005', count:  6, min: 400000, max: 980000, what: 'machinery and spares' },
  { vendorId: 'V007', count: 13, min:  90000, max: 460000, what: 'steel, bought in and resold' },
  { vendorId: 'V008', count:  8, min:  70000, max: 300000, what: 'fabricated brackets' },
  { vendorId: 'V009', count: 15, min:  40000, max: 180000, what: 'cotton cloth and rags' },   // lapses 2026-03-31
  { vendorId: 'V010', count: 18, min: 150000, max: 540000, what: 'pressed steel components' }, // small -> medium 2026-01-15
  { vendorId: 'V012', count: 10, min:  28000, max: 110000, what: 'freight' },
  { vendorId: 'V013', count:  7, min:  12000, max:  46000, what: 'office stationery' },
  { vendorId: 'V014', count:  9, min:  55000, max: 190000, what: 'tooling' },
  { vendorId: 'V015', count:  5, min: 260000, max: 720000, what: 'electrical panels' },
  { vendorId: 'V016', count: 10, min:  90000, max: 240000, what: 'solvents' },
  { vendorId: 'V017', count:  8, min:  30000, max: 120000, what: 'print work' },
  { vendorId: 'V020', count:  7, min:  40000, max: 130000, what: 'rubber gaskets' },
  { vendorId: 'V021', count:  6, min:   9000, max:  38000, what: 'hardware and fixings' },
  { vendorId: 'V022', count:  9, min: 140000, max: 420000, what: 'iron castings' },
  { vendorId: 'V024', count:  8, min: 180000, max: 460000, what: 'packaging film' },
];

function daysBetweenISO(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

function buildHistorical(seed) {
  const rand = rng(seed);
  const span = daysBetweenISO(FY_START, FY_END);
  const invoices = [];
  const payouts = {};
  let n = 0;

  for (const profile of HISTORICAL_PROFILE) {
    for (let i = 0; i < profile.count; i += 1) {
      n += 1;
      const id = `INV-${3000 + n}`;

      // Spread supplies across the year, nudged so each vendor's run is not
      // clustered identically.
      const offset = Math.floor(((i + rand() * 0.9) / profile.count) * span);
      const acceptedOn = addDays(FY_START, offset);
      const invoiceDate = addDays(acceptedOn, Math.floor(rand() * 3));

      const amount = Math.round((profile.min + rand() * (profile.max - profile.min)) / 100) * 100;

      // Payment lag. Most are inside 45 days; a meaningful tail is not, which
      // is what creates the historical exposure the audit reconstructs.
      const r = rand();
      const lag = r < 0.55 ? 18 + Math.floor(rand() * 20)   // 18-37 comfortable
        : r < 0.78 ? 38 + Math.floor(rand() * 10)           // 38-47 borderline
          : r < 0.93 ? 48 + Math.floor(rand() * 25)         // 48-72 late
            : 73 + Math.floor(rand() * 40);                 // 73-112 badly late
      const paidOn = addDays(acceptedOn, lag);

      invoices.push({
        id,
        vendorId: profile.vendorId,
        amount,
        invoiceDate,
        acceptedOn,
        description: profile.what,
        currency: 'INR',
        period: 'historical',
      });

      payouts[id] = {
        payoutId: `pout_HIST${id.slice(4)}`,
        status: 'processed',
        date: paidOn,
        amount,
        mode: rand() < 0.8 ? 'NEFT' : 'IMPS',
        source: 'seed',
        utr: `UTRH${id.slice(4)}`,
      };
    }
  }

  invoices.sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate));
  return { invoices, payouts };
}

const historical = buildHistorical(CORPUS_SEED);

export const historicalInvoices = historical.invoices;
export const historicalPayouts = historical.payouts;

export const FINANCIAL_YEAR = { start: FY_START, end: FY_END, label: 'FY 2025-26' };

export const invoices = [...liveInvoices, ...historicalInvoices];
export const payouts = { ...livePayouts, ...historicalPayouts };

export const invoiceById = (id) => invoices.find((i) => i.id === id) || null;
