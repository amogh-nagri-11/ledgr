// RazorpayX Payouts. Sandbox keys only; never hardcoded.
//
// Money only moves on a human click, or -- for amounts at or under the
// configured auto-execute threshold -- on a scheduling decision the user has
// explicitly enabled. Either way this is a workflow trigger against the
// merchant's own already-licensed RazorpayX account.

const API_BASE = process.env.RAZORPAYX_BASE_URL || 'https://api.razorpay.com/v1';

export function razorpayConfigured() {
  return Boolean(process.env.RAZORPAYX_KEY_ID && process.env.RAZORPAYX_KEY_SECRET && process.env.RAZORPAYX_ACCOUNT_NUMBER);
}

export function mode() {
  return razorpayConfigured() ? 'sandbox' : 'mock';
}

/**
 * @param {object} p
 * @param {object} p.invoice
 * @param {object} p.vendor
 * @param {string} p.purpose      'vendor bill'
 * @param {string} p.scheduleFor  ISO date; today means pay now
 * @param {string} p.narration
 */
export async function createPayout({ invoice, vendor, scheduleFor, narration }) {
  if (!razorpayConfigured()) {
    return {
      payoutId: `pout_mock_${invoice.id.replace(/\W/g, '')}_${Date.now().toString(36)}`,
      status: 'scheduled',
      date: scheduleFor,
      amount: invoice.amount,
      mode: 'NEFT',
      source: 'mock',
      note: 'RazorpayX credentials are not configured, so this payout was simulated. Set RAZORPAYX_* env vars to hit the sandbox.',
    };
  }

  const auth = Buffer
    .from(`${process.env.RAZORPAYX_KEY_ID}:${process.env.RAZORPAYX_KEY_SECRET}`)
    .toString('base64');

  const body = {
    account_number: process.env.RAZORPAYX_ACCOUNT_NUMBER,
    amount: invoice.amount * 100,        // RazorpayX takes paise
    currency: 'INR',
    mode: 'NEFT',
    purpose: 'vendor bill',
    queue_if_low_balance: true,
    reference_id: invoice.id,
    narration: (narration || `Ledgr 43B(h) ${invoice.id}`).slice(0, 30),
    fund_account_id: vendor.fundAccountId || process.env.RAZORPAYX_TEST_FUND_ACCOUNT_ID,
    notes: {
      invoice_id: invoice.id,
      vendor: vendor.ledgerName,
      raised_by: 'ledgr',
    },
  };

  const res = await fetch(`${API_BASE}/payouts`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      'X-Payout-Idempotency': `${invoice.id}-${scheduleFor}`,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.description || `RazorpayX returned ${res.status}`;
    throw new Error(msg);
  }

  return {
    payoutId: json.id,
    status: json.status === 'processed' ? 'processed' : 'scheduled',
    date: scheduleFor,
    amount: invoice.amount,
    mode: json.mode || 'NEFT',
    source: 'razorpayx_sandbox',
    utr: json.utr || null,
    raw: json,
  };
}

/** Feedback loop: confirm execution and close the compliance item. */
export async function fetchPayoutStatus(payoutId) {
  if (!razorpayConfigured() || String(payoutId).startsWith('pout_mock')) {
    return { id: payoutId, status: 'processing', source: 'mock' };
  }
  const auth = Buffer
    .from(`${process.env.RAZORPAYX_KEY_ID}:${process.env.RAZORPAYX_KEY_SECRET}`)
    .toString('base64');
  const res = await fetch(`${API_BASE}/payouts/${payoutId}`, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) throw new Error(`RazorpayX returned ${res.status}`);
  return res.json();
}
