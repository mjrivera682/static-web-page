// Builds an accessible form from the demo's field definitions. No network calls.

import { COUNTRIES, flagSvg } from './countries.js';

export const ERROR_TEXT = {
  required: 'Este campo es obligatorio.',
  invalid_email: 'Introduce un correo válido.',
  invalid_phone: 'Introduce solo números (puedes usar espacios o guiones).',
  invalid_phone_country: (c) => `El número no es válido para ${c.name}. Ejemplo: ${c.example}.`,
  country_mismatch: 'Ese número es de otro país: cambia el país o escribe solo el número nacional.',
  unsupported_country: 'Ese indicativo no está disponible. Elige el país en la lista.',
  unknown_country: 'Elige el país del teléfono.',
  invalid_option: 'Elige una opción de la lista.',
  too_long: 'El texto es demasiado largo.',
};

const AUTOCOMPLETE = { name: 'name', email: 'email', phone: 'tel-national' };
const PHONE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">'
  + '<path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>';

function el(doc, tag, attrs = {}, text) {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) node.setAttribute(k, '');
    else if (v !== false && v !== undefined && v !== null) node.setAttribute(k, v);
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Flag emoji render as two letters on Windows. Draw one on a canvas and look for
 * colored pixels; without color, the options omit the emoji (the SVG badge stays).
 */
function supportsFlagEmoji(doc) {
  try {
    const c = doc.createElement('canvas');
    c.width = c.height = 16;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;
    ctx.textBaseline = 'top';
    ctx.font = '14px sans-serif';
    ctx.fillText('🇨🇴', 0, 0);
    const d = ctx.getImageData(0, 0, 16, 16).data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] && (Math.abs(d[i] - d[i + 1]) > 40 || Math.abs(d[i + 1] - d[i + 2]) > 40)) return true;
    }
    return false;
  } catch { return false; }
}

/** Country selector + dial code + national number input. */
function renderPhone(doc, field, id, errId) {
  const emoji = supportsFlagEmoji(doc);
  const group = el(doc, 'div', { class: 'phone-group' });
  const flag = el(doc, 'span', { class: 'phone-flag' });
  const country = el(doc, 'select', {
    id: `${id}-country`, name: `${field.id}_country`, class: 'phone-country', 'aria-label': 'País del teléfono',
  });
  for (const iso of field.countries) {
    const c = COUNTRIES[iso];
    country.appendChild(el(doc, 'option', { value: iso }, `${emoji ? `${c.flag} ` : ''}${c.name} (+${c.dial})`));
  }
  country.value = field.defaultCountry;
  const dial = el(doc, 'span', { class: 'phone-dial', 'aria-hidden': 'true' });
  const input = el(doc, 'input', {
    id, name: field.id, type: 'tel', required: field.required, inputmode: 'tel',
    autocomplete: AUTOCOMPLETE[field.id] ?? 'tel-national', 'aria-describedby': errId,
  });
  const sync = () => {
    const c = COUNTRIES[country.value];
    flag.innerHTML = flagSvg(country.value);
    dial.textContent = `+${c.dial}`;
    input.placeholder = c.example;
    input.setAttribute('aria-label', `Teléfono (${c.name}, +${c.dial}), sin indicativo`);
  };
  country.addEventListener('change', sync);
  sync();
  const numberBox = el(doc, 'div', { class: 'phone-number' });
  numberBox.append(dial, input);
  group.append(flag, country, numberBox);
  return { group, input };
}

/**
 * @returns {{form: HTMLFormElement, read: () => {values: object, honeypot: string},
 *            showErrors: (errors: object) => void, setBusy: (busy: boolean) => void,
 *            setLocked: (locked: boolean) => void}}
 */
export function renderForm(doc, container, config) {
  const form = el(doc, 'form', { class: 'lead-form', novalidate: true });

  for (const field of config.fields) {
    const id = `f-${field.id}`;
    const wrap = el(doc, 'div', { class: `field field-${field.type}` });
    const errId = `${id}-error`;
    const label = el(doc, 'label', { for: id }, field.label + (field.required ? ' *' : ''));

    if (field.type === 'tel') {
      const { group } = renderPhone(doc, field, id, errId);
      wrap.append(label, group);
    } else if (field.type === 'select') {
      const input = el(doc, 'select', { id, name: field.id, required: field.required, 'aria-describedby': errId });
      input.appendChild(el(doc, 'option', { value: '' }, field.placeholder ?? 'Selecciona…'));
      for (const opt of field.options) input.appendChild(el(doc, 'option', { value: opt }, opt));
      wrap.append(label, input);
    } else if (field.type === 'checkbox') {
      const input = el(doc, 'input', { id, name: field.id, type: 'checkbox', required: field.required, 'aria-describedby': errId });
      wrap.append(input, label);
    } else {
      const input = el(doc, 'input', {
        id, name: field.id, type: field.type, required: field.required,
        autocomplete: AUTOCOMPLETE[field.id] ?? 'off', placeholder: field.placeholder, 'aria-describedby': errId,
      });
      wrap.append(label, input);
    }
    if (field.help) wrap.appendChild(el(doc, 'small', { class: 'help' }, field.help));
    wrap.appendChild(el(doc, 'p', { id: errId, class: 'error', 'aria-live': 'polite' }));
    form.appendChild(wrap);
  }

  // Honeypot: off-screen, not focusable, ignored by humans and assistive tech.
  const trap = el(doc, 'div', { class: 'hp', 'aria-hidden': 'true' });
  trap.appendChild(el(doc, 'input', { type: 'text', name: 'company_website', tabindex: '-1', autocomplete: 'off' }));
  form.appendChild(trap);

  const button = el(doc, 'button', { type: 'submit', class: 'primary with-icon' });
  const icon = el(doc, 'span', { class: 'btn-icon' });
  icon.innerHTML = PHONE_ICON;
  const text = el(doc, 'span', {}, config.submitLabel ?? 'Enviar');
  button.append(icon, text);
  form.appendChild(button);
  container.appendChild(form);

  return {
    form,
    read() {
      const values = {};
      for (const field of config.fields) {
        const input = form.elements[field.id];
        values[field.id] = field.type === 'checkbox' ? input.checked : input.value;
        if (field.type === 'tel') values[`${field.id}_country`] = form.elements[`${field.id}_country`].value;
      }
      return { values, honeypot: form.elements.company_website.value };
    },
    showErrors(errors = {}) {
      for (const field of config.fields) {
        let msg = '';
        if (errors[field.id]) {
          const t = ERROR_TEXT[errors[field.id]] ?? errors[field.id];
          msg = typeof t === 'function'
            ? t(COUNTRIES[form.elements[`${field.id}_country`]?.value] ?? COUNTRIES[field.defaultCountry])
            : t;
        }
        const input = form.elements[field.id];
        doc.getElementById(`f-${field.id}-error`).textContent = msg;
        input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      }
      const first = config.fields.find((f) => errors[f.id]);
      if (first) form.elements[first.id].focus();
    },
    /** Disable the submit button without changing its label (e.g. until push is ready). */
    setLocked(locked) {
      button.disabled = locked;
      form.dataset.locked = locked ? 'true' : 'false';
    },
    setBusy(busy) {
      button.disabled = busy;
      text.textContent = busy ? (config.busyLabel ?? 'Enviando…') : (config.submitLabel ?? 'Enviar');
      form.setAttribute('aria-busy', busy ? 'true' : 'false');
    },
  };
}
