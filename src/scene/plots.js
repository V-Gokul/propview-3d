// Plot-layout mode: turns plots (number, width, depth, facing, price, status), road widths and
// amenities into a 3D site plan with roads, a compound wall, price tags and a preview house.
import * as THREE from 'three';
import { box, cyl, sphere, mat, makeLabel, tree } from './core.js';
import { num, clamp, esc, inrShort } from '../util.js';

export const STATUS = {
  available: { label: 'Available', color: '#5bb98c' },
  hold: { label: 'On hold', color: '#f2b84b' },
  booked: { label: 'Booked', color: '#5b8def' },
  sold: { label: 'Sold', color: '#e06c5a' },
};

export const AMENITY_TYPES = {
  park: 'Park / garden',
  clubhouse: 'Clubhouse',
  water: 'Water tank',
  temple: 'Temple',
  playground: 'Playground',
  parking: 'Parking',
  other: 'Other',
};

const GAP = 10; // ft between amenities in a row

/* ---------- layout engine ---------- */

export const isRoad = (p) => p && p.type === 'road';

/**
 * Plots are grouped by the road markers in the list ({ type: 'road', width }).
 * Inside a group, rows are filled left→right in the order given and paired back-to-back into
 * blocks with an internal road between blocks. A road marker ends the current row/block and
 * draws a road of its own width before the next plots. A vertical spine road on the west joins
 * every road, and a wider main road runs along the south edge (the entrance).
 */
export function layoutPlots(data) {
  const R = clamp(num(data.internalRoad) || 30, 10, 150);
  const M = clamp(num(data.mainRoad) || 40, 10, 150);

  // split the list into groups of plots separated by road markers
  const groups = [{ plots: [], roadAfter: null }];
  data.plots.forEach((p, idx) => {
    if (isRoad(p)) {
      const g = groups[groups.length - 1];
      if (g.plots.length) {
        g.roadAfter = clamp(num(p.width) || R, 10, 150);
        groups.push({ plots: [], roadAfter: null });
      } else if (groups.length > 1) {
        // two markers in a row: keep the wider one
        const prev = groups[groups.length - 2];
        prev.roadAfter = Math.max(prev.roadAfter, clamp(num(p.width) || R, 10, 150));
      }
      return;
    }
    groups[groups.length - 1].plots.push({ ...p, idx, w: num(p.width), d: num(p.depth) });
  });
  if (!groups[groups.length - 1].plots.length) groups.pop();
  const plots = groups.flatMap((g) => g.plots);

  const area = plots.reduce((s, p) => s + p.w * p.d, 0);
  const target = Math.max(Math.sqrt(area * 1.3), 120, ...plots.map((p) => p.w));

  const fill = (items, gap = 0) => {
    const rows = [];
    let cur = [];
    let x = 0;
    for (const it of items) {
      if (cur.length && x + it.w > target) {
        rows.push(cur);
        cur = [];
        x = 0;
      }
      it.x = x;
      x += it.w + gap;
      cur.push(it);
    }
    if (cur.length) rows.push(cur);
    return rows;
  };

  const groupRows = groups.map((g) => fill(g.plots));
  const amen = (data.amenities || []).map((a, idx) => ({ ...a, idx, w: num(a.width), d: num(a.depth) })).filter((a) => a.w > 0 && a.d > 0);
  const amenRows = fill(amen, GAP);
  const rowLen = (row, gap = 0) => row.reduce((s, it) => s + it.w, 0) + gap * (row.length - 1);
  const innerW = Math.max(...groupRows.flat().map((r) => rowLen(r)), ...amenRows.map((r) => rowLen(r, GAP)), 0);
  const X0 = R; // spine road width
  const W = X0 + innerW;

  const roads = [];
  let z = 0;
  roads.push({ x: 0, z, w: W, l: R, kind: 'internal' });
  z += R;
  groupRows.forEach((rows, gi) => {
    const blocks = [];
    for (let i = 0; i < rows.length; i += 2) blocks.push([rows[i], rows[i + 1]]);
    blocks.forEach(([A, B], bi) => {
      const dA = Math.max(...A.map((p) => p.d));
      const dB = B ? Math.max(...B.map((p) => p.d)) : 0;
      A.forEach((p) => Object.assign(p, { z, front: 'north', x: p.x + X0 }));
      if (B) B.forEach((p) => Object.assign(p, { z: z + dA + dB - p.d, front: 'south', x: p.x + X0 }));
      z += dA + dB;
      const lastBlock = bi === blocks.length - 1;
      const lastGroup = gi === groupRows.length - 1;
      let width = R;
      let kind = 'internal';
      if (lastBlock && lastGroup && !amenRows.length) {
        width = M;
        kind = 'main';
      } else if (lastBlock && groups[gi].roadAfter) {
        width = groups[gi].roadAfter;
        kind = 'custom';
      }
      roads.push({ x: 0, z, w: W, l: width, kind });
      z += width;
    });
  });
  amenRows.forEach((row, i) => {
    const dd = Math.max(...row.map((a) => a.d));
    row.forEach((a) => Object.assign(a, { z, x: a.x + X0 }));
    z += dd;
    const last = i === amenRows.length - 1;
    roads.push({ x: 0, z, w: W, l: last ? M : R, kind: last ? 'main' : 'internal' });
    z += last ? M : R;
  });
  const main = roads[roads.length - 1];
  roads.push({ x: 0, z: 0, w: X0, l: main.z, kind: 'spine' });

  const D = z;
  const ox = -W / 2;
  const oz = -D / 2;
  for (const it of [...plots, ...amen, ...roads]) {
    it.x += ox;
    it.z += oz;
    if (it.d !== undefined) {
      it.cx = it.x + it.w / 2;
      it.cz = it.z + it.d / 2;
    }
  }
  return { plots, amen, roads, W, D, R, M };
}

