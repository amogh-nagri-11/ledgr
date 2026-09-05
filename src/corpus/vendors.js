// The buyer's vendor master -- what a real finance team actually holds.
//
// SYNTHETIC. Deliberately incomplete, which is the realistic state: names are
// abbreviated or trade names rather than legal names, and the declared Udyam
// number is present for some vendors, absent for many, and occasionally wrong.
//
// `declaredUdyam` is the production entry point: vendors self-declare at
// onboarding and the agent validates the declaration. Where it is null the
// agent must search the registry by name, which is where identity ambiguity
// bites. Where it is present it still cannot be trusted -- see V017.

export const vendors = [
  { id: 'V001', ledgerName: 'Sharma Ent.',              gstin: '27AABCS1429B1ZP', declaredUdyam: 'UDYAM-MH-26-0041872', onboardedOn: '2021-08-02', contact: 'accounts@sharmaent.example' },
  { id: 'V002', ledgerName: 'Nandi Precision',          gstin: '29AAFCN8811K1Z2', declaredUdyam: 'UDYAM-KA-03-0119265', onboardedOn: '2022-03-14', contact: 'ar@nandiprecision.example' },
  { id: 'V003', ledgerName: 'Aruna Pkg Solutions',      gstin: '33AAGFA2201M1ZK', declaredUdyam: null,                  onboardedOn: '2021-01-09', contact: 'billing@arunapkg.example' },
  { id: 'V004', ledgerName: 'Meghdoot Logistics',       gstin: '24AACCM7712J1ZR', declaredUdyam: 'UDYAM-GJ-09-0055120', onboardedOn: '2023-02-20', contact: 'finance@meghdoot.example' },
  { id: 'V005', ledgerName: 'Vertex Industrial Systems Ltd', gstin: '27AAACV4410L1ZQ', declaredUdyam: 'UDYAM-MH-26-0011903', onboardedOn: '2019-09-11', contact: 'ap@vertexind.example' },

  // Ambiguous: two Delhi micro registrations plausibly match, and they differ
  // in activity -- one prints, one trades. Nothing declared to settle it.
  { id: 'V006', ledgerName: 'K.P. Works',               gstin: '07AAHFK9902D1ZM', declaredUdyam: null,                  onboardedOn: '2024-07-30', contact: 'kpworks.delhi@example' },

  // Registered, micro/small, and a trader. The naive check calls this covered.
  { id: 'V007', ledgerName: 'Orion Steel Traders',      gstin: '27AAECO5533H1ZN', declaredUdyam: 'UDYAM-MH-26-0330871', onboardedOn: '2022-10-01', contact: 'sales@orionsteel.example' },

  // Registered under a trading NIC, but fabricates what it supplies us.
  { id: 'V008', ledgerName: 'Bhaskar Metals',           gstin: '03AAFCB6621P1ZT', declaredUdyam: 'UDYAM-PB-02-0144902', onboardedOn: '2021-12-06', contact: 'accounts@bhaskarmetals.example' },

  // Registration lapsed 2026-03-31. Supplies straddle that date.
  { id: 'V009', ledgerName: 'Suvarna Textiles',         gstin: '33AABCS9004R1ZG', declaredUdyam: 'UDYAM-TN-14-0290118', onboardedOn: '2020-09-03', contact: 'accounts@suvarnatex.example' },

  // Reclassified small -> medium on 2026-01-15. Coverage depends on supply date.
  { id: 'V010', ledgerName: 'Girish Auto Components',   gstin: '06AAGFG3312W1ZB', declaredUdyam: 'UDYAM-HR-06-0072244', onboardedOn: '2019-06-18', contact: 'ar@girishauto.example' },

  // Two "Deccan Board" registrations in different states; GSTIN prefix decides.
  { id: 'V011', ledgerName: 'Deccan Boards',            gstin: '29AAECD1188F1ZY', declaredUdyam: null,                  onboardedOn: '2022-05-02', contact: 'billing@deccanboards.example' },

  { id: 'V012', ledgerName: 'Falcon Freight',           gstin: '08AAJFF7745C1ZE', declaredUdyam: 'UDYAM-RJ-17-0166201', onboardedOn: '2023-04-11', contact: 'ops@falconfreight.example' },
  { id: 'V013', ledgerName: 'Sunrise Stationers',       gstin: '09AAHFS2290L1ZX', declaredUdyam: 'UDYAM-UP-28-0455190', onboardedOn: '2023-06-05', contact: 'sales@sunrisestat.example' },
  { id: 'V014', ledgerName: 'Anantha Tools',            gstin: '23AAGFA5580N1ZD', declaredUdyam: 'UDYAM-MP-23-0204416', onboardedOn: '2021-02-15', contact: 'accounts@ananthatools.example' },
  { id: 'V015', ledgerName: 'Prabhat Electricals',      gstin: '27AAACP6690T1ZJ', declaredUdyam: 'UDYAM-MH-26-0288013', onboardedOn: '2020-03-01', contact: 'finance@prabhatelec.example' },
  { id: 'V016', ledgerName: 'Yamuna Chem',              gstin: '24AAFCY1123Q1ZU', declaredUdyam: 'UDYAM-GJ-09-0177302', onboardedOn: '2022-11-19', contact: 'ar@yamunachem.example' },

  // Declared number belongs to a different firm entirely -- an onboarding typo
  // that has never been checked. The declared name and the registry name do
  // not correspond; the agent must catch that rather than trust the field.
  { id: 'V017', ledgerName: 'Konark Printers',          gstin: '21AAFCK8812V1ZS', declaredUdyam: 'UDYAM-OD-22-0061189', onboardedOn: '2021-10-04', contact: 'accounts@konarkprint.example' },

  { id: 'V018', ledgerName: 'Sagar Marine Services',    gstin: '30AAGFS4471B1ZC', declaredUdyam: 'UDYAM-GA-01-0021975', onboardedOn: '2022-01-24', contact: 'billing@sagarmarine.example' },

  // Nothing declared, and nothing in the registry resembles the name.
  // Unknown is not the same as "not covered".
  { id: 'V019', ledgerName: 'Vindhya Timber',           gstin: '23AAHFV3307K1ZP', declaredUdyam: null,                  onboardedOn: '2024-02-08', contact: 'sales@vindhyatimber.example' },

  { id: 'V020', ledgerName: 'Himalaya Rubber',          gstin: '32AAECH9938M1ZL', declaredUdyam: 'UDYAM-KL-11-0133027', onboardedOn: '2023-03-17', contact: 'accounts@himalayarubber.example' },
  { id: 'V021', ledgerName: 'Tricity Hardware',         gstin: '03AAHFT5562J1ZW', declaredUdyam: 'UDYAM-PB-02-0399801', onboardedOn: '2022-07-21', contact: 'sales@tricityhw.example' },
  { id: 'V022', ledgerName: 'Nirmal Castings',          gstin: '19AAACN2214G1ZF', declaredUdyam: 'UDYAM-WB-10-0442096', onboardedOn: '2020-07-08', contact: 'ar@nirmalcastings.example' },

  // Near-identical to another registered firm in a different state.
  { id: 'V023', ledgerName: 'Ganga Enterprises',        gstin: '10AAGFG6603D1ZH', declaredUdyam: null,                  onboardedOn: '2022-09-27', contact: 'accounts@gangaent.example' },

  // Registered manufacturer; one supply is imported film resold untouched.
  { id: 'V024', ledgerName: 'Zenith Packaging',         gstin: '33AAECZ7781R1ZA', declaredUdyam: 'UDYAM-TN-14-0355642', onboardedOn: '2021-06-14', contact: 'billing@zenithpack.example' },
];

export const byId = (id) => vendors.find((v) => v.id === id) || null;

/** GSTIN state prefix -- an independent corroborating signal for identity. */
export const stateCodeOf = (gstin) => String(gstin).slice(0, 2);
