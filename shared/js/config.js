// Demo configuration validation. The runtime refuses to start with an invalid config.

export const APP_KEY_PLACEHOLDER = 'REPLACE_WITH_DEMO_APP_KEY';
const FIELD_TYPES = new Set(['text', 'email', 'tel', 'select', 'checkbox']);
const SENSITIVE_ID = /pass(word)?|pwd|secret|token|card|cvv|pin\b/i;

/** @returns {string[]} list of problems; empty when valid */
export function validateConfig(config) {
  const problems = [];
  const need = (cond, msg) => { if (!cond) problems.push(msg); };

  need(config && typeof config === 'object', 'config must be an object');
  if (problems.length) return problems;

  need(config.schemaVersion === 1, 'schemaVersion must be 1');
  need(typeof config.slug === 'string' && /^[a-z0-9-]+$/.test(config.slug), 'slug must be lowercase letters, digits and dashes');

  const ind = config.indigitall ?? {};
  need(typeof ind.sdkVersion === 'string' && /^\d+\.\d+\.\d+$/.test(ind.sdkVersion), 'indigitall.sdkVersion must look like 4.18.1');
  need(typeof ind.appKey === 'string' && ind.appKey.length > 0, 'indigitall.appKey is required');
  need(['disabled', 'enabled'].includes(ind.pushMode ?? 'disabled'), 'indigitall.pushMode must be "disabled" or "enabled"');
  need(['dry-run', 'live'].includes(config.mode), 'mode must be "dry-run" or "live"');
  if (config.mode === 'live') {
    need(ind.appKey !== APP_KEY_PLACEHOLDER, 'mode "live" needs a real appKey');
    // SDK 4.18.1: link() rejects Channel.NONE and needs the push service enabled.
    need(ind.pushMode === 'enabled', 'mode "live" needs indigitall.pushMode "enabled" (customer identification requires Web Push)');
  }

  need(['email', 'phone'].includes(config.identity?.strategy), 'identity.strategy must be "email" or "phone"');

  const fields = Array.isArray(config.fields) ? config.fields : [];
  need(fields.length > 0, 'fields must be a non-empty array');
  const ids = new Set();
  const cdp = new Set();
  for (const f of fields) {
    need(typeof f.id === 'string' && f.id, 'every field needs an id');
    need(FIELD_TYPES.has(f.type), `field ${f.id}: unknown type ${f.type}`);
    need(!SENSITIVE_ID.test(f.id ?? '') && !SENSITIVE_ID.test(f.cdpField ?? ''), `field ${f.id}: passwords and payment data are not allowed`);
    need(!ids.has(f.id), `duplicate field id ${f.id}`);
    ids.add(f.id);
    if (f.cdpField) { need(!cdp.has(f.cdpField), `duplicate cdpField ${f.cdpField}`); cdp.add(f.cdpField); }
    if (f.type === 'select') need(Array.isArray(f.options) && f.options.length > 0, `field ${f.id}: select needs options`);
  }
  const strategy = config.identity?.strategy;
  if (strategy) need(fields.some((f) => f.id === strategy && f.required), `identity.strategy "${strategy}" needs a required field with id "${strategy}"`);

  need(typeof config.event?.name === 'string' && config.event.name.length > 0, 'event.name is required');
  for (const id of config.event?.data ?? []) need(ids.has(id), `event.data references unknown field ${id}`);

  // No profile read-back in the flow (frontend-only SDK integration): only "off" is valid.
  const verify = config.flow?.verifyProfile ?? 'off';
  need(verify === 'off', 'flow.verifyProfile must be "off": the flow does not read the profile back');

  return problems;
}
