// ---------------------------------------------------------------------------
// DETERMINISTIC COVERAGE RULE
//
// Does s.43B(h) engage for this supply at all?
//
// This is the second load-bearing decision in the product, and it gets the
// same treatment as the deadline arithmetic: the agent supplies evidence, a
// hardcoded rule decides. Letting a model return "covered: true" would put
// back exactly the exposure engine/deadline.js exists to remove -- a wrong
// coverage call costs as much as a wrong date.
//
// Coverage is a function of the SUPPLY DATE, not of today. A vendor
// reclassified to medium in January was still covered in December.
// ---------------------------------------------------------------------------

export const COVERED_CLASSES = ['micro', 'small'];

/** Registered-activity buckets the rule understands. */
export const ACTIVITY = { MANUFACTURING: 'manufacturing', SERVICE: 'service', TRADING: 'trading' };

/** What the supplier actually did on this invoice. */
export const SUPPLY = { MANUFACTURED: 'manufactured', SERVICE: 'service', RESALE: 'resale', UNKNOWN: 'unknown' };

export const RESULT = { COVERED: 'covered', NOT_COVERED: 'not_covered', UNKNOWN: 'unknown' };

/**
 * @param {object} e   evidence, all of it supplied by the portfolio/invoice agent
 * @param {boolean} e.registrationFound
 * @param {string|null} e.enterpriseClass      as at the supply date
 * @param {boolean} e.registrationActive       as at the supply date
 * @param {string|null} e.registeredActivity   manufacturing | service | trading
 * @param {string} e.supplyNature              manufactured | service | resale | unknown
 * @param {number} e.identityConfidence        0..1
 * @param {number} [e.confidenceFloor]         below this, escalate rather than decide
 * @returns {{result: string, reasonCode: string, workings: string[], needsReview: boolean}}
 */
export function decideCoverage(e) {
  const workings = [];
  const floor = e.confidenceFloor ?? 0.6;

  if (!e.registrationFound) {
    workings.push('No Udyam registration could be resolved for this vendor.');
    workings.push('Unknown is not the same as not-covered — escalating rather than assuming.');
    return { result: RESULT.UNKNOWN, reasonCode: 'no_registration_found', workings, needsReview: true };
  }

  if (Number(e.identityConfidence) < floor) {
    workings.push(`Registration matched at confidence ${e.identityConfidence}, below the ${floor} threshold.`);
    workings.push('Coverage turns on which entity this is, so this is escalated rather than decided.');
    return { result: RESULT.UNKNOWN, reasonCode: 'identity_uncertain', workings, needsReview: true };
  }

  if (!e.registrationActive) {
    workings.push('Registration was not live on the supply date, so no obligation attaches to this supply.');
    return { result: RESULT.NOT_COVERED, reasonCode: 'registration_not_live', workings, needsReview: false };
  }

  const cls = String(e.enterpriseClass || '').toLowerCase();
  if (!COVERED_CLASSES.includes(cls)) {
    workings.push(`Enterprise was ${cls || 'unclassified'} on the supply date. s.43B(h) reaches micro and small only.`);
    return { result: RESULT.NOT_COVERED, reasonCode: 'not_micro_or_small', workings, needsReview: false };
  }
  workings.push(`Enterprise was ${cls} on the supply date — within scope on size.`);

  const activity = String(e.registeredActivity || '').toLowerCase();
  const supply = String(e.supplyNature || SUPPLY.UNKNOWN).toLowerCase();

  // Trading registration is a prior against coverage, not a verdict. Evidence
  // that this particular supply was manufactured or a service rebuts it.
  if (activity === ACTIVITY.TRADING) {
    if (supply === SUPPLY.MANUFACTURED || supply === SUPPLY.SERVICE) {
      workings.push('Registered activity is trade, but the evidence is that this supply was ' +
        `${supply === SUPPLY.SERVICE ? 'a service' : 'manufactured by the supplier'} — the registration code is rebutted.`);
      return { result: RESULT.COVERED, reasonCode: 'trading_registration_rebutted', workings, needsReview: false };
    }
    if (supply === SUPPLY.UNKNOWN) {
      workings.push('Registered activity is trade and the nature of this supply could not be established.');
      return { result: RESULT.UNKNOWN, reasonCode: 'trading_supply_unclear', workings, needsReview: true };
    }
    workings.push('Registered under wholesale/retail trade and supplied as a reseller. ' +
      'Trade was admitted to Udyam for priority-sector lending, not for the s.15 obligation s.43B(h) depends on.');
    return { result: RESULT.NOT_COVERED, reasonCode: 'trading_enterprise', workings, needsReview: false };
  }

  // A manufacturer can still act as a pass-through on a given supply.
  if (supply === SUPPLY.RESALE) {
    workings.push('Registered as a producer, but this supply was third-party material passed through ' +
      'without further processing, so it is not a covered supply on its own facts.');
    return { result: RESULT.NOT_COVERED, reasonCode: 'pass_through_supply', workings, needsReview: false };
  }

  workings.push(`Registered activity is ${activity || 'production'} and the supply is consistent with it.`);
  return { result: RESULT.COVERED, reasonCode: 'covered', workings, needsReview: false };
}

/** Map a NIC code to the bucket the rule understands. Divisions 45-47 are trade. */
export function activityFromNic(nic) {
  const div = Math.floor(Number(nic) / 1000);
  if ([45, 46, 47].includes(div)) return ACTIVITY.TRADING;
  if (div >= 10 && div <= 33) return ACTIVITY.MANUFACTURING;
  return ACTIVITY.SERVICE;
}
