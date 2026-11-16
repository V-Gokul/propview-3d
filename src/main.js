import './style.css';
import { createViewer } from './scene/core.js';
import { buildApartment, ROOM_TYPES } from './scene/apartment.js';
import { buildPlots, STATUS } from './scene/plots.js';
import { renderApartmentForm, renderPlotsForm } from './ui/forms.js';
import { openFlow } from './ui/flow.js';
import { sampleApartment, samplePlots } from './samples.js';
import { esc, inr, inrShort, num, roomArea, bhkLabel, validateApartment, validatePlots, store, download, slug, plotEntries } from './util.js';

const $ = (id) => document.getElementById(id);
const els = {
  layout: $('layout'),
  form: $('form-root'),
  viewer: $('viewer'),
  top: $('overlay-top'),
  card: $('info-card'),
  bottom: $('bottom-panel'),
  views: $('view-controls'),
  flow: $('flow'),
  toast: $('toast'),
};

const clone = (o) => JSON.parse(JSON.stringify(o));
const state = {
  mode: store.get('pv.mode') === 'plots' ? 'plots' : 'apartment',
  apartment: store.get('pv.apartment') || clone(sampleApartment),
  plots: store.get('pv.plots') || clone(samplePlots),
  room: null, // selected room idx
  plot: null, // selected plot idx
  view: 'plan',
};

const viewer = createViewer(els.viewer);
let model = null;
let flow = null;

const persist = () => {
  store.set('pv.mode', state.mode);
  store.set('pv.apartment', state.apartment);
  store.set('pv.plots', state.plots);
};

