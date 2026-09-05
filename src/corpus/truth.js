// Ground truth. The reason the corpus is synthetic.
//
// Every claim the product makes to a panel is a claim about accuracy, and
// accuracy needs a correct answer to score against. Real vendor data does not
// come labelled -- getting labels would mean a CA sitting down with forty
// vendors. Constructing the corpus gives the labels for free, which is what
// makes the ablation in scripts/corpus-report.mjs measurable rather than
// asserted.
//
// `tests` on each entry names what that case defeats. If a case is not
// defeating anything, it is filler, and filler should be honest about it.

import { addDays, today } from '../engine/dates.js';

const T = today();
const ago = (n) => addDays(T, -n);

// ---------------------------------------------------------------------------
// Vendor-level truth
// ---------------------------------------------------------------------------
// `coverage` is the correct answer for a supply made TODAY. Where it depends
// on the date, `coverageAt` is a function and `coverage` is what it returns now.

export const vendorTruth = {
  V001: { udyam: 'UDYAM-MH-26-0041872', name: 'Sharma Enterprises Private Limited', activity: 'manufacturing', coverage: 'covered', tests: ['control'] },
  V002: { udyam: 'UDYAM-KA-03-0119265', name: 'Nandi Precision Components LLP', activity: 'manufacturing', coverage: 'covered', tests: ['control'] },
  V003: { udyam: 'UDYAM-TN-14-0087431', name: 'Aruna Packaging Solutions', activity: 'manufacturing', coverage: 'covered', tests: ['control'] },
  V004: { udyam: 'UDYAM-GJ-09-0055120', name: 'Meghdoot Logistics Co', activity: 'service', coverage: 'covered', tests: ['control'] },
  V005: { udyam: 'UDYAM-MH-26-0011903', name: 'Vertex Industrial Systems Limited', activity: 'manufacturing', coverage: 'not_covered', reason: 'medium enterprise', tests: ['control'] },

  V006: {
    udyam: 'UDYAM-DL-05-0203311', name: 'Kavya Print Works', activity: 'manufacturing', coverage: 'covered',
    reason: 'the supply is printed matter, so the printing registration is the match, not the trading one',
    tests: ['two same-state candidates', 'GSTIN cannot disambiguate', 'wrong match flips coverage'],
  },
  V007: {
    udyam: 'UDYAM-MH-26-0330871', name: 'Orion Steel Traders Private Limited', activity: 'trading', coverage: 'not_covered',
    reason: 'registered wholesale trade (NIC 46721), outside the s.15 obligation',
    tests: ['THE headline false positive: registered + small, but a trader'],
  },
  V008: {
    udyam: 'UDYAM-PB-02-0144902', name: 'Bhaskar Metal Industries', activity: 'manufacturing', coverage: 'covered',
    reason: 'registered under a trading NIC but fabricates what it supplies; the NIC is a prior, not a verdict',
    tests: ['NIC says trader, supply says manufacture -- discriminates against a NIC-only rule, not against the current naive arm, which agrees here by accident'],
  },
  V009: {
    udyam: 'UDYAM-TN-14-0290118', name: 'Suvarna Textile Mills Private Limited', activity: 'manufacturing',
    coverage: 'not_covered', reason: 'registration lapsed 2025-11-30',
    coverageAt: (d) => (d < '2025-11-30' ? 'covered' : 'not_covered'),
    tests: ['lapsed registration', 'date-dependent: historical invoices before the lapse ARE covered'],
  },
  V010: {
    udyam: 'UDYAM-HR-06-0072244', name: 'Girish Auto Components LLP', activity: 'manufacturing',
    coverage: 'not_covered', reason: 'reclassified small -> medium on 2026-01-15',
    coverageAt: (d) => (d < '2026-01-15' ? 'covered' : 'not_covered'),
    tests: ['category changed mid-year', 'classifying by today\'s status misreads most of its history'],
  },

  V011: {
    udyam: 'UDYAM-KA-03-0501773', name: 'Deccan Board Industries', activity: 'manufacturing', coverage: 'covered',
    reason: 'GSTIN prefix 29 is Karnataka, which matches the manufacturer, not the Telangana trading firm',
    tests: ['two similar names in different states', 'GSTIN state code disambiguates'],
  },
  V012: { udyam: 'UDYAM-RJ-17-0166201', name: 'Falcon Freight Movers', activity: 'service', coverage: 'covered', tests: ['control'] },
  V013: { udyam: 'UDYAM-UP-28-0455190', name: 'Sunrise Stationery Mart', activity: 'trading', coverage: 'not_covered', reason: 'retail trade (NIC 47630)', tests: ['retail trader'] },
  V014: { udyam: 'UDYAM-MP-23-0204416', name: 'Anantha Tooling Works', activity: 'manufacturing', coverage: 'covered', tests: ['control'] },
  V015: { udyam: 'UDYAM-MH-26-0288013', name: 'Prabhat Electrical Systems Private Limited', activity: 'manufacturing', coverage: 'covered', tests: ['control'] },
  V016: { udyam: 'UDYAM-GJ-09-0177302', name: 'Yamuna Chemicals & Solvents', activity: 'manufacturing', coverage: 'covered', tests: ['control'] },

  V017: {
    udyam: 'UDYAM-OD-22-0061188', name: 'Konark Printing Press', activity: 'manufacturing', coverage: 'covered',
    reason: 'the declared number UDYAM-OD-22-0061189 does not exist; the correct registration is found by name',
    tests: ['declared Udyam number is wrong', 'trusting the declared field fails'],
  },
  V018: { udyam: 'UDYAM-GA-01-0021975', name: 'Sagar Marine Services LLP', activity: 'service', coverage: 'covered', tests: ['control'] },

  V019: {
    udyam: null, name: null, activity: null, coverage: 'unknown',
    reason: 'nothing declared and nothing in the registry resembles the name',
    tests: ['unknown is not the same as not-covered', 'must escalate, not assume'],
  },

  V020: { udyam: 'UDYAM-KL-11-0133027', name: 'Himalaya Rubber Products', activity: 'manufacturing', coverage: 'covered', tests: ['control'] },
  V021: { udyam: 'UDYAM-PB-02-0399801', name: 'Tricity Hardware Stores', activity: 'trading', coverage: 'not_covered', reason: 'retail trade (NIC 47521)', tests: ['retail trader'] },
  V022: { udyam: 'UDYAM-WB-10-0442096', name: 'Nirmal Castings Private Limited', activity: 'manufacturing', coverage: 'covered', tests: ['control'] },

  V023: {
    udyam: 'UDYAM-BR-04-0093351', name: 'Ganga Enterprises', activity: 'manufacturing', coverage: 'covered',
    reason: 'GSTIN prefix 10 is Bihar; the near-identical "Ganga Enterprise" is a UP trading firm and a different entity',
    tests: ['singular/plural name collision', 'wrong pick flips coverage'],
  },
  V024: {
    udyam: 'UDYAM-TN-14-0355642', name: 'Zenith Packaging Industries', activity: 'manufacturing', coverage: 'covered',
    reason: 'covered as a vendor, but see INV-4123: one supply is pure resale and is not covered on its own facts',
    tests: ['control at vendor level; the discrimination is on INV-4123'],
  },
};

