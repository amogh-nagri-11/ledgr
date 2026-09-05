// The Udyam registry as an external source of truth the portfolio agent queries.
//
// SYNTHETIC. There is no public bulk Udyam name-search API; in production a
// buyer holds vendor-declared registration numbers from onboarding and the
// agent validates and classifies those. This file stands in for that lookup
// surface, and is shaped like what a per-UAN verification would return.
//
// Two fields carry most of the difficulty:
//   classHistory  enterprise category is not static. A firm that grew from
//                 small to medium stops carrying the obligation from that
//                 date -- so coverage is a function of the SUPPLY DATE, not
//                 of today. Historical invoices must be judged as at the time.
//   nic           registered activity. Trade divisions (45-47) sit outside
//                 the s.15 obligation, but the registered code is a prior,
//                 not a verdict -- see nic.js.

/**
 * @typedef {object} Registration
 * @property {string} udyam
 * @property {string} name          formal registered name
 * @property {string} state
 * @property {string} stateCode     matches the GSTIN prefix
 * @property {number} nic
 * @property {string} registeredOn
 * @property {Array<{from: string, enterpriseClass: 'micro'|'small'|'medium'}>} classHistory
 * @property {'active'|'lapsed'} status
 * @property {string|null} lapsedOn
 */

const active = (entry) => ({ status: 'active', lapsedOn: null, ...entry });