/* ---------- builders ---------- */

function buildRoads(g, L) {
  const dash = [];
  for (const r of L.roads) {
    g.add(box(r.w, 0.25, r.l, '#5d636b', r.x + r.w / 2, r.kind === 'spine' ? 0.01 : 0, r.z + r.l / 2, { shadow: false }));
    if (r.kind === 'spine') {
      for (let z = r.z + 6; z < r.z + r.l - 6; z += 14) dash.push([r.x + r.w / 2, z + 3, 0.6, 6]);
    } else {
      const start = r.x + L.R + 6;
      for (let x = start; x < r.x + r.w - 6; x += 14) dash.push([x + 3, r.z + r.l / 2, 6, 0.6]);
    }
  }
  if (dash.length) {
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.05, 1), mat('#f4f4f2'), dash.length);
    const m = new THREE.Matrix4();
    dash.forEach(([x, z, sx, sz], i) => inst.setMatrixAt(i, m.compose(new THREE.Vector3(x, 0.3, z), new THREE.Quaternion(), new THREE.Vector3(sx, 1, sz))));
    g.add(inst);
  }
  const main = L.roads.find((r) => r.kind === 'main');
  const lm = makeLabel(`${L.M} ft main road`, 'road-tag');
  lm.position.set(main.x + main.w * 0.6, 1, main.z + main.l / 2);
  g.add(lm);
  for (const r of L.roads.filter((x) => x.kind === 'custom')) {
    const lc = makeLabel(`${r.l} ft road`, 'road-tag custom');
    lc.position.set(r.x + r.w * 0.35, 1, r.z + r.l / 2);
    g.add(lc);
  }
  const inner = L.roads.find((r) => r.kind === 'internal');
  if (inner) {
    const li = makeLabel(`${L.R} ft road`, 'road-tag');
    li.position.set(inner.x + inner.w * 0.6, 1, inner.z + inner.l / 2);
    g.add(li);
  }
}

