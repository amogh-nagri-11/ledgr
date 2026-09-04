// Demo dataset. Dates are expressed as offsets from "today" so the demo always
// looks live. Everything here is fabricated -- no real vendors, no real money.

import { addDays, today } from '../engine/dates.js';

const T = today();
const ago = (n) => addDays(T, -n);
const ahead = (n) => addDays(T, n);

/** The Udyam registry as an external source of truth the agent must query. */
export const udyamRegistry = [
  { udyam: 'UDYAM-MH-26-0041872', name: 'Sharma Enterprises Private Limited', enterpriseClass: 'micro',  state: 'Maharashtra', active: true, registeredOn: '2021-07-14' },
  { udyam: 'UDYAM-KA-03-0119265', name: 'Nandi Precision Components LLP',     enterpriseClass: 'small',  state: 'Karnataka',   active: true, registeredOn: '2022-02-02' },
  { udyam: 'UDYAM-TN-14-0087431', name: 'Aruna Packaging Solutions',          enterpriseClass: 'micro',  state: 'Tamil Nadu',  active: true, registeredOn: '2020-11-30' },
  { udyam: 'UDYAM-GJ-09-0055120', name: 'Meghdoot Logistics Co',              enterpriseClass: 'small',  state: 'Gujarat',     active: true, registeredOn: '2023-01-19' },
  { udyam: 'UDYAM-DL-05-0203311', name: 'Kavya Print Works',                  enterpriseClass: 'micro',  state: 'Delhi',       active: true, registeredOn: '2021-03-08' },
  { udyam: 'UDYAM-DL-05-0761204', name: 'K P Works Trading Company',          enterpriseClass: 'micro',  state: 'Delhi',       active: true, registeredOn: '2024-06-21' },
  { udyam: 'UDYAM-MH-26-0011903', name: 'Vertex Industrial Systems Limited',  enterpriseClass: 'medium', state: 'Maharashtra', active: true, registeredOn: '2019-08-05' },
];

/** Vendors as they appear in the buyer's own books -- names are messy on purpose. */
export const vendors = [
  { id: 'V001', ledgerName: 'Sharma Ent.',                   gstin: '27AABCS1429B1ZP', contact: 'accounts@sharmaent.example' },
  { id: 'V002', ledgerName: 'Nandi Precision',               gstin: '29AAFCN8811K1Z2', contact: 'ar@nandiprecision.example' },
  { id: 'V003', ledgerName: 'Aruna Pkg Solutions',           gstin: '33AAGFA2201M1ZK', contact: 'billing@arunapkg.example' },
  { id: 'V004', ledgerName: 'Meghdoot Logistics',            gstin: '24AACCM7712J1ZR', contact: 'finance@meghdoot.example' },
  { id: 'V005', ledgerName: 'Vertex Industrial Systems Ltd', gstin: '27AAACV4410L1ZQ', contact: 'ap@vertexind.example' },
  { id: 'V006', ledgerName: 'K.P. Works',                    gstin: '07AAHFK9902D1ZM', contact: 'kpworks.delhi@example' },
  { id: 'V007', ledgerName: 'Orion Steel Traders',           gstin: '27AAECO5533H1ZN', contact: 'sales@orionsteel.example' },
];

/**
 * Documents on file per vendor. Raw text, as pulled from a contract PDF or an
 * emailed PO -- the agent has to read these, not a clean `terms_days` column.
 */
