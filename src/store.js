// In-memory store over the corpus, with JSON persistence for the mutable parts.
//
// The corpus itself is immutable reference data. What the app owns is: policy
// config, agent findings (vendor and invoice), payouts it has booked, and the
// audit log.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as corpus from './corpus/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(here, '..', '.ledgr-state.json');

export const defaultConfig = {
  bufferDays: 3,
  redWindowDays: 7,
  amberWindowDays: 21,
  taxRatePct: 25,
  autoExecuteThreshold: 10000,
  identityConfidenceFloor: 0.6,
};

function freshState() {
  return {
    config: { ...defaultConfig },
    vendorFindings: {},    // vendorId -> portfolio agent finding (cached, reused across invoices)
    invoiceFindings: {},   // invoiceId -> invoice agent finding
    payouts: JSON.parse(JSON.stringify(corpus.payouts)),
    extraInvoices: [],     // added through manual intake
    extraDocuments: {},    // invoiceId -> acceptance documents captured at intake
    audit: [],
  };
}

let state = freshState();

export function load() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const disk = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      state.config = { ...state.config, ...(disk.config || {}) };
      state.vendorFindings = disk.vendorFindings || {};
      state.invoiceFindings = disk.invoiceFindings || {};
      state.payouts = { ...state.payouts, ...(disk.payouts || {}) };
      state.extraInvoices = disk.extraInvoices || [];
      state.extraDocuments = disk.extraDocuments || {};
      state.audit = disk.audit || [];
    }
  } catch (err) {
    console.warn('[store] could not read state file, starting fresh:', err.message);
  }
  return state;
}

export function persist() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.warn('[store] could not persist state:', err.message);
  }
}

export function reset() {
  state = freshState();
  persist();
  return state;
}

export const getState = () => state;
export const getConfig = () => state.config;

export function setConfig(patch) {
  for (const key of Object.keys(defaultConfig)) {
    if (patch[key] !== undefined && Number.isFinite(Number(patch[key]))) {
      state.config[key] = Number(patch[key]);
    }
  }
  persist();
  return state.config;
}

// ------------------------------------------------------------- corpus reads

export const getVendors = () => corpus.vendors;
export const getVendor = (id) => corpus.vendorById(id);

export const getLiveInvoices = () => [...corpus.liveInvoices, ...state.extraInvoices];
export const getHistoricalInvoices = () => corpus.historicalInvoices;
export const getAllInvoices = () => [...getLiveInvoices(), ...corpus.historicalInvoices];
export const getInvoice = (id) => getAllInvoices().find((i) => i.id === id) || null;

export const getPayout = (invoiceId) => state.payouts[invoiceId] || null;

export function setPayout(invoiceId, payout) {
  state.payouts[invoiceId] = payout;
  persist();
  return payout;
}

export function addInvoice(invoice) {
  state.extraInvoices.push(invoice);
  persist();
  return invoice;
}

export function addAcceptanceDocuments(invoiceId, docs) {
  state.extraDocuments[invoiceId] = [...(state.extraDocuments[invoiceId] || []), ...docs]
    .sort((a, b) => a.date.localeCompare(b.date));
  persist();
  return state.extraDocuments[invoiceId];
}

export const getExtraDocuments = (invoiceId) => state.extraDocuments[invoiceId] || [];

// ------------------------------------------------------------ agent findings

export const getVendorFinding = (vendorId) => state.vendorFindings[vendorId] || null;

export function setVendorFinding(vendorId, finding) {
  state.vendorFindings[vendorId] = finding;
  persist();
  return finding;
}

export const getInvoiceFinding = (invoiceId) => state.invoiceFindings[invoiceId] || null;

export function setInvoiceFinding(invoiceId, finding) {
  state.invoiceFindings[invoiceId] = finding;
  persist();
  return finding;
}

export const sweepComplete = () => corpus.vendors.every((v) => state.vendorFindings[v.id]);
export const sweptCount = () => corpus.vendors.filter((v) => state.vendorFindings[v.id]).length;

// ------------------------------------------------------------------- audit

export function audit(entry) {
  const record = { id: `EV-${Date.now()}-${state.audit.length}`, at: new Date().toISOString(), ...entry };
  state.audit.unshift(record);
  persist();
  return record;
}

export const getAudit = () => state.audit;