/** Correct coverage for a supply made on a given date. */
export function coverageAt(vendorId, isoDate) {
  const t = vendorTruth[vendorId];
  if (!t) return 'unknown';
  return t.coverageAt ? t.coverageAt(isoDate) : t.coverage;
}

// ---------------------------------------------------------------------------
// Live invoice truth
// ---------------------------------------------------------------------------

export const invoiceTruth = {
  'INV-4101': { covered: true, clockStart: ago(52), basis: 'goods_accepted', statedTermDays: 45, termDays: 45, tests: ['control'] },
  'INV-4102': { covered: true, clockStart: ago(48), basis: 'goods_accepted', statedTermDays: 60, termDays: 45, tests: ['control (exercises the engine cap, not the agent)'] },
  'INV-4103': { covered: true, clockStart: ago(14), basis: 'goods_accepted', statedTermDays: null, termDays: 15, tests: ['control'] },
  'INV-4104': {
    covered: true, clockStart: ago(30), basis: 'rectified_goods_accepted', statedTermDays: 30, termDays: 30,
    tests: ['objection to the GOODS, inside the 7-day window', 'clock restarts at re-acceptance'],
  },
  'INV-4105': { covered: false, reason: 'medium enterprise', tests: ['control'] },
  'INV-4106': {
    covered: true, clockStart: ago(26), basis: 'goods_accepted', statedTermDays: null, termDays: 15,
    tests: ['ambiguous vendor; the printing registration is the right match'],
  },
  'INV-4107': { covered: false, reason: 'registered wholesale trader', tests: ['THE false positive a naive check makes'] },
  'INV-4108': {
    covered: true, clockStart: ago(19), basis: 'goods_accepted', statedTermDays: 45, termDays: 45,
    tests: ['trading NIC but manufactured supply -> covered'],
  },
  'INV-4109': { covered: false, reason: 'registration lapsed before this supply', tests: ['lapsed registration'] },
  'INV-4110': { covered: false, reason: 'reclassified medium before this supply', tests: ['category change'] },
  'INV-4111': {
    covered: true, clockStart: ago(17), basis: 'goods_accepted', statedTermDays: null, termDays: 15,
    tests: ['GSTIN state code picks the right one of two similar names'],
  },
  'INV-4112': {
    covered: true, clockStart: ago(28), basis: 'goods_accepted', statedTermDays: 30, termDays: 30,
    tests: ['the word "objection", but about the RATE', 'clock must NOT restart'],
  },
  'INV-4113': { covered: false, reason: 'retail trader', tests: ['retail trader'] },
  'INV-4114': {
    covered: true, clockStart: ago(13), basis: 'goods_accepted', statedTermDays: 20, termDays: 20,
    tests: ['two documents on file; the PO governs over the framework'],
  },
  'INV-4115': {
    covered: true, clockStart: ago(29), basis: 'goods_accepted', statedTermDays: 60, termDays: 45,
    tests: ['amendment supersedes 45 -> 60', 'then capped back to 45'],
  },
  'INV-4116': {
    covered: true, clockStart: ago(20), basis: 'goods_accepted', statedTermDays: 30, termDays: 30,
    tests: ['amendment supersedes 60 -> 30', 'first match in the file is wrong and too generous'],
  },
  'INV-4117': {
    covered: true, clockStart: ago(22), basis: 'goods_accepted', statedTermDays: 30, termDays: 30,
    tests: ['term written in words, no digits', 'declared Udyam number is wrong'],
  },
  'INV-4118': {
    covered: true, clockStart: ago(27), basis: 'goods_accepted', statedTermDays: 35, termDays: 35,
    tests: ['payment term among decoy day-counts of 14, 90 and 100'],
  },
  'INV-4119': { covered: 'unknown', needsReview: true, reason: 'vendor not found in the registry and nothing declared', tests: ['must escalate rather than assume not-covered'] },
  'INV-4120': {
    covered: true, clockStart: ago(38), basis: 'goods_accepted', statedTermDays: 40, termDays: 40,
    tests: ['objection raised on day 9 against a 6-day window', 'out of time, so the clock is unaffected'],
  },
  'INV-4121': {
    covered: true, clockStart: ago(26), basis: 'deemed_acceptance', statedTermDays: null, termDays: 15,
    tests: ['agreement exists but states no payment term -> 15 days', 'no GRN and no objection -> deemed acceptance at delivery + 15'],
  },
  'INV-4122': {
    covered: true, clockStart: ago(15), basis: 'goods_accepted', statedTermDays: null, termDays: 15,
    tests: ['"Ganga Enterprises" vs "Ganga Enterprise" are different entities'],
  },
  'INV-4123': {
    covered: false, reason: 'pure resale of third-party material; not a covered supply on its own facts',
    tests: ['covered vendor, uncovered supply'],
  },
  'INV-4124': {
    covered: true, clockStart: ago(22), basis: 'goods_accepted', statedTermDays: 45, termDays: 45,
    tests: ['refusal to accept that never uses the words "object" or "reject"', 'clock starts at the later GRN, not at delivery'],
  },
  'INV-4125': { covered: false, reason: 'retail trader', tests: ['retail trader'] },
};

/** Every distinct thing this corpus is designed to defeat. */
export function caseInventory() {
  const rows = [];
  for (const [id, t] of Object.entries(vendorTruth)) {
    for (const test of t.tests || []) rows.push({ scope: 'vendor', id, test });
  }
  for (const [id, t] of Object.entries(invoiceTruth)) {
    for (const test of t.tests || []) rows.push({ scope: 'invoice', id, test });
  }
  return rows;
}
