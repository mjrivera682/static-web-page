// Demo configuration validation. The runtime refuses to start with an invalid config.

import { COUNTRIES } from './countries.js';

export const APP_KEY_PLACEHOLDER = 'REPLACE_WITH_DEMO_APP_KEY';
const FIELD_TYPES = new Set(['text', 'email', 'tel', 'select', 'checkbox']);
const SENSITIVE_ID = /pass(word)?|pwd|secret|token|card|cvv|pin\b/i;
const VALUE_TYPES = new Set(['string', 'number', 'boolean']);
const PHONE_PARTS = new Set(['e164', 'digits', 'countryCode', 'national', 'country']);

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
  const byId = {};
  for (const f of fields) {
    need(typeof f.id === 'string' && f.id, 'every field needs an id');
    need(FIELD_TYPES.has(f.type), `field ${f.id}: unknown type ${f.type}`);
    need(!SENSITIVE_ID.test(f.id ?? ''), `field ${f.id}: passwords and payment data are not allowed`);
    need(!('cdpField' in f), `field ${f.id}: use cdpMapping instead of cdpField`);
    need(!ids.has(f.id), `duplicate field id ${f.id}`);
    ids.add(f.id);
    byId[f.id] = f;
    if (f.type === 'select') need(Array.isArray(f.options) && f.options.length > 0, `field ${f.id}: select needs options`);
    if (f.type === 'tel') {
      need(Array.isArray(f.countries) && f.countries.length > 0, `field ${f.id}: tel needs a countries list`);
      for (const iso of f.countries ?? []) need(Boolean(COUNTRIES[iso]), `field ${f.id}: unknown country ${iso}`);
      need((f.countries ?? []).includes(f.defaultCountry), `field ${f.id}: defaultCountry must be in countries`);
    }
  }

  // Paths like "name" or "phone.digits" (tel fields expose e164, digits, countryCode, national, country).
  const validPath = (path) => {
    const [id, part, ...rest] = String(path ?? '').split('.');
    if (!ids.has(id) || rest.length) return false;
    if (byId[id].type === 'tel') return PHONE_PARTS.has(part);
    return part === undefined;
  };

  const mapping = Array.isArray(config.cdpMapping) ? config.cdpMapping : [];
  need(mapping.length > 0, 'cdpMapping must list the existing CDP attributes to write');
  const cdp = new Set(Object.keys(config.staticAttributes ?? {}));
  for (const m of mapping) {
    need(typeof m.cdpField === 'string' && m.cdpField, 'every cdpMapping entry needs cdpField');
    need(!SENSITIVE_ID.test(m.cdpField ?? ''), `cdpMapping ${m.cdpField}: passwords and payment data are not allowed`);
    need(!cdp.has(m.cdpField), `duplicate CDP attribute ${m.cdpField}`);
    cdp.add(m.cdpField);
    need(validPath(m.from), `cdpMapping ${m.cdpField}: invalid source "${m.from}"`);
    need(VALUE_TYPES.has(m.type ?? 'string'), `cdpMapping ${m.cdpField}: type must be string, number or boolean`);
    if (validPath(m.from) && byId[String(m.from).split('.')[0]].type === 'tel') {
      need(String(m.from).includes('.'), `cdpMapping ${m.cdpField}: map a part of the phone, e.g. phone.digits`);
    }
  }
  const strategy = config.identity?.strategy;
  if (strategy) need(fields.some((f) => f.id === strategy && f.required), `identity.strategy "${strategy}" needs a required field with id "${strategy}"`);

  need(typeof config.event?.name === 'string' && config.event.name.length > 0, 'event.name is required');
  for (const d of config.event?.data ?? []) {
    need(d && typeof d.key === 'string' && d.key, 'every event.data entry needs a key');
    need(validPath(d?.from), `event.data ${d?.key}: invalid source "${d?.from}"`);
    need(VALUE_TYPES.has(d?.type ?? 'string'), `event.data ${d?.key}: type must be string, number or boolean`);
  }

  // No profile read-back in the flow (frontend-only SDK integration): only "off" is valid.
  const verify = config.flow?.verifyProfile ?? 'off';
  need(verify === 'off', 'flow.verifyProfile must be "off": the flow does not read the profile back');

  // Optional In-Web modality (same CDP, same event; only the static attributes differ).
  const iw = config.inweb;
  if (iw !== undefined && iw !== null) {
    need(typeof iw.enabled === 'boolean', 'inweb.enabled must be true or false');
    need(iw.inAppCode === null || (typeof iw.inAppCode === 'string' && /^[A-Za-z0-9_.-]+$/.test(iw.inAppCode)),
      'inweb.inAppCode must be null or a code (letters, digits, _ . -)');
    need(iw.urlInAppApi === null || iw.urlInAppApi === undefined || /^https:\/\/[^\s]+\/v2$/.test(iw.urlInAppApi),
      'inweb.urlInAppApi must be null (EU1 default) or an https Device API v2 URL ending in /v2');
    need(typeof iw.viewId === 'string' && /^[A-Za-z][\w-]*$/.test(iw.viewId), 'inweb.viewId must be a valid element id');
    for (const dim of ['width', 'height']) {
      need(Number.isInteger(iw[dim]) && iw[dim] > 0 && iw[dim] <= 2000, `inweb.${dim} must be a positive integer (px)`);
    }
    need(iw.profile === null || iw.profile === undefined || typeof iw.profile === 'string', 'inweb.profile must be null or a string');
    need(iw.staticAttributes && typeof iw.staticAttributes === 'object', 'inweb.staticAttributes is required');
    for (const k of Object.keys(iw.staticAttributes ?? {})) {
      need(cdp.has(k), `inweb.staticAttributes.${k} must be an existing CDP attribute of this demo`);
    }
    const fm = iw.fieldMapping ?? {};
    for (const k of ['name', 'email', 'phone', 'product', 'consent']) {
      need(typeof fm[k] === 'string' && fm[k].length > 0, `inweb.fieldMapping.${k} is required (In-Web input id)`);
    }
    if (fm.country !== undefined) need(typeof fm.country === 'string', 'inweb.fieldMapping.country must be a string');
    if (iw.defaultCountry !== undefined) need(Boolean(COUNTRIES[iw.defaultCountry]), 'inweb.defaultCountry must be a supported country');
  }

  return problems;
}