function buildBoundary(g, L) {
  const pad = 4;
  const x0 = -L.W / 2 - pad;
  const x1 = L.W / 2 + pad;
  const z0 = -L.D / 2 - pad;
  const z1 = L.D / 2 + pad;
  const main = L.roads.find((r) => r.kind === 'main');
  const H = 4;
  const C = '#cfc4b0';
  g.add(box(x1 - x0, H, 0.8, C, (x0 + x1) / 2, 0, z0));
  g.add(box(x1 - x0, H, 0.8, C, (x0 + x1) / 2, 0, z1));
  g.add(box(0.8, H, z1 - z0, C, x1, 0, (z0 + z1) / 2));
  // west wall with a gate opening on the main road
  const gs = main.z;
  const ge = main.z + main.l;
  g.add(box(0.8, H, gs - z0, C, x0, 0, (z0 + gs) / 2));
  g.add(box(0.8, H, z1 - ge, C, x0, 0, (ge + z1) / 2));
  g.add(box(2.5, 12, 2.5, '#b9a98e', x0, 0, gs));
  g.add(box(2.5, 12, 2.5, '#b9a98e', x0, 0, ge));
  g.add(box(1.2, 2.5, ge - gs + 2.5, '#e8622c', x0, 12, (gs + ge) / 2));
  const lbl = makeLabel('Main entrance', 'road-tag gate');
  lbl.position.set(x0 - 2, 16, (gs + ge) / 2);
  g.add(lbl);
  // trees along the outside of the north & east walls
  for (let x = x0 + 10; x < x1; x += 28) g.add(tree(x, z0 - 8, 0.9));
  for (let z = z0 + 10; z < z1; z += 28) g.add(tree(x1 + 8, z, 0.9));
}

function buildAmenity(g, a) {
  const t = a.type || 'other';
  if (t === 'park' || t === 'playground') {
    g.add(box(a.w, 0.5, a.d, t === 'park' ? '#7fb76b' : '#d9c48f', a.cx, 0, a.cz));
    g.add(box(a.w * 0.8, 0.05, 3, '#e9dcc0', a.cx, 0.5, a.cz));
    const n = Math.max(2, Math.floor((a.w * a.d) / 900));
    for (let i = 0; i < n; i++) {
      const u = ((i * 0.618) % 1) - 0.5;
      const v = ((i * 0.381 + 0.25) % 1) - 0.5;
      g.add(tree(a.cx + u * (a.w - 8), a.cz + v * (a.d - 8), 0.8));
    }
    if (t === 'playground') g.add(box(6, 6, 2, '#e8622c', a.cx, 0.5, a.cz));
  } else if (t === 'water') {
    g.add(box(a.w, 0.4, a.d, '#d6d0c2', a.cx, 0, a.cz));
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(box(1, 24, 1, '#9aa3ab', a.cx + dx * a.w * 0.25, 0, a.cz + dz * a.d * 0.25));
    g.add(cyl(Math.min(a.w, a.d) * 0.35, 9, '#7fa7c4', a.cx, 24, a.cz));
  } else if (t === 'parking') {
    g.add(box(a.w, 0.3, a.d, '#7d838a', a.cx, 0, a.cz));
    for (let x = a.x + 9; x < a.x + a.w - 2; x += 9) g.add(box(0.3, 0.05, a.d * 0.4, '#f4f4f2', x, 0.32, a.z + a.d * 0.2));
  } else {
    const h = t === 'clubhouse' ? 16 : t === 'temple' ? 12 : 10;
    g.add(box(a.w, 0.4, a.d, '#d6d0c2', a.cx, 0, a.cz));
    g.add(box(a.w * 0.75, h, a.d * 0.7, t === 'temple' ? '#f3d9a4' : '#f2efe8', a.cx, 0.4, a.cz));
    g.add(box(a.w * 0.8, 0.8, a.d * 0.75, t === 'temple' ? '#d98b3a' : '#9c6f4e', a.cx, h + 0.4, a.cz));
    if (t === 'clubhouse') g.add(box(a.w * 0.4, 0.3, a.d * 0.2, '#7fb7d9', a.cx, 0.45, a.z + a.d * 0.92));
  }
  const lbl = makeLabel(`<b>${esc(a.name || AMENITY_TYPES[t])}</b><span>${a.w} × ${a.d} ft</span>`, 'room-tag amen');
  lbl.position.set(a.cx, 20, a.cz);
  g.add(lbl);
}