/* ---------- toast ---------- */
let toastTimer;
function toast(html, isError = false) {
  els.toast.innerHTML = html;
  els.toast.className = `toast${isError ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add('hidden'), isError ? 6000 : 2500);
}

/* ---------- forms ---------- */
function renderForm() {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === state.mode));
  const h = { onChange: persist, onGenerate: () => generate() };
  if (state.mode === 'apartment') renderApartmentForm(els.form, state.apartment, h);
  else renderPlotsForm(els.form, state.plots, h);
}

/* ---------- 3D ---------- */
function generate({ keepFlow = false, keepCamera = false } = {}) {
  const errs = state.mode === 'apartment' ? validateApartment(state.apartment) : validatePlots(state.plots);
  if (errs.length) {
    toast(`<b>Please fix:</b><br>${errs.slice(0, 4).map(esc).join('<br>')}${errs.length > 4 ? `<br>…and ${errs.length - 4} more` : ''}`, true);
    return false;
  }
  persist();
  if (!keepFlow) closeFlow();
  viewer.clear();
  state.room = null;
  state.plot = null;

  if (state.mode === 'apartment') {
    model = buildApartment(viewer, state.apartment, { onRoom: selectRoom, onEnter: () => setView('plan') });
    viewer.onPick((p) => {
      if (p?.kind === 'room') selectRoom(p.idx);
      else if (p?.kind === 'floor') setView('plan');
    });
    if (!keepCamera) setView(state.view === 'building' ? 'building' : 'plan');
  } else {
    model = buildPlots(viewer, state.plots, { onPlot: selectPlot });
    viewer.onPick((p) => (p?.kind === 'plot' ? selectPlot(p.idx) : selectPlot(null)));
    if (!keepCamera) model.overview();
  }
  renderPanels();
  return true;
}

function setView(v) {
  if (!model) return;
  state.view = v;
  state.room = null;
  if (state.mode === 'apartment') {
    if (v === 'building') model.showBuilding();
    else if (v === 'top') model.showTop();
    else model.showPlan();
  } else {
    state.plot = null;
    if (v === 'top') {
      model.select(null);
      model.top();
    } else model.overview();
  }
  renderPanels();
}

function selectRoom(idx) {
  if (state.mode !== 'apartment' || !model) return;
  state.room = idx;
  state.view = 'room';
  model.focusRoom(idx);
  renderPanels();
}

function selectPlot(idx) {
  if (state.mode !== 'plots' || !model) return;
  state.plot = idx;
  model.select(idx);
  renderPanels();
}

/* ---------- panels ---------- */
function renderPanels() {
  if (state.mode === 'apartment') renderApartmentPanels();
  else renderPlotPanels();
}

function renderApartmentPanels() {
  const a = state.apartment;
  const sale = a.listing === 'sale';
  const area = roomArea(a.rooms);
  els.top.innerHTML = `<span class="chip">📍 ${esc(a.location || 'Location')}</span><span class="chip subtle">${esc(bhkLabel(a.rooms))} · ${sale ? 'For sale' : 'For rent'}</span>`;

  const price = sale ? `${inrShort(a.price)}` : `${inr(a.price)}<small>/ month</small>`;
  const perSqft = area ? Math.round(num(a.price) / area) : 0;
  els.card.innerHTML = `
    <div class="card">
      ${a.reserved ? '<div class="pill reserved">✓ Reserved by you</div>' : ''}
      <div class="kicker">${esc(a.unit)} · ${num(a.floor) === 0 ? 'Ground floor' : `Floor ${esc(a.floor)}`}</div>
      <h3>${esc(a.building)}</h3>
      <div class="price">${price}</div>
      <div class="meta">${area.toLocaleString('en-IN')} sq ft · ${esc(a.facing)} facing · ${esc(a.furnishing)}</div>
      <div class="pill ok">0 brokerage · ${sale ? 'Booking' : 'Deposit'} ${inr(a.deposit)}</div>
      ${sale && perSqft ? `<div class="meta">≈ ${inr(perSqft)} / sq ft</div>` : ''}
      <div class="btns"><button class="ghost" data-act="visit">Book visit</button><button class="primary" data-act="reserve">${a.reserved ? 'View booking' : 'Reserve'}</button></div>
      ${state.room !== null ? roomDetail(a.rooms[state.room]) : ''}
    </div>`;

  els.bottom.innerHTML = `
    <div class="room-list">
      <div class="list-head"><span>${esc(a.unit)} · ${esc(a.building)}</span></div>
      <h5>Rooms</h5>
      ${a.rooms.map((r, i) => `<button class="room-item${state.room === i ? ' active' : ''}" data-room="${i}"><span>${esc(r.name || ROOM_TYPES[r.type])}</span><small>${esc(r.width)} × ${esc(r.length)}</small></button>`).join('')}
    </div>`;

  els.views.innerHTML = ['building', 'plan', 'top']
    .map((v) => `<button class="${state.view === v ? 'on' : ''}" data-view="${v}">${{ building: '🏢 Building', plan: '🧊 Floor plan', top: '⬒ Top view' }[v]}</button>`)
    .join('') + (state.room !== null ? `<button data-view="plan">✕ Exit room</button>` : '');
}

function roomDetail(r) {
  if (!r) return '';
  const area = Math.round(num(r.width) * num(r.length));
  return `<div class="section"><h4>${esc(r.name || ROOM_TYPES[r.type])}</h4><div class="meta">${esc(r.width)} × ${esc(r.length)} ft · ${area} sq ft · ${esc(ROOM_TYPES[r.type] || '')}</div></div>`;
}

function renderPlotPanels() {
  const d = state.plots;
  const entries = plotEntries(d.plots);
  const only = entries.map(([p]) => p);
  const count = (s) => only.filter((p) => (p.status || 'available') === s).length;
  const avail = only.filter((p) => (p.status || 'available') === 'available');
  const prices = avail.map((p) => num(p.price)).filter(Boolean);
  els.top.innerHTML = `<span class="chip">📍 ${esc(d.location || 'Location')}</span><span class="chip subtle">${esc(d.name)} · ${only.length} plots</span>`;

  const p = state.plot !== null && d.plots[state.plot]?.type !== 'road' ? d.plots[state.plot] : null;
  if (p) {
    const st = STATUS[p.status] || STATUS.available;
    const area = num(p.width) * num(p.depth);
    const canBuy = (p.status || 'available') === 'available';
    els.card.innerHTML = `
      <div class="card">
        <div class="kicker">Plot #${esc(p.id)} · ${esc(d.name)}</div>
        <h3>${esc(p.width)} × ${esc(p.depth)} ft plot</h3>
        <div class="price">${p.status === 'sold' ? 'Sold' : inrShort(p.price)}</div>
        <div class="meta">${area.toLocaleString('en-IN')} sq ft · ${Math.round(area / 9).toLocaleString('en-IN')} sq yd · ${esc(p.facing)} facing</div>
        ${p.status !== 'sold' && area ? `<div class="meta">≈ ${inr(num(p.price) / area)} / sq ft</div>` : ''}
        <div class="pill" style="--pill:${st.color}">${st.label}</div>
        <div class="meta small">House shown is a preview of what fits (≈ ${Math.round(num(p.width) * 0.62 * num(p.depth) * 0.55 * 2).toLocaleString('en-IN')} sq ft, G+1).</div>
        <div class="btns">${canBuy ? '<button class="ghost" data-act="visit">Book site visit</button><button class="primary" data-act="reserve">Reserve plot</button>' : `<button class="ghost" disabled>${st.label}</button>`}</div>
        <button class="link" data-act="deselect">‹ All plots</button>
      </div>`;
  } else {
    els.card.innerHTML = `
      <div class="card">
        <div class="kicker">${esc(d.approval || 'Plot layout')}</div>
        <h3>${esc(d.name)}</h3>
        <div class="price">${prices.length ? `${inrShort(Math.min(...prices))} – ${inrShort(Math.max(...prices))}` : '—'}</div>
        <div class="meta">${avail.length} of ${only.length} plots available · ${esc(d.mainRoad)} ft main road</div>
        <div class="legend">${Object.entries(STATUS).map(([k, v]) => `<span><i style="background:${v.color}"></i>${v.label} (${count(k)})</span>`).join('')}</div>
        <p class="meta small">Click any plot or price tag to see details.</p>
      </div>`;
  }

  els.bottom.innerHTML = `
    <div class="room-list plots">
      <h5>Plots</h5>
      <div class="plot-chips">${entries.map(([x, i]) => `<button class="plot-chip${state.plot === i ? ' active' : ''}" data-plot="${i}" style="--c:${(STATUS[x.status] || STATUS.available).color}">${esc(x.id)}</button>`).join('')}</div>
    </div>`;

  els.views.innerHTML = [['overview', '🧊 Overview'], ['top', '⬒ Top view']].map(([v, l]) => `<button data-view="${v}">${l}</button>`).join('');
}

/* ---------- booking flow ---------- */
function closeFlow() {
  if (flow) {
    const f = flow;
    flow = null;
    f.close();
  }
}

function startFlow(stepName) {
  closeFlow();
  let ctx;
  if (state.mode === 'apartment') {
    const a = state.apartment;
    ctx = {
      kind: 'flat',
      title: `${a.unit}, ${a.building}`,
      subtitle: a.location,
      listing: a.listing === 'sale' ? 'sale' : 'rent',
      price: a.price,
      deposit: a.deposit,
      contact: a.contact,
      onReserved: () => {
        a.reserved = true;
        persist();
        renderPanels();
      },
      onWalk: () => selectRoom(0),
    };
  } else {
    const d = state.plots;
    const idx = state.plot;
    const p = d.plots[idx];
    if (!p) return;
    ctx = {
      kind: 'plot',
      title: `Plot #${p.id}, ${d.name}`,
      subtitle: `${p.width} × ${p.depth} ft · ${d.location}`,
      listing: 'sale',
      price: p.price,
      deposit: Math.max(10000, Math.round(num(p.price) * 0.02)),
      contact: d.contact,
      onReserved: () => {
        p.status = 'booked';
        persist();
        generate({ keepFlow: true, keepCamera: true });
        selectPlot(idx);
        if (state.mode === 'plots') renderPlotsForm(els.form, state.plots, { onChange: persist, onGenerate: () => generate() });
      },
      onWalk: () => selectPlot(idx),
    };
  }
  ctx.onClose = () => (flow = null);
  flow = openFlow(els.flow, ctx, stepName);
}

