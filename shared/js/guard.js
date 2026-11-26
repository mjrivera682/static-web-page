// Duplicate-submission and noise guard.
// IMPORTANT: this runs in the visitor's browser and can be bypassed. It prevents
// accidental double sends and casual spam; it is NOT a security control. The App Key
// is public, so real abuse protection must live in the Customer Journey (allowlist,
// frequency capping) or behind a server.

export function generateSubmissionId(cryptoImpl = globalThis.crypto) {
  if (cryptoImpl?.randomUUID) return cryptoImpl.randomUUID();
  const bytes = new Uint8Array(16);
  cryptoImpl.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function safeStorage(storage) {
  return {
    get(key) { try { return storage?.getItem(key) ?? null; } catch { return null; } },
    set(key, value) { try { storage?.setItem(key, value); } catch { /* storage blocked */ } },
    remove(key) { try { storage?.removeItem(key); } catch { /* storage blocked */ } },
  };
}

/**
 * @param {object} opts
 * @param {string} opts.scope           demo slug, so demos on the same origin don't share state
 * @param {number} [opts.cooldownSeconds]
 * @param {Storage} [opts.storage]      localStorage in the browser; omitted in tests
 * @param {() => number} [opts.now]
 */
export function createGuard({ scope, cooldownSeconds = 0, storage, now = () => Date.now() }) {
  const store = safeStorage(storage);
  const key = (name) => `demo.${scope}.${name}`;
  let inFlight = false;
  let pending = null; // { fingerprint, submissionId } reused on retry of the same data

  return {
    /** Honeypot: a hidden field humans never fill in. */
    isBot(honeypotValue) {
      return typeof honeypotValue === 'string' && honeypotValue.trim() !== '';
    },

    /** Seconds left before another submission is allowed (0 = allowed). */
    cooldownRemaining() {
      const last = Number(store.get(key('lastSentAt')) || 0);
      if (!last || !cooldownSeconds) return 0;
      const left = Math.ceil((last + cooldownSeconds * 1000 - now()) / 1000);
      return left > 0 ? left : 0;
    },

    /**
     * Try to start a submission. Returns null when one is already running or the
     * cooldown is active. The same data retried after a failure keeps its submissionId,
     * which is sent as the event's eventId.
     */
    acquire(fingerprint) {
      if (inFlight || this.cooldownRemaining() > 0) return null;
      inFlight = true;
      if (!pending || pending.fingerprint !== fingerprint) {
        pending = { fingerprint, submissionId: generateSubmissionId() };
      }
      return pending.submissionId;
    },

    /** Submission failed: allow a retry with the same submissionId. */
    release() { inFlight = false; },

    /** Submission fully succeeded: start the cooldown and forget the pending id. */
    complete() {
      inFlight = false;
      pending = null;
      store.set(key('lastSentAt'), String(now()));
    },

    /** "New session" in diagnostics: clear the cooldown. */
    reset() {
      inFlight = false;
      pending = null;
      store.remove(key('lastSentAt'));
    },
  };
}