export const vendorDocuments = {
  V001: [{
    docId: 'MSA-SHARMA-2024', type: 'master_service_agreement', signedOn: '2024-04-01',
    title: 'Master Supply Agreement - Sharma Enterprises Pvt Ltd',
    text: [
      'CLAUSE 7 - CONSIDERATION AND PAYMENT',
      '7.1 The Buyer shall pay the Supplier the amounts set out in each Purchase Order.',
      '7.2 Payment shall be made within forty-five (45) days from the date of acceptance of the',
      '    goods at the designated site, acceptance to be evidenced by a signed Goods Receipt Note.',
      '7.3 Time for payment shall not be extended by any dispute relating to a separate Purchase Order.',
      'CLAUSE 12 - GOVERNING LAW',
      '12.1 This Agreement is governed by the laws of India.',
    ].join('\n'),
  }],
  V002: [{
    docId: 'PO-TERMS-NANDI-2025', type: 'purchase_order_terms', signedOn: '2025-01-15',
    title: 'Standard Purchase Order Terms - Nandi Precision Components LLP',
    text: [
      '2. PRICE AND PAYMENT',
      '2.1 Prices are as quoted and exclusive of GST.',
      '2.2 Payment terms are Net 60 days from receipt of a valid tax invoice.',
      '2.3 The Buyer may withhold payment of any disputed line item pending resolution.',
      '3. DELIVERY',
      '3.1 Delivery is DDP the Pune works. Risk passes on unloading.',
    ].join('\n'),
  }],
  V003: [],  // no written agreement on file -- deliberately
  V004: [{
    docId: 'SVC-MEGHDOOT-2025', type: 'service_agreement', signedOn: '2025-05-20',
    title: 'Transport Services Agreement - Meghdoot Logistics Co',
    text: [
      'SECTION 4 - INVOICING',
      '4.1 The Service Provider shall raise invoices monthly in arrears.',
      '4.2 Payment terms: Net 30 from the date of delivery, provided the consignment has been',
      '    accepted without objection. Where the Buyer raises a written objection within seven (7)',
      '    days of delivery, the payment period shall run afresh from the date the rectified',
      '    consignment is accepted.',
      '4.3 Detention charges are billed separately.',
    ].join('\n'),
  }],
  V005: [{
    docId: 'MSA-VERTEX-2023', type: 'master_service_agreement', signedOn: '2023-09-01',
    title: 'Equipment Supply Agreement - Vertex Industrial Systems Ltd',
    text: [
      '9. PAYMENT',
      '9.1 Net 60 days from invoice date.',
      '9.2 Retention of 5% released on commissioning sign-off.',
    ].join('\n'),
  }],
  V006: [],  // nothing on file
  V007: [{
    docId: 'PO-ORION-2025', type: 'purchase_order_terms', signedOn: '2025-06-10',
    title: 'Purchase Order Terms - Orion Steel Traders',
    text: 'PAYMENT: Net 30 days from invoice date. Bank details as per vendor master.',
  }],
};

/**
 * Delivery / acceptance trail per invoice. This is what decides when the clock
 * actually starts -- GRNs, objection emails, re-deliveries.
 */
export const deliveryEvents = {
  'INV-2041': [
    { date: ago(41), type: 'delivery_note', ref: 'DN-88121', note: 'Full consignment of MS plate delivered to Pune works.' },
    { date: ago(41), type: 'grn_accepted',  ref: 'GRN-4471', note: 'Goods received and accepted without objection. Signed by stores in-charge.' },
  ],
  'INV-2042': [
    { date: ago(38), type: 'delivery_note', ref: 'DN-88203', note: 'Machined components, 400 nos.' },
    { date: ago(38), type: 'grn_accepted',  ref: 'GRN-4488', note: 'Accepted in full after dimensional check.' },
  ],
  'INV-2043': [
    { date: ago(12), type: 'delivery_note', ref: 'DN-88410', note: 'Corrugated packaging cartons.' },
    { date: ago(12), type: 'grn_accepted',  ref: 'GRN-4530', note: 'Accepted.' },
  ],
  'INV-2044': [
    { date: ago(40), type: 'delivery_note',    ref: 'DN-88190',   note: 'Consignment of 12 crates, Ahmedabad to Pune.' },
    { date: ago(37), type: 'objection_raised', ref: 'EMAIL-2291', note: 'Email from stores to Meghdoot: 4 of the 12 crates arrived water-damaged. We are rejecting those crates and will not accept the consignment until replacements arrive. Treat this as our formal objection under clause 4.2.' },
    { date: ago(29), type: 'redelivery',       ref: 'DN-88266',   note: 'Replacement crates delivered.' },
    { date: ago(26), type: 'grn_accepted',     ref: 'GRN-4502',   note: 'Rectified consignment accepted in full. Objection closed.' },
  ],
  'INV-2045': [
    { date: ago(30), type: 'delivery_note', ref: 'DN-88250', note: 'CNC controller units, 2 nos.' },
    { date: ago(28), type: 'grn_accepted',  ref: 'GRN-4495', note: 'Accepted post inspection.' },
  ],
  'INV-2046': [
    { date: ago(24), type: 'delivery_note', ref: 'DN-88300', note: 'Printed catalogues, 5000 nos. Left at gate; no stores signature captured.' },
    { date: ago(19), type: 'internal_note', ref: 'NOTE-771',  note: 'Stores confirms material is in the warehouse but no GRN was ever raised. No objection was sent to the supplier either.' },
  ],
  'INV-2047': [
    { date: ago(18), type: 'delivery_note', ref: 'DN-88355', note: 'TMT bars, 8 MT.' },
    { date: ago(18), type: 'grn_accepted',  ref: 'GRN-4519', note: 'Accepted.' },
  ],
  'INV-2048': [
    { date: ago(9), type: 'delivery_note', ref: 'DN-88477', note: 'Sample cartons for new SKU.' },
    { date: ago(9), type: 'grn_accepted',  ref: 'GRN-4544', note: 'Accepted.' },
  ],
  'INV-2049': [
    { date: ago(29), type: 'delivery_note', ref: 'DN-88340', note: 'MS angle sections.' },
    { date: ago(29), type: 'grn_accepted',  ref: 'GRN-4522', note: 'Accepted.' },
  ],
  'INV-2051': [
    { date: ago(18), type: 'delivery_note', ref: 'DN-88361', note: 'Freight - Surat lane, 3 trips.' },
    { date: ago(18), type: 'grn_accepted',  ref: 'GRN-4521', note: 'Consignments accepted without objection.' },
  ],
  'INV-2050': [
    { date: ago(50), type: 'delivery_note', ref: 'DN-88055', note: 'Precision bushings, 1200 nos.' },
    { date: ago(50), type: 'grn_accepted',  ref: 'GRN-4450', note: 'Accepted.' },
  ],
};

