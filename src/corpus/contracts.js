// Contracts and purchase-order terms on file, as raw text.
//
// SYNTHETIC, but shaped after the ways real payment clauses are actually hard:
//   - the term is stated in words, not digits
//   - an amendment supersedes the original clause, in either direction
//   - the document is littered with other day-counts (objection windows,
//     notice periods, retention releases) that are not payment terms
//   - two documents are on file and only one governs this supply
//   - a contract exists but states no payment term at all
//
// Nothing here is pre-parsed. There is no `termDays` field, by design.

export const documents = [
  // -------------------------------------------------- clean control, 45 days
  {
    docId: 'MSA-SHARMA-2024', vendorId: 'V001', kind: 'master_agreement',
    executedOn: '2024-04-01', supersedes: null,
    title: 'Master Supply Agreement - Sharma Enterprises Private Limited',
    text: [
      'CLAUSE 7 - CONSIDERATION AND PAYMENT',
      '7.1 The Buyer shall pay the Supplier the amounts set out in each Purchase Order.',
      '7.2 Payment shall be made within forty-five (45) days from the date of acceptance of',
      '    the goods at the designated site, acceptance to be evidenced by a signed Goods',
      '    Receipt Note.',
      '7.3 Time for payment shall not be extended by reason of any dispute arising under a',
      '    separate Purchase Order.',
      'CLAUSE 12 - GOVERNING LAW',
      '12.1 This Agreement is governed by the laws of India.',
    ].join('\n'),
  },

  // ------------------------------------------ states 60; the cap must bite
  {
    docId: 'PO-TERMS-NANDI-2025', vendorId: 'V002', kind: 'po_terms',
    executedOn: '2025-01-15', supersedes: null,
    title: 'Standard Purchase Order Terms - Nandi Precision Components LLP',
    text: [
      '2. PRICE AND PAYMENT',
      '2.1 Prices are as quoted and exclusive of GST.',
      '2.2 Payment terms are Net 60 days from receipt of a valid tax invoice.',
      '2.3 The Buyer may withhold payment of any disputed line item pending resolution.',
      '3. DELIVERY',
      '3.1 Delivery is DDP the Buyer works. Risk passes on unloading.',
    ].join('\n'),
  },

  // ---------------------- payment term buried among three decoy day-counts
  {
    docId: 'SVC-MEGHDOOT-2025', vendorId: 'V004', kind: 'service_agreement',
    executedOn: '2025-05-20', supersedes: null,
    title: 'Transport Services Agreement - Meghdoot Logistics Co',
    text: [
      'SECTION 4 - INVOICING AND PAYMENT',
      '4.1 The Service Provider shall raise invoices monthly in arrears.',
      '4.2 Payment terms: Net 30 from the date of delivery, provided the consignment has',
      '    been accepted without objection. Where the Buyer raises a written objection',
      '    within seven (7) days of delivery, the payment period shall run afresh from the',
      '    date the rectified consignment is accepted.',
      '4.3 Detention charges are billed separately and settled quarterly.',
      'SECTION 9 - TERM AND TERMINATION',
      '9.1 Either party may terminate on ninety (90) days written notice.',
      '9.2 Claims for loss or damage must be notified within twenty-one (21) days of delivery.',
    ].join('\n'),
  },

  // ------------------------------------------------ term stated only in words
  {
    docId: 'MSA-KONARK-2021', vendorId: 'V017', kind: 'master_agreement',
    executedOn: '2021-10-10', supersedes: null,
    title: 'Printing Services Agreement - Konark Printing Press',
    text: [
      'ARTICLE V - REMUNERATION',
      '5.1 Rates are as per the schedule annexed hereto.',
      '5.2 The Buyer shall remit the invoiced sum within thirty days of acceptance of the',
      '    printed material, acceptance not to be unreasonably withheld.',
      '5.3 Reprints occasioned by Supplier error shall be at no charge.',
      'ARTICLE IX - CONFIDENTIALITY',
      '9.1 Artwork supplied remains the property of the Buyer.',
    ].join('\n'),
  },

  // ------------------- amendment supersedes UPWARD: 45 -> 60, cap must apply
  {
    docId: 'MSA-PRABHAT-2020', vendorId: 'V015', kind: 'master_agreement',
    executedOn: '2020-03-05', supersedes: null,
    title: 'Equipment Supply Agreement - Prabhat Electrical Systems Private Limited',
    text: [
      'CLAUSE 6 - PAYMENT',
      '6.1 Payment shall be made within forty-five (45) days of acceptance.',
      '6.2 A retention of five per cent (5%) shall be released one hundred and eighty (180)',
      '    days after commissioning sign-off.',
    ].join('\n'),
  },
  {
    docId: 'AMD-PRABHAT-2025-01', vendorId: 'V015', kind: 'amendment',
    executedOn: '2025-11-30', supersedes: 'MSA-PRABHAT-2020',
    title: 'Amendment No. 1 to the Equipment Supply Agreement - Prabhat Electrical Systems',
    text: [
      'AMENDMENT NO. 1',
      'With effect from the date of execution hereof, Clause 6.1 of the Agreement is deleted',
      'in its entirety and replaced with the following:',
      '',
      '  "6.1 Payment shall be made within sixty (60) days of acceptance."',
      '',
      'All other terms of the Agreement remain unamended and in full force.',
    ].join('\n'),
  },

  // ----------------- amendment supersedes DOWNWARD: 60 -> 30, first match wrong
  {
    docId: 'MSA-YAMUNA-2022', vendorId: 'V016', kind: 'master_agreement',
    executedOn: '2022-11-02', supersedes: null,
    title: 'Solvent Supply Agreement - Yamuna Chemicals & Solvents',
    text: [
      'CLAUSE 8 - PAYMENT TERMS',
      '8.1 Payment terms are Net 60 days from the date of the tax invoice.',
      '8.2 Drum deposits are refundable on return within forty-five (45) days.',
    ].join('\n'),
  },
  {
    docId: 'AMD-YAMUNA-2026-01', vendorId: 'V016', kind: 'amendment',
    executedOn: '2026-02-11', supersedes: 'MSA-YAMUNA-2022',
    title: 'Amendment to Solvent Supply Agreement - Yamuna Chemicals & Solvents',
    text: [
      'The parties agree that Clause 8.1 is superseded and shall henceforth read:',
      '',
      '  "8.1 Payment terms are Net 30 days from the date of the tax invoice."',
      '',
      'This amendment applies to all supplies made on or after 11 February 2026.',
    ].join('\n'),
  },

  // ------------------- two documents on file; the later PO governs this supply
  {
    docId: 'MSA-ANANTHA-2021', vendorId: 'V014', kind: 'master_agreement',
    executedOn: '2021-02-20', supersedes: null,
    title: 'Framework Agreement - Anantha Tooling Works',
    text: [
      'CLAUSE 3 - SCOPE',
      '3.1 This Framework Agreement sets out the basis on which the Buyer may issue',
      '    Purchase Orders. It does not itself commit the Buyer to any volume.',
      '3.2 Where a Purchase Order states payment terms, those terms prevail over this',
      '    Framework Agreement for the supply to which the Order relates.',
      'CLAUSE 4 - PAYMENT',
      '4.1 Save as provided in Clause 3.2, payment shall be made within forty-five (45)',
      '    days of acceptance.',
    ].join('\n'),
  },
  {
    docId: 'PO-ANANTHA-4417', vendorId: 'V014', kind: 'po_terms',
    executedOn: '2026-07-02', supersedes: null,
    title: 'Purchase Order 4417 - Anantha Tooling Works',
    text: [
      'PURCHASE ORDER 4417',
      'Item: carbide insert tooling, 60 sets.',
      'Payment: Net 20 days from acceptance at stores. This Order states its own payment',
      'terms and accordingly prevails per Clause 3.2 of the Framework Agreement.',
      'Delivery: on or before the date stated overleaf.',
    ].join('\n'),
  },

  // ------------------------------ contract exists but states no payment term
  {
    docId: 'MSA-NIRMAL-2020', vendorId: 'V022', kind: 'master_agreement',
    executedOn: '2020-07-15', supersedes: null,
    title: 'Supply Agreement - Nirmal Castings Private Limited',
    text: [
      'CLAUSE 2 - SUPPLY',
      '2.1 The Supplier shall supply castings conforming to the specification annexed.',
      'CLAUSE 5 - INVOICING',
      '5.1 Invoices shall be raised against each despatch and shall quote the Order number.',
      '5.2 Invoices not quoting an Order number may be returned.',
      'CLAUSE 11 - DISPUTES',
      '11.1 Disputes shall be referred to arbitration seated at Kolkata.',
    ].join('\n'),
  },

  // ---------------------------------------------------------- plain controls
  {
    docId: 'PO-TERMS-ORION-2025', vendorId: 'V007', kind: 'po_terms',
    executedOn: '2025-06-10', supersedes: null,
    title: 'Purchase Order Terms - Orion Steel Traders Private Limited',
    text: 'PAYMENT: Net 30 days from invoice date. Bank details as per vendor master.',
  },
  {
    docId: 'PO-TERMS-BHASKAR-2024', vendorId: 'V008', kind: 'po_terms',
    executedOn: '2024-11-22', supersedes: null,
    title: 'Purchase Order Terms - Bhaskar Metal Industries',
    text: [
      'PAYMENT: Net 45 days from acceptance of the fabricated items at the Buyer stores.',
      'INSPECTION: The Buyer may reject any item failing dimensional inspection within ten',
      '(10) days of delivery.',
    ].join('\n'),
  },
  {
    docId: 'SVC-FALCON-2023', vendorId: 'V012', kind: 'service_agreement',
    executedOn: '2023-04-20', supersedes: null,
    title: 'Freight Services Agreement - Falcon Freight Movers',
    text: [
      '4. PAYMENT',
      '4.1 Net 30 days from delivery, subject to acceptance of the consignment.',
      '4.2 Disputes as to rate shall not entitle the Buyer to withhold acceptance of the',
      '    goods carried, and shall be settled by credit note in the following month.',
      '4.3 Objections as to condition of the consignment must be raised within five (5) days',
      '    of delivery, failing which the consignment is deemed accepted.',
    ].join('\n'),
  },
  {
    docId: 'MSA-HIMALAYA-2023', vendorId: 'V020', kind: 'master_agreement',
    executedOn: '2023-03-01', supersedes: null,
    title: 'Component Supply Agreement - Himalaya Rubber Products',
    text: [
      'CLAUSE 6 - PAYMENT AND ACCEPTANCE',
      '6.1 Payment: Net 40 days from acceptance.',
      '6.2 The Buyer shall inspect and either accept or reject within six (6) days of',
      '    delivery. An objection raised after that period does not affect the running of',
      '    the payment period.',
    ].join('\n'),
  },
  {
    docId: 'MSA-SUVARNA-2020', vendorId: 'V009', kind: 'master_agreement',
    executedOn: '2020-09-10', supersedes: null,
    title: 'Textile Supply Agreement - Suvarna Textile Mills Private Limited',
    text: 'PAYMENT: Net 45 days from the date of acceptance at the Buyer godown.',
  },
  {
    docId: 'MSA-GIRISH-2019', vendorId: 'V010', kind: 'master_agreement',
    executedOn: '2019-06-25', supersedes: null,
    title: 'Component Supply Agreement - Girish Auto Components LLP',
    text: 'PAYMENT: Net 45 days from acceptance of goods at the Buyer plant.',
  },
  {
    docId: 'MSA-ZENITH-2021', vendorId: 'V024', kind: 'master_agreement',
    executedOn: '2021-06-20', supersedes: null,
    title: 'Packaging Supply Agreement - Zenith Packaging Industries',
    text: [
      'CLAUSE 5 - PAYMENT',
      '5.1 Net 45 days from acceptance for goods manufactured by the Supplier.',
      '5.2 Where the Supplier procures and supplies third-party material without further',
      '    processing, the same payment period applies but the parties acknowledge the',
      '    Supplier acts as a reseller in respect of that material.',
    ].join('\n'),
  },
  {
    docId: 'MSA-SAGAR-2022', vendorId: 'V018', kind: 'service_agreement',
    executedOn: '2022-02-01', supersedes: null,
    title: 'Marine Services Agreement - Sagar Marine Services LLP',
    text: [
      'SECTION 3 - CHARGES',
      '3.1 Charges are per the tariff at Annexure B.',
      '3.2 Payment: Net 35 days from completion of the service call.',
      '3.3 Demurrage is claimable within fourteen (14) days of the event.',
      'SECTION 7 - INSURANCE',
      '7.1 The Provider shall maintain cover of not less than one hundred (100) lakh.',
    ].join('\n'),
  },
];

/** Every document on file for a vendor. Which one governs is the agent's job. */
export const forVendor = (vendorId) => documents.filter((d) => d.vendorId === vendorId);

export const byDocId = (docId) => documents.find((d) => d.docId === docId) || null;
