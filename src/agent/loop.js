// The shared agentic loop. Both agents investigate the same way; only their
// brief, their tool set and their submission schema differ.

import { chat, parseToolArgs, activeProvider } from './llm.js';
import { TOOL_IMPLS } from './tools.js';

const MAX_ITERATIONS = 10;

const fn = (name, description, properties, required) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } },
});

export const TOOL_DEFS = {
  search_udyam_registry: fn('search_udyam_registry',
    'Search the Udyam registry by name. Returns candidates with registered activity, and category and live status AS AT the date you pass.',
    { query: { type: 'string' }, as_of: { type: 'string', description: 'YYYY-MM-DD, the supply date' } },
    ['query', 'as_of']),
  get_udyam_registration: fn('get_udyam_registration',
    'Look up one registration by its number. Use this to check a number the vendor declared at onboarding.',
    { udyam: { type: 'string' }, as_of: { type: 'string', description: 'YYYY-MM-DD' } },
    ['udyam', 'as_of']),
  get_vendor_record: fn('get_vendor_record',
    "The buyer's own record: ledger name, GSTIN, and any registration number the vendor declared.",
    { vendor_id: { type: 'string' } }, ['vendor_id']),
  get_supply_history: fn('get_supply_history',
    'What this vendor has actually supplied, from invoice descriptions. Use it to judge whether they manufacture, provide a service, or resell.',
    { vendor_id: { type: 'string' } }, ['vendor_id']),
  get_vendor_documents: fn('get_vendor_documents',
    'Contracts and purchase-order terms on file for a vendor, as raw text. Amendments carry a `supersedes` field.',
    { vendor_id: { type: 'string' } }, ['vendor_id']),
  get_acceptance_documents: fn('get_acceptance_documents',
    'Delivery notes, goods receipt notes, emails and internal notes for one invoice, in date order, as raw documents.',
    { invoice_id: { type: 'string' } }, ['invoice_id']),
  get_payout_status: fn('get_payout_status',
    'Whether a RazorpayX payout is already scheduled or processed against this invoice.',
    { invoice_id: { type: 'string' } }, ['invoice_id']),
};

/**
 * Run one investigation.
 * @param {object} p
 * @param {string} p.system        the agent's brief
 * @param {string} p.prompt        the case
 * @param {string[]} p.toolNames   which investigation tools it may call
 * @param {object} p.submitTool    OpenAI-shaped tool definition for the finding
 * @param {string} p.submitName    its name
 * @returns {Promise<{submitted: object, trace: Array, model: string}>}
 */
export async function investigate({ system, prompt, toolNames, submitTool, submitName }) {
  const provider = activeProvider();
  const trace = [];
  const tools = [...toolNames.map((n) => TOOL_DEFS[n]), submitTool];
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: prompt },
  ];

  let submitted = null;

  for (let i = 0; i < MAX_ITERATIONS && !submitted; i += 1) {
    const message = await chat({ messages, tools, maxTokens: 3000 });
    messages.push(message);

    const calls = message.tool_calls || [];
    if (!calls.length) {
      if (i === MAX_ITERATIONS - 1) break;
      messages.push({
        role: 'user',
        content: `Do not answer in prose. Call a tool to investigate, or call ${submitName} with your conclusions.`,
      });
      continue;
    }

    for (const call of calls) {
      const name = call.function?.name;
      let content;
      try {
        const args = parseToolArgs(call.function?.arguments);
        if (name === submitName) {
          submitted = args;
          trace.push({ tool: submitName, input: {}, summary: 'Submitted conclusions with evidence' });
          content = 'Recorded.';
        } else if (TOOL_IMPLS[name]) {
          const result = TOOL_IMPLS[name](args);
          trace.push({ tool: name, input: args, summary: summarise(name, args, result) });
          content = JSON.stringify(result);
        } else {
          content = `Unknown tool "${name}".`;
        }
      } catch (err) {
        content = `Tool error: ${err.message}`;
      }
      messages.push({ role: 'tool', tool_call_id: call.id, name, content });
    }
  }

  if (!submitted) throw new Error(`Agent finished without calling ${submitName} after ${MAX_ITERATIONS} iterations.`);
  return { submitted, trace, model: `${provider.label} · ${provider.model}` };
}

export function summarise(name, input, result) {
  if (result && result.error) return result.error;
  switch (name) {
    case 'search_udyam_registry': {
      const top = result.candidates[0];
      const second = result.candidates[1];
      const tie = top && second && Math.abs(top.similarity - second.similarity) < 0.05;
      return `Searched "${input.query}" as at ${result.as_of} -> `
        + (top ? `${top.name} (${top.enterpriseClassAsOf}, ${top.registeredActivity}, sim ${top.similarity})` : 'nothing')
        + (tie ? ` — tied with ${second.name}` : '');
    }
    case 'get_udyam_registration':
      return result.found
        ? `${input.udyam} -> ${result.name}, ${result.enterpriseClassAsOf}, live ${result.registrationLiveAsOf}`
        : `${input.udyam} does not exist in the registry`;
    case 'get_vendor_record':
      return `Vendor record for ${input.vendor_id} -> GSTIN prefix ${result.gstinStatePrefix}, `
        + (result.vendor.declaredUdyam ? `declared ${result.vendor.declaredUdyam}` : 'nothing declared');
    case 'get_supply_history':
      return `Reviewed ${result.supplies.length} past supplies for ${input.vendor_id}`;
    case 'get_vendor_documents':
      return `Pulled documents for ${input.vendor_id} -> ${result.documentCount} on file`
        + (result.documents.some((d) => d.supersedes) ? ' (one is an amendment)' : '');
    case 'get_acceptance_documents':
      return `Read the acceptance trail for ${input.invoice_id} -> ${result.documentCount} document(s)`;
    case 'get_payout_status':
      return result.payout ? `Payout ${result.payout.status} on ${result.payout.date}` : 'No payout booked';
    default:
      return 'ok';
  }
}

export const clamp = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
};

export const str = (v) => (v == null ? '' : String(v).trim());
