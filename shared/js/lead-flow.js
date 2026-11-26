// Lead capture sequence. Each step waits for the SDK's success callback; any error
// stops the flow, so the journey event is never sent without a confirmed profile.
//
//   validate → identify (link) → set fields → verify (optional) → send event

import {
  validateLead, buildExternalId, buildCustomerFields, buildEventData,
} from './normalize.js';
import { SdkError, extractCustomerFields } from './indigitall-client.js';

export const STEPS = ['validate', 'identify', 'setFields', 'verify', 'sendEvent'];

export class FlowError extends Error {
  constructor(step, cause) {
    super(`${step}: ${cause?.message ?? cause}`);
    this.name = 'FlowError';
    this.step = step;
    this.code = cause?.code ?? 'UNKNOWN';
    this.cause = cause;
  }
}

/** Stable fingerprint of the normalized data, so a retry of the same data reuses its eventId. */
export function fingerprint(values) {
  return JSON.stringify(Object.keys(values).sort().map((k) => [k, values[k]]));
}

/** Compare sent fields with what the platform returned. Values compared as strings. */
export function compareFields(sent, received) {
  const mismatches = [];
  for (const [k, v] of Object.entries(sent)) {
    if (!(k in received)) mismatches.push({ field: k, reason: 'missing' });
    else if (String(received[k]) !== String(v)) mismatches.push({ field: k, reason: 'different' });
  }
  return mismatches;
}

/**
 * @param {object} p
 * @param {object} p.config      demo config
 * @param {object} p.rawValues   form values keyed by field id
 * @param {object} p.client      createIndigitallClient(...)
 * @param {object} p.guard       createGuard(...)
 * @param {object} p.diag        createDiagnostics(...)
 * @param {() => Date} [p.now]
 * @returns {Promise<{status:'sent'|'invalid'|'blocked'|'ignored', ...}>}
 *          resolves for validation/guard outcomes; rejects with FlowError on SDK failure
 */
export async function runLeadFlow({ config, rawValues, honeypot, client, guard, diag, now = () => new Date() }) {
  if (guard.isBot(honeypot)) {
    diag.info('Honeypot filled: submission ignored');
    return { status: 'ignored' };
  }

  const { ok, values, errors } = validateLead(config.fields, rawValues);
  if (!ok) return { status: 'invalid', errors };

  const submissionId = guard.acquire(fingerprint(values));
  if (!submissionId) return { status: 'blocked', cooldown: guard.cooldownRemaining() };

  const flow = config.flow ?? {};
  const event = config.event;
  try {
    const externalId = buildExternalId(config.identity, values);
    const customerFields = buildCustomerFields(config.fields, values, config.staticAttributes);
    const eventAt = now().toISOString();
    const eventData = buildEventData(event, values);
    if (event.includeTimestamp) eventData.submitted_at = eventAt;

    await run(diag, 'identify', { externalId, channel: 'Channel.NONE' }, () => client.identify(externalId));
    diag.set({ identity: 'identified', externalId: diag.enabled ? externalId : null });

    await run(diag, 'setFields', customerFields, () => client.setFields(customerFields));

    let verification = 'skipped';
    const verifyMode = flow.verifyProfile ?? 'lenient';
    if (verifyMode !== 'off') {
      verification = await run(diag, 'verify', null, async () => {
        const received = extractCustomerFields(await client.getFields());
        if (!received) {
          if (verifyMode === 'strict') throw new SdkError('PROFILE_UNVERIFIABLE', 'Unrecognized getCustomerInformation response');
          return 'unrecognized-response';
        }
        const mismatches = compareFields(customerFields, received);
        if (mismatches.length) {
          throw Object.assign(new SdkError('PROFILE_MISMATCH', `Fields not persisted: ${mismatches.map((m) => m.field).join(', ')}`), { mismatches });
        }
        return 'verified';
      });
    }

    await run(diag, 'sendEvent', { eventCode: event.name, eventId: submissionId, eventAt, data: eventData },
      () => client.sendEvent(event.name, submissionId, eventAt, eventData));

    guard.complete();
    diag.set({ lastConfirmation: 'ACCEPTED_BY_API' });
    diag.info('Event accepted by the API. Journey execution can only be confirmed in the indigitall console.');
    return { status: 'sent', submissionId, verification };
  } catch (err) {
    guard.release();
    throw err instanceof FlowError ? err : new FlowError('prepare', err);
  }
}

async function run(diag, step, payload, fn) {
  try {
    return await diag.step(step, payload, fn);
  } catch (err) {
    throw new FlowError(step, err);
  }
}