function previewHouse(p) {
  const g = new THREE.Group();
  const w = p.w * 0.62;
  const d = p.d * 0.55;
  const wallMat = mat('#fbfaf6', { opacity: 0.92 });
  g.add(box(w, 10, d, null, 0, 0.8, 0, { material: wallMat }));
  g.add(box(w, 9, d, null, 0, 10.8, 0, { material: wallMat }));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4), mat('#b5533c'));
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(w + 3, 7, d + 3);
  roof.position.y = 19.8 + 3.5;
  roof.castShadow = true;
  g.add(roof);
  const fz = p.front === 'north' ? -1 : 1;
  g.add(box(3, 7, 0.4, '#7b5e48', 0, 0.8, fz * (d / 2 + 0.1)));
  g.add(box(w * 0.3, 4, 0.3, '#9fc6d8', -w * 0.25, 4, fz * (d / 2 + 0.1)));
  g.add(box(w * 0.3, 4, 0.3, '#9fc6d8', w * 0.25, 13, fz * (d / 2 + 0.1)));
  g.position.set(p.cx, 0, p.cz + fz * (p.d * 0.06));
  return g;
}

/* ---------- public API ---------- */

export function buildPlots(viewer, data, { onPlot } = {}) {
  const L = layoutPlots(data);
  const root = new THREE.Group();
  viewer.content.add(root);

  root.add(box(L.W + 16, 0.35, L.D + 16, '#d9d2bf', 0, -0.35, 0, { shadow: false }));
  buildRoads(root, L);
  buildBoundary(root, L);
  L.amen.forEach((a) => buildAmenity(root, a));

  const edgeMat = new THREE.LineBasicMaterial({ color: '#ffffff' });
  const plots = L.plots.map((p) => {
    const st = STATUS[p.status] || STATUS.available;
    const m = mat(st.color, { unique: true, roughness: 0.75 });
    const slab = box(p.w - 1.2, 0.8, p.d - 1.2, null, p.cx, 0, p.cz, { material: m, shadow: false });
    slab.userData.pick = { kind: 'plot', idx: p.idx };
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), edgeMat);
    edges.scale.copy(slab.scale);
    edges.position.copy(slab.position);
    root.add(slab, edges);
    // boundary stones at the corners
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) root.add(box(0.8, 1.6, 0.8, '#f2efe8', p.cx + dx * (p.w / 2 - 0.6), 0, p.cz + dz * (p.d / 2 - 0.6)));
    viewer.addPickable(slab);
    const tag = makeLabel(
      `<b>#${esc(p.id)}</b>${p.status === 'sold' ? 'Sold' : esc(inrShort(p.price))}`,
      `plot-tag st-${esc(p.status || 'available')}`,
      () => onPlot?.(p.idx),
    );
    tag.position.set(p.cx, 7, p.cz);
    root.add(tag);
    return { ...p, slab, mat: m, tag };
  });

  let house = null;
  const span = Math.max(L.W, L.D);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  viewer.frame(span * 1.3);

  return {
    plots,
    layout: L,
    overview() {
      this.select(null);
      viewer.flyTo(V(-span * 0.15, span * 0.75, span * 0.85), V(0, 0, 0));
    },
    top() {
      viewer.flyTo(V(0, span * 1.25, 0.01), V(0, 0, 0));
    },
    select(idx) {
      if (house) {
        root.remove(house);
        house = null;
      }
      plots.forEach((p) => {
        const on = p.idx === idx;
        p.mat.emissive.set(on ? '#ffffff' : '#000000');
        p.mat.emissiveIntensity = on ? 0.25 : 0;
        p.slab.position.y = on ? 0.8 : 0.4;
        p.tag.element.classList.toggle('active', on);
      });
      const p = plots.find((x) => x.idx === idx);
      if (!p) return;
      house = previewHouse(p);
      root.add(house);
      const fz = p.front === 'north' ? -1 : 1;
      const dist = Math.max(p.w, p.d) * 1.6 + 30;
      viewer.flyTo(V(p.cx + dist * 0.45, dist * 0.75, p.cz + fz * dist), V(p.cx, 4, p.cz), 1100);
    },
  };
}
