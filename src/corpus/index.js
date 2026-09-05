// The corpus, assembled.
//
// SYNTHETIC throughout -- see PROVENANCE.md. Deterministic: the historical
// ledger is generated from CORPUS_SEED and the live population is hand
// authored, so two runs produce the same corpus and a panel can regenerate it.

export { registrations, classAt, activeAt, byUdyam } from './registry.js';
export { vendors, byId as vendorById, stateCodeOf } from './vendors.js';
export { documents as contractDocuments, forVendor as contractsForVendor, byDocId } from './contracts.js';
export { acceptanceDocuments, forInvoice as documentsForInvoice } from './documents.js';
export {
  invoices, liveInvoices, historicalInvoices,
  payouts, livePayouts, historicalPayouts,
  invoiceById, FINANCIAL_YEAR, CORPUS_SEED,
} from './ledger.js';
export { vendorTruth, invoiceTruth, coverageAt, caseInventory } from './truth.js';
export { NIC, TRADE_DIVISIONS, division, isTradeCode, describe as describeNic } from './nic.js';

import { registrations } from './registry.js';
import { vendors } from './vendors.js';
import { documents as contractDocuments } from './contracts.js';
import { acceptanceDocuments } from './documents.js';
import { liveInvoices, historicalInvoices, payouts } from './ledger.js';
import { caseInventory } from './truth.js';

export function stats() {
  return {
    registrations: registrations.length,
    vendors: vendors.length,
    contractDocuments: contractDocuments.length,
    acceptanceDocuments: acceptanceDocuments.length,
    liveInvoices: liveInvoices.length,
    historicalInvoices: historicalInvoices.length,
    payouts: Object.keys(payouts).length,
    designedCases: caseInventory().length,
    historicalValue: historicalInvoices.reduce((s, i) => s + i.amount, 0),
    liveValue: liveInvoices.reduce((s, i) => s + i.amount, 0),
  };
}