/* ---------- events ---------- */
document.querySelector('.tabs').addEventListener('click', (e) => {
  const m = e.target.closest('[data-mode]')?.dataset.mode;
  if (!m || m === state.mode) return;
  state.mode = m;
  state.view = m === 'apartment' ? 'plan' : 'overview';
  persist();
  renderForm();
  generate();
});

els.card.addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'visit') startFlow('visit');
  else if (act === 'reserve') startFlow(state.mode === 'apartment' && state.apartment.reserved ? 'done' : 'costs');
  else if (act === 'deselect') setView('overview');
});
els.bottom.addEventListener('click', (e) => {
  const r = e.target.closest('[data-room]');
  if (r) return selectRoom(+r.dataset.room);
  const p = e.target.closest('[data-plot]');
  if (p) selectPlot(+p.dataset.plot);
});
els.views.addEventListener('click', (e) => {
  const v = e.target.closest('[data-view]')?.dataset.view;
  if (v) setView(v);
});

$('btn-sidebar').addEventListener('click', () => els.layout.classList.toggle('collapsed'));

$('btn-sample').addEventListener('click', () => {
  if (state.mode === 'apartment') state.apartment = clone(sampleApartment);
  else state.plots = clone(samplePlots);
  renderForm();
  generate();
  toast('Sample loaded');
});

$('btn-export').addEventListener('click', () => {
  const data = state.mode === 'apartment' ? state.apartment : state.plots;
  const name = state.mode === 'apartment' ? `${data.building}-${data.unit}` : data.name;
  download(`${slug(name)}.json`, data);
});

$('file-import').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const obj = JSON.parse(await file.text());
    if (Array.isArray(obj.rooms)) {
      state.mode = 'apartment';
      state.apartment = { ...clone(sampleApartment), ...obj, reserved: false };
    } else if (Array.isArray(obj.plots)) {
      state.mode = 'plots';
      state.plots = { ...clone(samplePlots), amenities: [], ...obj };
    } else throw new Error('The file needs a "rooms" list (apartment) or a "plots" list (layout).');
    renderForm();
    if (generate()) toast(`Imported ${esc(file.name)}`);
  } catch (err) {
    toast(`Could not import: ${esc(err.message)}`, true);
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.target.closest?.('input,select,textarea')) return;
  if (flow) closeFlow();
  else if (state.mode === 'apartment' && state.room !== null) setView('plan');
  else if (state.mode === 'plots' && state.plot !== null) setView('overview');
});

/* ---------- start ---------- */
renderForm();
if (!generate()) {
  state.mode === 'apartment' ? (state.apartment = clone(sampleApartment)) : (state.plots = clone(samplePlots));
  renderForm();
  generate();
}
