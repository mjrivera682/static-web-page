// Builds an accessible form from the demo's field definitions. No network calls.

export const ERROR_TEXT = {
  required: 'Este campo es obligatorio.',
  invalid_email: 'Introduce un correo válido.',
  invalid_phone: 'Introduce un teléfono válido (con indicativo si es de otro país).',
  unknown_country: 'Incluye el indicativo del país (por ejemplo +57).',
  invalid_option: 'Elige una opción de la lista.',
  too_long: 'El texto es demasiado largo.',
};

const AUTOCOMPLETE = { name: 'name', email: 'email', phone: 'tel' };

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
 * @returns {{form: HTMLFormElement, read: () => {values: object, honeypot: string},
 *            showErrors: (errors: object) => void, setBusy: (busy: boolean) => void}}
 */
export function renderForm(doc, container, config) {
  const form = el(doc, 'form', { class: 'lead-form', novalidate: true });

  for (const field of config.fields) {
    const id = `f-${field.id}`;
    const wrap = el(doc, 'div', { class: `field field-${field.type}` });
    const errId = `${id}-error`;
    let input;

    if (field.type === 'select') {
      input = el(doc, 'select', { id, name: field.id, required: field.required, 'aria-describedby': errId });
      input.appendChild(el(doc, 'option', { value: '' }, field.placeholder ?? 'Selecciona…'));
      for (const opt of field.options) input.appendChild(el(doc, 'option', { value: opt }, opt));
    } else if (field.type === 'checkbox') {
      input = el(doc, 'input', { id, name: field.id, type: 'checkbox', required: field.required, 'aria-describedby': errId });
    } else {
      input = el(doc, 'input', {
        id, name: field.id, type: field.type, required: field.required,
        autocomplete: AUTOCOMPLETE[field.id] ?? 'off',
        placeholder: field.placeholder, inputmode: field.type === 'tel' ? 'tel' : undefined,
        'aria-describedby': errId,
      });
    }

    const label = el(doc, 'label', { for: id }, field.label + (field.required ? ' *' : ''));
    if (field.type === 'checkbox') { wrap.append(input, label); } else { wrap.append(label, input); }
    if (field.help) wrap.appendChild(el(doc, 'small', { class: 'help' }, field.help));
    wrap.appendChild(el(doc, 'p', { id: errId, class: 'error', 'aria-live': 'polite' }));
    form.appendChild(wrap);
  }

  // Honeypot: off-screen, not focusable, ignored by humans and assistive tech.
  const trap = el(doc, 'div', { class: 'hp', 'aria-hidden': 'true' });
  trap.appendChild(el(doc, 'input', { type: 'text', name: 'company_website', tabindex: '-1', autocomplete: 'off' }));
  form.appendChild(trap);

  const button = el(doc, 'button', { type: 'submit', class: 'primary' }, config.submitLabel ?? 'Enviar');
  form.appendChild(button);
  container.appendChild(form);

  return {
    form,
    read() {
      const values = {};
      for (const field of config.fields) {
        const input = form.elements[field.id];
        values[field.id] = field.type === 'checkbox' ? input.checked : input.value;
      }
      return { values, honeypot: form.elements.company_website.value };
    },
    showErrors(errors = {}) {
      for (const field of config.fields) {
        const msg = errors[field.id] ? (ERROR_TEXT[errors[field.id]] ?? errors[field.id]) : '';
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
      button.textContent = busy ? (config.busyLabel ?? 'Enviando…') : (config.submitLabel ?? 'Enviar');
      form.setAttribute('aria-busy', busy ? 'true' : 'false');
    },
  };
}
