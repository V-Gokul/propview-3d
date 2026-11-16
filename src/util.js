// Small shared helpers: formatting, validation, storage, downloads.

export const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const trim = (v) => (Math.round(v * 100) / 100).toString();

/** ₹1,23,456 (Indian digit grouping) */
export const inr = (n) => '₹' + Math.round(num(n)).toLocaleString('en-IN');

/** ₹42k · ₹45L · ₹1.2 Cr */
export function inrShort(n) {
  n = num(n);
  if (n >= 1e7) return '₹' + trim(n / 1e7) + ' Cr';
  if (n >= 1e5) return '₹' + trim(n / 1e5) + 'L';
  if (n >= 1e3) return '₹' + trim(n / 1e3) + 'k';
  return '₹' + Math.round(n);
}

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const roomArea = (rooms) => Math.round((rooms || []).reduce((s, r) => s + num(r.width) * num(r.length), 0));

export function bhkLabel(rooms) {
  const beds = (rooms || []).filter((r) => r.type === 'bedroom').length;
  return beds ? `${beds} BHK` : 'Studio';
}

export function validateApartment(a) {
  const errs = [];
  if (!a || !Array.isArray(a.rooms) || a.rooms.length === 0) return ['Add at least one room.'];
  if (a.rooms.length > 40) errs.push('A flat can have at most 40 rooms.');
  a.rooms.forEach((r, i) => {
    const label = `Room ${i + 1}${r.name ? ` (${r.name})` : ''}`;
    if (!(num(r.width) >= 3 && num(r.width) <= 80)) errs.push(`${label}: width must be between 3 and 80 ft.`);
    if (!(num(r.length) >= 3 && num(r.length) <= 80)) errs.push(`${label}: length must be between 3 and 80 ft.`);
  });
  if (num(a.totalFloors) < 0 || num(a.totalFloors) > 120) errs.push('Total floors must be between 0 and 120.');
  if (num(a.floor) < 0 || num(a.floor) > num(a.totalFloors)) errs.push('Floor must be between 0 (ground) and the total floors.');
  return errs;
}

export function validatePlots(d) {
  const errs = [];
  if (!d || !Array.isArray(d.plots) || d.plots.length === 0) return ['Add at least one plot.'];
  if (d.plots.length > 500) errs.push('A layout can have at most 500 plots.');
  const ids = new Set();
  d.plots.forEach((p, i) => {
    const label = `Plot ${p.id || i + 1}`;
    if (!(num(p.width) >= 5 && num(p.width) <= 2000)) errs.push(`${label}: width must be between 5 and 2000 ft.`);
    if (!(num(p.depth) >= 5 && num(p.depth) <= 2000)) errs.push(`${label}: depth must be between 5 and 2000 ft.`);
    const id = String(p.id ?? '').trim();
    if (!id) errs.push(`Plot row ${i + 1}: plot number is required.`);
    else if (ids.has(id)) errs.push(`Plot number "${id}" is used twice.`);
    ids.add(id);
  });
  for (const [k, label] of [['mainRoad', 'Main road'], ['internalRoad', 'Internal road']]) {
    if (!(num(d[k]) >= 10 && num(d[k]) <= 150)) errs.push(`${label} width must be between 10 and 150 ft.`);
  }
  (d.amenities || []).forEach((a, i) => {
    if (!(num(a.width) >= 5 && num(a.depth) >= 5)) errs.push(`Amenity ${a.name || i + 1}: width and depth must be at least 5 ft.`);
  });
  return errs;
}

export const store = {
  get(k) {
    try {
      return JSON.parse(localStorage.getItem(k));
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* storage unavailable — ignore */
    }
  },
};

export function download(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const slug = (s) => String(s || 'property').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'property';

export function fmtDate(d) {
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}
