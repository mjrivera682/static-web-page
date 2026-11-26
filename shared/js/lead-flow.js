// Lead capture sequence. Each step waits for the SDK's success callback; any error
// stops the flow, so the journey event is never sent without a confirmed profile.
//
//   SDK initialization → Web Push opt-in → device registration
//   → identify (link, Channel.PUSH) → CDP attribute update → custom event
//
// There is no read-back of the profile: the Web SDK has no supported, frontend-only way
// to verify persisted attributes for this use case, and the check would block the
// commercial flow. Persisted attributes are checked manually in the indigitall console.

import {
  validateLead, buildExternalId, buildCustomerFields, buildEventData,
} from './normalize.js';
import { SdkError } from './indigitall-client.js';

export const STEPS = ['device', 'identify', 'setFields', 'sendEvent'];

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hash = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Remembers which customer this browser linked last, to unlink it before linking a
 * different email. Stores only a SHA-256 of the External ID under the demo's own key;
 * it never reads or writes the SDK's internal storage.
 */
export function createIdentityStore({ scope, storage, digest = sha256Hex }) {
  const key = `demo.${scope}.linkedIdentity`;
  return {
    fingerprint: (externalId) => digest(`${scope}:${externalId}`),
    previous() { try { return storage?.getItem(key) ?? null; } catch { return null; } },
    remember(hash) { try { if (hash) storage?.setItem(key, hash); } catch { /* storage blocked */ } },
    forget() { try { storage?.removeItem(key); } catch { /* storage blocked */ } },
  };
}

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

/**
 * @param {object} p
 * @param {object} p.config      demo config
 * @param {object} p.rawValues   form values keyed by field id
 * @param {object} p.client      createIndigitallClient(...)
 * @param {object} p.guard       createGuard(...)
 * @param {object} p.diag        createDiagnostics(...)
 * @param {object} [p.identityStore] createIdentityStore(...): detects identity changes
 * @param {object} [p.staticAttributes] overrides config.staticAttributes for this request only
 * @param {() => Date} [p.now]
 * @returns {Promise<{status:'sent'|'invalid'|'blocked'|'ignored', ...}>}
 *          resolves for validation/guard outcomes; rejects with FlowError on SDK failure
 */
export async function runLeadFlow({
  config, rawValues, honeypot, client, guard, diag, identityStore, simulated = false, now = () => new Date(),
  staticAttributes,
}) {
  // Per-request static attributes (e.g. Origen of the In-Web modality); the demo default otherwise.
  const statics = staticAttributes ?? config.staticAttributes ?? {};
  if (guard.isBot(honeypot)) {
    diag.info('Honeypot filled: submission ignored');
    return { status: 'ignored' };
  }

  const { ok, values, errors } = validateLead(config.fields, rawValues);
  if (!ok) return { status: 'invalid', errors };

  const submissionId = guard.acquire(fingerprint(values));
  if (!submissionId) return { status: 'blocked', cooldown: guard.cooldownRemaining() };

  const event = config.event;
  try {
    const externalId = buildExternalId(config.identity, values);
    const customerFields = buildCustomerFields(config.cdpMapping, values, statics);
    const eventAt = now().toISOString();
    const eventData = buildEventData(event, values);
    // The demo flag (e.g. lead_source) also travels in the event, so the journey can
    // filter on it without reading the profile.
    if (event.includeStaticAttributes) Object.assign(eventData, statics);
    if (event.includeTimestamp) eventData.submitted_at = eventAt;

    // 1-2. SDK operational and device registered (Web Push): required by link().
    if (client.pushEnabled && !client.deviceId) {
      throw new FlowError('device', new SdkError('DEVICE_NOT_REGISTERED', 'Enable notifications first'));
    }

    // Identity change on the same device: unlink the previous customer first.
    // Only a hash of the previous External ID is kept, in the demo's own storage key.
    const currentIdentity = identityStore ? await identityStore.fingerprint(externalId) : null;
    if (identityStore) {
      const previous = identityStore.previous();
      if (previous && previous !== currentIdentity) {
        try {
          await run(diag, 'unlinkPrevious', { channel: client.channelName }, () => client.reset());
        } catch {
          diag.info('Previous customer could not be unlinked; continuing with link()');
        }
        identityStore.forget();
      }
    }

    // 3. Identification: email as External ID, linked to this device's push channel.
    diag.set({ identity: 'identifying', linkChannel: client.channelName });
    try {
      await run(diag, 'identify', { externalId, channel: client.channelName }, () => client.identify(externalId));
    } catch (err) {
      diag.set({ identity: 'error' });
      throw err;
    }
    identityStore?.remember(currentIdentity);
    diag.set({ identity: 'identified', externalId: diag.enabled ? externalId : null });

    // 4. Customer fields.
    try {
      await run(diag, 'setFields', customerFields, () => client.setFields(customerFields));
      diag.set({ cdp: simulated ? 'write accepted (simulated)' : 'write accepted by the SDK (no read-back)' });
    } catch (err) {
      diag.set({ cdp: 'error' });
      throw err;
    }

    // 5. Journey event, only after the SDK accepted the attribute write.
    try {
      await run(diag, 'sendEvent', { eventCode: event.name, data: eventData, eventId: submissionId, eventAt },
        () => client.sendEvent(event.name, submissionId, eventAt, eventData));
      diag.set({ event: simulated ? 'accepted (simulated)' : 'accepted' });
    } catch (err) {
      diag.set({ event: 'error' });
      throw err;
    }

    guard.complete();
    if (simulated) {
      diag.set({ lastConfirmation: 'SIMULATED (dry-run)' });
      diag.info('Dry-run: nothing was sent to indigitall.');
    } else {
      diag.set({ lastConfirmation: 'ACCEPTED_BY_API' });
      diag.info('Event accepted by the API. Journey execution can only be confirmed in the indigitall console.');
    }
    return { status: 'sent', submissionId };
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
