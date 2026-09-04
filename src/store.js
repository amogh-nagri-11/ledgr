// In-memory store with JSON persistence. Enough for an MVP; swap for a real DB
// later without touching the engine or the agent.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as seed from './data/seed.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(here, '..', '.ledgr-state.json');

function freshState() {
  return {
    config: { ...seed.defaultConfig },
    invoices: seed.invoices.map((i) => ({ ...i })),
    vendors: seed.vendors.map((v) => ({ ...v })),
    payouts: JSON.parse(JSON.stringify(seed.payouts)),
    deliveryEvents: {},   // invoiceId -> events captured at intake (seed data is separate)
    findings: {},         // invoiceId -> agent finding (extraction result + trace)
    audit: [],
  };
}

let state = freshState();

export function load() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const disk = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      // Seed dates are relative to today, so only carry over the mutable parts.
      state.config = { ...state.config, ...(disk.config || {}) };
      state.findings = disk.findings || {};
      state.deliveryEvents = disk.deliveryEvents || {};
      state.audit = disk.audit || [];
      state.payouts = { ...state.payouts, ...(disk.payouts || {}) };
      for (const inv of disk.invoices || []) {
        if (!state.invoices.some((i) => i.id === inv.id)) state.invoices.push(inv);
      }
      for (const v of disk.vendors || []) {
        if (!state.vendors.some((x) => x.id === v.id)) state.vendors.push(v);
      }
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
  const numeric = ['bufferDays', 'redWindowDays', 'amberWindowDays', 'taxRatePct', 'autoExecuteThreshold'];
  for (const key of numeric) {
    if (patch[key] !== undefined && Number.isFinite(Number(patch[key]))) {
      state.config[key] = Number(patch[key]);
    }
  }
  persist();
  return state.config;
}

export const getInvoices = () => state.invoices;
export const getInvoice = (id) => state.invoices.find((i) => i.id === id);
export const getVendor = (id) => state.vendors.find((v) => v.id === id);
export const getPayout = (invoiceId) => state.payouts[invoiceId] || null;

export function setPayout(invoiceId, payout) {
  state.payouts[invoiceId] = payout;
  persist();
  return payout;
}

export function addInvoice(invoice) {
  state.invoices.push(invoice);
  persist();
  return invoice;
}

export const getFinding = (invoiceId) => state.findings[invoiceId] || null;

export function setFinding(invoiceId, finding) {
  state.findings[invoiceId] = finding;
  persist();
  return finding;
}

/** Documents / delivery trail are reference data, not mutated by the app. */
export const getVendorDocuments = (vendorId) => seed.vendorDocuments[vendorId] || [];
/** Seeded trail first, then anything captured through intake. */
export const getDeliveryEvents = (invoiceId) =>
  seed.deliveryEvents[invoiceId] || state.deliveryEvents[invoiceId] || [];

export function addDeliveryEvents(invoiceId, events) {
  state.deliveryEvents[invoiceId] = [...(state.deliveryEvents[invoiceId] || []), ...events]
    .sort((a, b) => a.date.localeCompare(b.date));
  persist();
  return state.deliveryEvents[invoiceId];
}
export const getUdyamRegistry = () => seed.udyamRegistry;

export function audit(entry) {
  const record = { id: `EV-${Date.now()}-${state.audit.length}`, at: new Date().toISOString(), ...entry };
  state.audit.unshift(record);
  persist();
  return record;
}

export const getAudit = () => state.audit;