export const invoices = [
  { id: 'INV-2041', vendorId: 'V001', amount: 500000, invoiceDate: ago(41), description: 'MS plate supply', currency: 'INR' },
  { id: 'INV-2042', vendorId: 'V002', amount: 275000, invoiceDate: ago(37), description: 'Machined components batch 22', currency: 'INR' },
  { id: 'INV-2043', vendorId: 'V003', amount:  64000, invoiceDate: ago(12), description: 'Corrugated cartons', currency: 'INR' },
  { id: 'INV-2044', vendorId: 'V004', amount: 185000, invoiceDate: ago(40), description: 'Freight - Ahmedabad lane', currency: 'INR' },
  { id: 'INV-2045', vendorId: 'V005', amount: 920000, invoiceDate: ago(28), description: 'CNC controller units', currency: 'INR' },
  { id: 'INV-2046', vendorId: 'V006', amount: 110000, invoiceDate: ago(24), description: 'Printed catalogues', currency: 'INR' },
  { id: 'INV-2047', vendorId: 'V007', amount: 340000, invoiceDate: ago(18), description: 'TMT bars 8 MT', currency: 'INR' },
  { id: 'INV-2048', vendorId: 'V003', amount:   8400, invoiceDate: ago(9),  description: 'Sample cartons - new SKU', currency: 'INR' },
  { id: 'INV-2049', vendorId: 'V001', amount:  95000, invoiceDate: ago(20), description: 'MS angle sections', currency: 'INR' },
  { id: 'INV-2050', vendorId: 'V002', amount: 150000, invoiceDate: ago(50), description: 'Precision bushings', currency: 'INR' },
  { id: 'INV-2051', vendorId: 'V004', amount:  42000, invoiceDate: ago(18), description: 'Freight - Surat lane', currency: 'INR' },
];

/** Mock RazorpayX payout ledger, keyed by invoice. */
export const payouts = {
  'INV-2049': { payoutId: 'pout_DEMOscheduled49', status: 'scheduled', date: ahead(18), amount: 95000, mode: 'NEFT', source: 'seed' },
  'INV-2050': { payoutId: 'pout_DEMOprocessed50', status: 'processed', date: ago(8), amount: 150000, mode: 'NEFT', source: 'seed', utr: 'UTRDEMO0050' },
};

export const defaultConfig = {
  bufferDays: 3,                // pay N days before the deadline
  redWindowDays: 7,             // <= N days left with no payout in motion => red
  amberWindowDays: 21,
  taxRatePct: 25,               // used to price the lost deduction
  autoExecuteThreshold: 10000,  // rupees; at or below this Ledgr may schedule without a click
};