export const registrations = [
  // ---------------------------------------------------------------- controls
  active({
    udyam: 'UDYAM-MH-26-0041872', name: 'Sharma Enterprises Private Limited',
    state: 'Maharashtra', stateCode: '27', nic: 25113, registeredOn: '2021-07-14',
    classHistory: [{ from: '2021-07-14', enterpriseClass: 'micro' }],
  }),
  active({
    udyam: 'UDYAM-KA-03-0119265', name: 'Nandi Precision Components LLP',
    state: 'Karnataka', stateCode: '29', nic: 25999, registeredOn: '2022-02-02',
    classHistory: [{ from: '2022-02-02', enterpriseClass: 'small' }],
  }),
  active({
    udyam: 'UDYAM-TN-14-0087431', name: 'Aruna Packaging Solutions',
    state: 'Tamil Nadu', stateCode: '33', nic: 17021, registeredOn: '2020-11-30',
    classHistory: [{ from: '2020-11-30', enterpriseClass: 'micro' }],
  }),
  active({
    udyam: 'UDYAM-GJ-09-0055120', name: 'Meghdoot Logistics Co',
    state: 'Gujarat', stateCode: '24', nic: 49231, registeredOn: '2023-01-19',
    classHistory: [{ from: '2023-01-19', enterpriseClass: 'small' }],
  }),

  // -------------------------------------------- medium: out of scope entirely
  active({
    udyam: 'UDYAM-MH-26-0011903', name: 'Vertex Industrial Systems Limited',
    state: 'Maharashtra', stateCode: '27', nic: 28299, registeredOn: '2019-08-05',
    classHistory: [{ from: '2019-08-05', enterpriseClass: 'medium' }],
  }),

  // ------------------------- the K.P. Works pair: same state, activity decides
  // Both Delhi micro enterprises, so the GSTIN prefix cannot separate them.
  // The invoice is for printed catalogues. One prints; one trades.
  // Picking the wrong one flips coverage.
  active({
    udyam: 'UDYAM-DL-05-0203311', name: 'Kavya Print Works',
    state: 'Delhi', stateCode: '07', nic: 18112, registeredOn: '2021-03-08',
    classHistory: [{ from: '2021-03-08', enterpriseClass: 'micro' }],
  }),
  active({
    udyam: 'UDYAM-DL-05-0761204', name: 'K P Works Trading Company',
    state: 'Delhi', stateCode: '07', nic: 46909, registeredOn: '2024-06-21',
    classHistory: [{ from: '2024-06-21', enterpriseClass: 'micro' }],
  }),

  // ------------------------------- registered trader: the headline exclusion
  active({
    udyam: 'UDYAM-MH-26-0330871', name: 'Orion Steel Traders Private Limited',
    state: 'Maharashtra', stateCode: '27', nic: 46721, registeredOn: '2022-09-12',
    classHistory: [{ from: '2022-09-12', enterpriseClass: 'small' }],
  }),

  // ---------------- registered under a trading code, but actually fabricates
  active({
    udyam: 'UDYAM-PB-02-0144902', name: 'Bhaskar Metal Industries',
    state: 'Punjab', stateCode: '03', nic: 46721, registeredOn: '2021-11-04',
    classHistory: [{ from: '2021-11-04', enterpriseClass: 'small' }],
  }),

  // ------------------------------------------- lapsed part-way through the year
  {
    udyam: 'UDYAM-TN-14-0290118', name: 'Suvarna Textile Mills Private Limited',
    state: 'Tamil Nadu', stateCode: '33', nic: 13921, registeredOn: '2020-08-17',
    classHistory: [{ from: '2020-08-17', enterpriseClass: 'small' }],
    status: 'lapsed', lapsedOn: '2025-11-30',
  },

  // --------------------------------- grew small -> medium, mid financial year
  active({
    udyam: 'UDYAM-HR-06-0072244', name: 'Girish Auto Components LLP',
    state: 'Haryana', stateCode: '06', nic: 25999, registeredOn: '2019-05-30',
    classHistory: [
      { from: '2019-05-30', enterpriseClass: 'small' },
      { from: '2026-01-15', enterpriseClass: 'medium' },
    ],
  }),

  // ------------------- the Deccan pair: different states, GSTIN disambiguates
  // Decoy listed first on purpose. A registry search has no inherent order, and
  // "take the top scoring match" is exactly how a naive matcher loses the tie.
  active({
    udyam: 'UDYAM-TS-19-0088340', name: 'Deccan Boards & Supplies',
    state: 'Telangana', stateCode: '36', nic: 46630, registeredOn: '2023-07-25',
    classHistory: [{ from: '2023-07-25', enterpriseClass: 'small' }],
  }),
  active({
    udyam: 'UDYAM-KA-03-0501773', name: 'Deccan Board Industries',
    state: 'Karnataka', stateCode: '29', nic: 17029, registeredOn: '2022-04-11',
    classHistory: [{ from: '2022-04-11', enterpriseClass: 'micro' }],
  }),

  // ------------------------------------------------------ service providers
  active({
    udyam: 'UDYAM-RJ-17-0166201', name: 'Falcon Freight Movers',
    state: 'Rajasthan', stateCode: '08', nic: 49231, registeredOn: '2023-03-02',
    classHistory: [{ from: '2023-03-02', enterpriseClass: 'micro' }],
  }),
  active({
    udyam: 'UDYAM-GA-01-0021975', name: 'Sagar Marine Services LLP',
    state: 'Goa', stateCode: '30', nic: 52221, registeredOn: '2021-12-09',
    classHistory: [{ from: '2021-12-09', enterpriseClass: 'small' }],
  }),

  // ---------------------------------------------------- retail: out of scope
  active({
    udyam: 'UDYAM-UP-28-0455190', name: 'Sunrise Stationery Mart',
    state: 'Uttar Pradesh', stateCode: '09', nic: 47630, registeredOn: '2023-05-18',
    classHistory: [{ from: '2023-05-18', enterpriseClass: 'micro' }],
  }),
  active({
    udyam: 'UDYAM-PB-02-0399801', name: 'Tricity Hardware Stores',
    state: 'Punjab', stateCode: '03', nic: 47521, registeredOn: '2022-06-30',
    classHistory: [{ from: '2022-06-30', enterpriseClass: 'micro' }],
  }),

  // ------------------------------------------------- manufacturers, in scope
  active({
    udyam: 'UDYAM-MP-23-0204416', name: 'Anantha Tooling Works',
    state: 'Madhya Pradesh', stateCode: '23', nic: 25931, registeredOn: '2021-01-27',
    classHistory: [{ from: '2021-01-27', enterpriseClass: 'micro' }],
  }),
  active({
    udyam: 'UDYAM-MH-26-0288013', name: 'Prabhat Electrical Systems Private Limited',
    state: 'Maharashtra', stateCode: '27', nic: 27900, registeredOn: '2020-02-14',
    classHistory: [{ from: '2020-02-14', enterpriseClass: 'small' }],
  }),
  active({
    udyam: 'UDYAM-GJ-09-0177302', name: 'Yamuna Chemicals & Solvents',
    state: 'Gujarat', stateCode: '24', nic: 20119, registeredOn: '2022-10-08',
    classHistory: [{ from: '2022-10-08', enterpriseClass: 'small' }],
  }),
  active({
    udyam: 'UDYAM-OD-22-0061188', name: 'Konark Printing Press',
    state: 'Odisha', stateCode: '21', nic: 18112, registeredOn: '2021-09-16',
    classHistory: [{ from: '2021-09-16', enterpriseClass: 'micro' }],
  }),
  active({
    udyam: 'UDYAM-KL-11-0133027', name: 'Himalaya Rubber Products',
    state: 'Kerala', stateCode: '32', nic: 22199, registeredOn: '2023-02-21',
    classHistory: [{ from: '2023-02-21', enterpriseClass: 'micro' }],
  }),
  active({
    udyam: 'UDYAM-WB-10-0442096', name: 'Nirmal Castings Private Limited',
    state: 'West Bengal', stateCode: '19', nic: 24310, registeredOn: '2020-06-11',
    classHistory: [{ from: '2020-06-11', enterpriseClass: 'small' }],
  }),

  // ----------------- the Ganga pair: near-identical names, different entities
  active({
    udyam: 'UDYAM-UP-28-0710884', name: 'Ganga Enterprise',
    state: 'Uttar Pradesh', stateCode: '09', nic: 46909, registeredOn: '2024-01-30',
    classHistory: [{ from: '2024-01-30', enterpriseClass: 'micro' }],
  }),
  active({
    udyam: 'UDYAM-BR-04-0093351', name: 'Ganga Enterprises',
    state: 'Bihar', stateCode: '10', nic: 25999, registeredOn: '2022-08-19',
    classHistory: [{ from: '2022-08-19', enterpriseClass: 'micro' }],
  }),

  // ------------------- registered manufacturer, but one supply is pass-through
  active({
    udyam: 'UDYAM-TN-14-0355642', name: 'Zenith Packaging Industries',
    state: 'Tamil Nadu', stateCode: '33', nic: 17029, registeredOn: '2021-05-25',
    classHistory: [{ from: '2021-05-25', enterpriseClass: 'small' }],
  }),
];

/** Category as at a given date. Coverage is judged as at the supply date. */
export function classAt(reg, isoDate) {
  const applicable = reg.classHistory
    .filter((h) => h.from <= isoDate)
    .sort((a, b) => a.from.localeCompare(b.from));
  return applicable.length ? applicable[applicable.length - 1].enterpriseClass : null;
}

/** Was the registration live on that date? */
export function activeAt(reg, isoDate) {
  if (reg.registeredOn > isoDate) return false;
  if (reg.status === 'lapsed' && reg.lapsedOn && reg.lapsedOn <= isoDate) return false;
  return true;
}

export const byUdyam = (udyam) => registrations.find((r) => r.udyam === udyam) || null;
