// Countries for the phone selector. `national` validates the national significant number
// (digits after the country code, without trunk prefix). Rules are deliberately simple:
// length and leading digits of mobile and landline numbers.

export const COUNTRIES = Object.freeze({
  CO: { name: 'Colombia', dial: '57', flag: '🇨🇴', national: /^(3\d{9}|60\d{8})$/, example: '300 123 4567' },
  MX: { name: 'México', dial: '52', flag: '🇲🇽', national: /^[1-9]\d{9}$/, example: '55 1234 5678' },
  PE: { name: 'Perú', dial: '51', flag: '🇵🇪', national: /^(9\d{8}|[1-8]\d{7})$/, example: '912 345 678' },
  CL: { name: 'Chile', dial: '56', flag: '🇨🇱', national: /^[2-9]\d{8}$/, example: '9 1234 5678' },
  US: { name: 'Estados Unidos', dial: '1', flag: '🇺🇸', national: /^[2-9]\d{2}[2-9]\d{6}$/, example: '201 555 0123' },
  EC: { name: 'Ecuador', dial: '593', flag: '🇪🇨', national: /^(9\d{8}|[2-7]\d{7})$/, example: '99 123 4567' },
  HN: { name: 'Honduras', dial: '504', flag: '🇭🇳', national: /^[2-9]\d{7}$/, example: '9123 4567' },
  ES: { name: 'España', dial: '34', flag: '🇪🇸', national: /^[6-9]\d{8}$/, example: '612 34 56 78' },
});

/** Country whose dial code is the longest prefix of an international digit string. */
export function countryFromInternational(digits, allowed = Object.keys(COUNTRIES)) {
  let best = null;
  for (const iso of allowed) {
    const c = COUNTRIES[iso];
    if (c && digits.startsWith(c.dial) && (!best || c.dial.length > COUNTRIES[best].dial.length)) best = iso;
  }
  return best;
}

// Simplified inline SVG flags (3:2). Windows does not render flag emoji, so the selector
// shows this badge next to the native <select>. No external images are loaded.
const H = (...bands) => bands.map(([c, y, h]) => `<rect y="${y}" width="30" height="${h}" fill="${c}"/>`).join('');
const V = (...bands) => bands.map(([c, x, w]) => `<rect x="${x}" width="${w}" height="20" fill="${c}"/>`).join('');
const STAR = (x, y, r, c) => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${(x + rr * Math.cos(a)).toFixed(2)},${(y + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${c}"/>`;
};

const FLAG_SVG = {
  CO: H(['#FCD116', 0, 10], ['#003893', 10, 5], ['#CE1126', 15, 5]),
  EC: H(['#FFDD00', 0, 10], ['#034EA2', 10, 5], ['#ED1C24', 15, 5]) + '<circle cx="15" cy="10" r="3" fill="#8C6A2E"/>',
  MX: V(['#006847', 0, 10], ['#FFFFFF', 10, 10], ['#CE1126', 20, 10]) + '<circle cx="15" cy="10" r="2.5" fill="#8C6A2E"/>',
  PE: V(['#D91023', 0, 10], ['#FFFFFF', 10, 10], ['#D91023', 20, 10]),
  CL: H(['#FFFFFF', 0, 10], ['#D52B1E', 10, 10]) + '<rect width="10" height="10" fill="#0039A6"/>' + STAR(5, 5, 3, '#FFFFFF'),
  US: Array.from({ length: 7 }, (_, i) => `<rect y="${(i * 20) / 6.5}" width="30" height="${20 / 13}" fill="#B22234"/>`).join('')
    + '<rect width="12" height="10.8" fill="#3C3B6E"/>',
  HN: H(['#0073CF', 0, 6.67], ['#FFFFFF', 6.67, 6.66], ['#0073CF', 13.33, 6.67])
    + [[15, 10], [11, 8.4], [19, 8.4], [11, 11.6], [19, 11.6]].map(([x, y]) => STAR(x, y, 1.1, '#0073CF')).join(''),
  ES: H(['#AA151B', 0, 5], ['#F1BF00', 5, 10], ['#AA151B', 15, 5]),
};

export function flagSvg(iso) {
  const body = FLAG_SVG[iso] ?? '<rect width="30" height="20" fill="#ccc"/>';
  return `<svg viewBox="0 0 30 20" width="24" height="16" aria-hidden="true" focusable="false">${body}</svg>`;
}
