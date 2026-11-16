// Input forms for both modes. Values are written straight into the passed data object.
import { ROOM_TYPES } from '../scene/apartment.js';
import { STATUS, AMENITY_TYPES } from '../scene/plots.js';
import { esc, num, roomArea, bhkLabel, plotEntries } from '../util.js';

const FACINGS = ['North', 'East', 'South', 'West', 'North-East', 'North-West', 'South-East', 'South-West'];
const FACING_SHORT = FACINGS.map((f) => [f, f.split('-').map((w) => w[0]).join('')]);
const STATUS_SHORT = { available: 'Avail.', hold: 'Hold', booked: 'Booked', sold: 'Sold' };

const options = (list, value) =>
  (Array.isArray(list) ? list.map((v) => (Array.isArray(v) ? v : [v, v])) : Object.entries(list))
    .map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(l)}</option>`)
    .join('');

const field = (label, key, value, { type = 'text', full = false, min, step } = {}) => `
  <label class="field${full ? ' full' : ''}"><span>${label}</span>
    <input data-field="${key}" type="${type}" value="${esc(value)}"${min !== undefined ? ` min="${min}"` : ''}${step ? ` step="${step}"` : ''} /></label>`;

const select = (label, key, value, list, full = false) => `
  <label class="field${full ? ' full' : ''}"><span>${label}</span><select data-field="${key}">${options(list, value)}</select></label>`;

function bind(root, data, listKey, h, rerender) {
  root.oninput = (e) => {
    const t = e.target;
    if (t.dataset.field) data[t.dataset.field] = t.value;
    else if (t.dataset.row !== undefined) data[listKey[t.dataset.list]][+t.dataset.row][t.dataset.key] = t.value;
    else return;
    h.onChange();
    h.onLive?.();
  };
  root.onchange = (e) => {
    if (e.target.dataset.rerender !== undefined || e.target.dataset.field === 'listing') rerender();
  };
  root.onkeydown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) h.onGenerate();
  };
}

/* ---------- apartment ---------- */

export function renderApartmentForm(root, a, h) {
  const sale = a.listing === 'sale';
  root.innerHTML = `
    <div class="form-head">
      <h2>Apartment details</h2>
      <p>Type the flat's details and every room's size in <b>feet</b>, then press <b>Generate 3D</b>.</p>
    </div>
    <fieldset>
      <legend>Listing</legend>
      <div class="grid2">
        ${field('Project / building', 'building', a.building)}
        ${field('Flat / unit no.', 'unit', a.unit)}
        ${field('Location', 'location', a.location, { full: true })}
        ${field('Floor (0 = ground)', 'floor', a.floor, { type: 'number', min: 0 })}
        ${field('Total floors', 'totalFloors', a.totalFloors, { type: 'number', min: 0 })}
        ${select('Facing', 'facing', a.facing, FACINGS)}
        ${select('Furnishing', 'furnishing', a.furnishing, ['Unfurnished', 'Semi-furnished', 'Fully furnished'])}
        ${select('Listing type', 'listing', a.listing, [['rent', 'For rent'], ['sale', 'For sale']])}
        ${field(sale ? 'Sale price (₹)' : 'Rent / month (₹)', 'price', a.price, { type: 'number', min: 0, step: 500 })}
        ${field(sale ? 'Booking amount (₹)' : 'Deposit (₹)', 'deposit', a.deposit, { type: 'number', min: 0, step: 1000 })}
        ${field('Contact person', 'contact', a.contact)}
      </div>
    </fieldset>
    <fieldset>
      <legend>Rooms <small>width × length in ft</small></legend>
      <div class="rows-head rooms"><span>Name</span><span>Type</span><span>W</span><span>L</span><span></span></div>
      ${a.rooms
        .map(
          (r, i) => `
        <div class="row rooms">
          <input data-list="r" data-row="${i}" data-key="name" value="${esc(r.name)}" placeholder="Room name" />
          <select data-list="r" data-row="${i}" data-key="type">${options(ROOM_TYPES, r.type)}</select>
          <input data-list="r" data-row="${i}" data-key="width" type="number" min="3" step="0.5" value="${esc(r.width)}" />
          <input data-list="r" data-row="${i}" data-key="length" type="number" min="3" step="0.5" value="${esc(r.length)}" />
          <button class="icon" data-act="del-room" data-i="${i}" title="Remove room" aria-label="Remove room">✕</button>
        </div>`,
        )
        .join('')}
      <div class="row-actions">
        <button class="ghost small" data-act="add-room">+ Add room</button>
      </div>
      <div class="totals" id="apt-totals"></div>
    </fieldset>
    <div class="form-actions">
      <button class="primary wide" data-act="generate">Generate 3D ▸</button>
      <p class="tip">Tip: rooms are placed in the order listed. Put the living room first and balconies last. Ctrl + Enter also generates.</p>
    </div>`;

  const totals = () => {
    const el = root.querySelector('#apt-totals');
    if (el) el.innerHTML = `Carpet area ≈ <b>${roomArea(a.rooms).toLocaleString('en-IN')} sq ft</b> · ${bhkLabel(a.rooms)} · ${a.rooms.length} rooms`;
  };
  totals();

  const rerender = () => renderApartmentForm(root, a, h);
  bind(root, a, { r: 'rooms' }, { ...h, onLive: totals }, rerender);
  root.onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'add-room') {
      a.rooms.push({ name: `Room ${a.rooms.length + 1}`, type: 'bedroom', width: 12, length: 11 });
      h.onChange();
      rerender();
      root.querySelector('.row.rooms:last-of-type input')?.focus();
    } else if (act === 'del-room') {
      a.rooms.splice(+b.dataset.i, 1);
      h.onChange();
      rerender();
    } else if (act === 'generate') h.onGenerate();
  };
}

/* ---------- plot layout ---------- */

export function renderPlotsForm(root, d, h) {
  d.amenities = d.amenities || [];
  const onlyPlots = plotEntries(d.plots).map(([p]) => p);
  const roadCount = d.plots.length - onlyPlots.length;
  const counts = Object.fromEntries(Object.keys(STATUS).map((k) => [k, onlyPlots.filter((p) => (p.status || 'available') === k).length]));
  root.innerHTML = `
    <div class="form-head">
      <h2>Plot layout details</h2>
      <p>Enter road widths, every plot, and any open spaces in <b>feet</b>, then press <b>Generate 3D</b>.</p>
    </div>
    <fieldset>
      <legend>Layout</legend>
      <div class="grid2">
        ${field('Layout name', 'name', d.name, { full: true })}
        ${field('Location', 'location', d.location, { full: true })}
        ${field('Approval', 'approval', d.approval)}
        ${field('Contact', 'contact', d.contact)}
        ${field('Main road width (ft)', 'mainRoad', d.mainRoad, { type: 'number', min: 10 })}
        ${field('Internal road width (ft)', 'internalRoad', d.internalRoad, { type: 'number', min: 10 })}
      </div>
    </fieldset>
    <fieldset>
      <legend>Plots &amp; roads <small>${onlyPlots.length} plots · ${counts.available} available${roadCount ? ` · ${roadCount} road${roadCount > 1 ? 's' : ''}` : ''}</small></legend>
      <div class="rows-head plots"><span>No.</span><span>W</span><span>D</span><span>Facing</span><span>Price ₹</span><span>Status</span><span></span></div>
      <div class="plot-rows">
      ${d.plots
        .map((p, i) =>
          p.type === 'road'
            ? `
        <div class="row road-row">
          <span class="road-chip">🛣 Road</span>
          <label class="road-w"><input data-list="p" data-row="${i}" data-key="width" type="number" min="10" max="150" value="${esc(p.width)}" /> ft wide</label>
          <span class="moves"><button class="icon mv" data-act="up" data-i="${i}" title="Move road up" aria-label="Move road up">↑</button><button class="icon mv" data-act="down" data-i="${i}" title="Move road down" aria-label="Move road down">↓</button></span>
          <button class="icon" data-act="del-plot" data-i="${i}" title="Remove road" aria-label="Remove road">✕</button>
        </div>`
            : `
        <div class="row plots">
          <input data-list="p" data-row="${i}" data-key="id" value="${esc(p.id)}" />
          <input data-list="p" data-row="${i}" data-key="width" type="number" min="5" value="${esc(p.width)}" />
          <input data-list="p" data-row="${i}" data-key="depth" type="number" min="5" value="${esc(p.depth)}" />
          <select data-list="p" data-row="${i}" data-key="facing" title="${esc(p.facing)}">${options(FACING_SHORT, p.facing)}</select>
          <input data-list="p" data-row="${i}" data-key="price" type="number" min="0" step="10000" value="${esc(p.price)}" />
          <select data-list="p" data-row="${i}" data-key="status" data-rerender>${options(STATUS_SHORT, p.status || 'available')}</select>
          <button class="icon" data-act="del-plot" data-i="${i}" title="Remove plot" aria-label="Remove plot">✕</button>
        </div>`,
        )
        .join('')}
      </div>
      <div class="row-actions"><button class="ghost small" data-act="add-plot">+ Add plot</button><button class="ghost small danger" data-act="clear-plots">Clear all</button></div>
      <div class="add-road">
        <span>+ Road after plot</span>
        <select id="rd-after">${onlyPlots.map((p) => `<option value="${esc(p.id)}">#${esc(p.id)}</option>`).join('')}</select>
        <input id="rd-w" type="number" min="10" max="150" value="${esc(d.internalRoad || 30)}" title="Road width (ft)" /><span>ft</span>
        <button class="ghost small" data-act="add-road">Add road</button>
      </div>
      <p class="tip">A road ends the current row of plots and starts the next plots on its far side. Use it to cut a road through the middle of the layout.</p>
      <details class="bulk">
        <summary>Bulk add plots</summary>
        <div class="grid2">
          <label class="field"><span>How many</span><input id="bk-count" type="number" min="1" max="200" value="10" /></label>
          <label class="field"><span>Start number</span><input id="bk-start" type="number" min="1" value="${onlyPlots.length + 1}" /></label>
          <label class="field"><span>Width (ft)</span><input id="bk-w" type="number" min="5" value="30" /></label>
          <label class="field"><span>Depth (ft)</span><input id="bk-d" type="number" min="5" value="40" /></label>
          <label class="field"><span>Rate (₹ / sq ft)</span><input id="bk-rate" type="number" min="0" value="4500" /></label>
          <label class="field"><span>Facing</span><select id="bk-f">${options(['Alternate N / S', ...FACINGS], 'Alternate N / S')}</select></label>
        </div>
        <button class="ghost small" data-act="bulk">Add these plots</button>
      </details>
    </fieldset>
    <fieldset>
      <legend>Open spaces &amp; amenities</legend>
      <div class="rows-head amen"><span>Name</span><span>Type</span><span>W</span><span>D</span><span></span></div>
      ${d.amenities
        .map(
          (a, i) => `
        <div class="row amen">
          <input data-list="a" data-row="${i}" data-key="name" value="${esc(a.name)}" />
          <select data-list="a" data-row="${i}" data-key="type">${options(AMENITY_TYPES, a.type)}</select>
          <input data-list="a" data-row="${i}" data-key="width" type="number" min="5" value="${esc(a.width)}" />
          <input data-list="a" data-row="${i}" data-key="depth" type="number" min="5" value="${esc(a.depth)}" />
          <button class="icon" data-act="del-amen" data-i="${i}" title="Remove" aria-label="Remove amenity">✕</button>
        </div>`,
        )
        .join('')}
      <div class="row-actions"><button class="ghost small" data-act="add-amen">+ Add amenity</button></div>
    </fieldset>
    <div class="form-actions">
      <button class="primary wide" data-act="generate">Generate 3D ▸</button>
      <p class="tip">Plots are laid out in the order listed, in back-to-back rows with a road on each side. Road rows cut a road wherever you place them.</p>
    </div>`;

  const rerender = () => {
    const scroll = root.parentElement?.scrollTop;
    renderPlotsForm(root, d, h);
    if (root.parentElement && scroll !== undefined) root.parentElement.scrollTop = scroll;
  };
  bind(root, d, { p: 'plots', a: 'amenities' }, h, rerender);
  root.onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const i = +b.dataset.i;
    if (act === 'add-plot') {
      const last = onlyPlots[onlyPlots.length - 1] || { width: 30, depth: 40, facing: 'North', price: 5000000 };
      const nextId = String((Math.max(0, ...onlyPlots.map((p) => parseInt(p.id, 10) || 0)) || 0) + 1);
      d.plots.push({ ...last, id: nextId, status: 'available' });
    } else if (act === 'del-plot') d.plots.splice(i, 1);
    else if (act === 'clear-plots') {
      if (!confirmInline(b)) return;
      d.plots.length = 0;
    } else if (act === 'add-road') {
      const after = root.querySelector('#rd-after')?.value;
      const w = num(root.querySelector('#rd-w').value) || num(d.internalRoad) || 30;
      const at = d.plots.findIndex((p) => p.type !== 'road' && String(p.id) === String(after));
      d.plots.splice(at < 0 ? d.plots.length : at + 1, 0, { type: 'road', width: w });
    } else if (act === 'up' || act === 'down') {
      const j = act === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= d.plots.length) return;
      [d.plots[i], d.plots[j]] = [d.plots[j], d.plots[i]];
    } else if (act === 'add-amen') d.amenities.push({ name: 'Park', type: 'park', width: 60, depth: 40 });
    else if (act === 'del-amen') d.amenities.splice(i, 1);
    else if (act === 'bulk') {
      const count = Math.min(200, Math.max(1, num(root.querySelector('#bk-count').value)));
      const start = Math.max(1, num(root.querySelector('#bk-start').value));
      const w = num(root.querySelector('#bk-w').value);
      const dd = num(root.querySelector('#bk-d').value);
      const rate = num(root.querySelector('#bk-rate').value);
      const f = root.querySelector('#bk-f').value;
      for (let k = 0; k < count; k++) {
        d.plots.push({
          id: String(start + k),
          width: w,
          depth: dd,
          facing: f.startsWith('Alternate') ? (k % 2 ? 'South' : 'North') : f,
          price: Math.round((w * dd * rate) / 10000) * 10000,
          status: 'available',
        });
      }
    } else if (act === 'generate') return h.onGenerate();
    else return;
    h.onChange();
    rerender();
  };
}

/** Two-click confirm on a button (avoids a blocking browser dialog). */
function confirmInline(btn) {
  if (btn.dataset.armed) return true;
  btn.dataset.armed = '1';
  const old = btn.textContent;
  btn.textContent = 'Click again to clear';
  setTimeout(() => {
    delete btn.dataset.armed;
    btn.textContent = old;
  }, 2500);
  return false;
}

