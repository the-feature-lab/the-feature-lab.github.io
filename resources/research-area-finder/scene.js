// Three.js view of the difficulty x impact x theory cube.
// Data coordinates are in [-1, 1]^3 with the origin at the cube's centre.
// World mapping: difficulty -> +x, theory -> +y (up), impact -> -z (away from the default view).
//
// Like a matplotlib 3D axis, the gridded panes are always the two walls farthest
// from the camera plus the floor, and the axis labels sit on the nearest edges,
// so the frame follows the camera as it orbits.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const clamp = (v) => Math.max(-1, Math.min(1, v));
const toWorld = (p) => new THREE.Vector3(p.difficulty, p.theory, -p.impact);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const HOME_DIR = V(0.55, 0.5, 1).normalize();
const TARGET = V(0, -0.1, 0);
const FLOOR_Y = -1;

const INK = {
  floor: 0x29292b,
  wall: 0x242426,
  edge: 0x5c5b57,
  grid: 0x38383a,
  gridCentre: 0x4a4a47,
  guide: 0x9a988f,
  tick: 0x8a8880,
};

const unitSphere = new THREE.SphereGeometry(1, 28, 18);
const unitDisc = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
const cone = new THREE.ConeGeometry(0.042, 0.085, 18);

function line(points, color, { dashed = false, opacity = 1 } = {}) {
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 0.04, gapSize: 0.035, transparent: opacity < 1, opacity })
    : new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
  const l = new THREE.Line(geo, mat);
  if (dashed) l.computeLineDistances();
  return l;
}

function label(text, className) {
  const div = document.createElement('div');
  div.className = className;
  div.textContent = text;
  return new CSS2DObject(div);
}

export class FieldScene {
  // onDraft(draft, final): the active point moved; final=true when a gesture ends.
  // onSelect(topic|null): a point was clicked (null = empty space).
  constructor(el, axes, { onDraft, onSelect } = {}) {
    this.el = el;
    this.onDraft = onDraft ?? (() => {});
    this.onSelect = onSelect ?? (() => {});
    this.data = null;
    this.edit = null; // { topic, draft }
    this.pickables = [];

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.tabIndex = 0;
    el.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'label-layer';
    el.appendChild(this.labels.domElement);

    this.tooltip = document.createElement('div');
    this.tooltip.className = 'viz-tooltip';
    this.tooltip.hidden = true;
    el.appendChild(this.tooltip);

    // Pointer handlers go on before OrbitControls so grabbing a handle can stop
    // the event from reaching the controls.
    this.raycaster = new THREE.Raycaster();
    this.bindPointer();

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    Object.assign(this.controls, {
      enableDamping: true, dampingFactor: 0.08, enablePan: false,
      minDistance: 3.5, maxDistance: 14, rotateSpeed: 0.7,
      minPolarAngle: 0.12, maxPolarAngle: 1.36, // stay above the floor
    });

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.position.set(2, 5, 3);
    this.scene.add(sun);

    this.buildPanes();
    this.buildAxes(axes);
    this.dynamic = new THREE.Group();
    this.scene.add(this.dynamic);

    this.resize();
    this.snapHome();
    new ResizeObserver(() => this.resize()).observe(el);
    this.renderer.setAnimationLoop((t) => this.tick(t));
  }

  // ---------- frame ----------
  buildPanes() {
    const pane = (axis, s) => {
      const g = new THREE.Group();
      const fill = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.MeshBasicMaterial({
          color: axis === 'y' ? INK.floor : INK.wall, side: THREE.DoubleSide,
          polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
        }),
      );
      if (axis === 'x') { fill.rotation.y = Math.PI / 2; fill.position.x = s; }
      if (axis === 'y') { fill.rotation.x = -Math.PI / 2; fill.position.y = s; }
      if (axis === 'z') fill.position.z = s;
      g.add(fill);
      const P = (u, v) => (axis === 'x' ? V(s, u, v) : axis === 'y' ? V(u, s, v) : V(u, v, s));
      for (const t of [-0.5, 0, 0.5]) {
        const c = t === 0 ? INK.gridCentre : INK.grid;
        g.add(line([P(t, -1), P(t, 1)], c), line([P(-1, t), P(1, t)], c));
      }
      g.add(line([P(-1, -1), P(1, -1), P(1, 1), P(-1, 1), P(-1, -1)], INK.edge));
      this.scene.add(g);
      return g;
    };
    this.panes = {
      floor: pane('y', FLOOR_Y),
      xNeg: pane('x', -1), xPos: pane('x', 1),
      zNeg: pane('z', -1), zPos: pane('z', 1),
    };
  }

  buildAxes(axes) {
    this.ax = {};
    for (const k of ['difficulty', 'impact', 'theory']) {
      this.ax[k] = {
        low: label(axes[k].low, 'axis-end'),
        high: label(axes[k].high, 'axis-end'),
        name: label(axes[k].name, 'axis-name'),
      };
      Object.values(this.ax[k]).forEach((l) => this.scene.add(l));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12 * 3), 3));
    this.ticks = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: INK.tick }));
    this.scene.add(this.ticks);
  }

  screenX(v) { return v.clone().project(this.camera).x; }

  // Put panes at the back and labels on the front edges for the current camera.
  layoutFrame() {
    const c = this.camera.position.clone().sub(this.controls.target);
    const sx = c.x >= 0 ? 1 : -1;
    const sz = c.z >= 0 ? 1 : -1;
    this.panes.xNeg.visible = sx > 0;
    this.panes.xPos.visible = sx < 0;
    this.panes.zNeg.visible = sz > 0;
    this.panes.zPos.visible = sz < 0;

    const y = FLOOR_Y;
    // Theory goes on whichever silhouette vertical edge is further left on screen
    // (point labels run rightwards, so the left side stays clear).
    const cands = [V(sx, 0, -sz), V(-sx, 0, sz)];
    const e = this.screenX(cands[0]) <= this.screenX(cands[1]) ? cands[0] : cands[1];
    const edges = {
      difficulty: { a: V(-1, y, sz), b: V(1, y, sz), out: V(0, 0, sz) },
      impact: { a: V(sx, y, 1), b: V(sx, y, -1), out: V(sx, 0, 0) },
      theory: { a: V(e.x, -1, e.z), b: V(e.x, 1, e.z), out: V(e.x, 0, e.z).normalize() },
    };

    const tick = this.ticks.geometry.attributes.position;
    let i = 0;
    const seg = (p, q) => { tick.setXYZ(i++, p.x, p.y, p.z); tick.setXYZ(i++, q.x, q.y, q.z); };

    for (const [k, { a, b, out }] of Object.entries(edges)) {
      const L = this.ax[k];
      L.low.position.copy(a).addScaledVector(out, 0.1);
      L.high.position.copy(b).addScaledVector(out, 0.1);
      seg(a, a.clone().addScaledVector(out, 0.07));
      seg(b, b.clone().addScaledVector(out, 0.07));
      if (k === 'theory') {
        // text runs away from the cube; "low" sits just above the bottom corner, "high" just below the top
        const right = this.screenX(e) >= this.screenX(TARGET) ? 0 : 1;
        L.low.center.set(right, 1);
        L.high.center.set(right, 0);
        L.name.position.set(e.x, 0, e.z).addScaledVector(out, 0.1);
        L.name.center.set(right, 0.5);
      } else {
        // text sits under its end and runs inward along the edge
        const lowIsLeft = this.screenX(a) <= this.screenX(b);
        L.low.center.set(lowIsLeft ? 0 : 1, 0);
        L.high.center.set(lowIsLeft ? 1 : 0, 0);
        L.name.position.copy(a).lerp(b, 0.5).addScaledVector(out, 0.36);
        L.name.center.set(0.5, 0);
      }
    }
    tick.needsUpdate = true;
  }

  // ---------- camera ----------
  homeView() {
    const v = THREE.MathUtils.degToRad(this.camera.fov);
    const f = Math.min(v, 2 * Math.atan(Math.tan(v / 2) * this.camera.aspect));
    return { pos: TARGET.clone().addScaledVector(HOME_DIR, 2.1 / Math.sin(f / 2)), target: TARGET.clone() };
  }

  snapHome() {
    const h = this.homeView();
    this.camera.position.copy(h.pos);
    this.controls.target.copy(h.target);
    this.controls.update();
  }

  resetView() {
    this.anim = { from: this.camera.position.clone(), to: this.homeView().pos, t0: performance.now(), ms: 600 };
  }

  tick(now) {
    if (this.anim) {
      const { from, to, t0, ms } = this.anim;
      const s = Math.min(1, (now - t0) / ms);
      const e = s < 0.5 ? 4 * s * s * s : 1 - Math.pow(-2 * s + 2, 3) / 2;
      this.camera.position.lerpVectors(from, to, e);
      if (s === 1) this.anim = null;
    }
    this.controls.update();
    this.layoutFrame();
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
    this.declutter();
  }

  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Greedy vertical nudge so point labels don't sit on top of each other.
  declutter() {
    const items = this.dynamic.children
      .filter((o) => o.userData.pointLabel && o.element.style.display !== 'none')
      .map((o) => {
        o.element.style.marginTop = '0px';
        return { el: o.element, r: o.element.getBoundingClientRect() };
      })
      .sort((a, b) => a.r.top - b.r.top);
    const placed = [];
    for (const it of items) {
      let top = it.r.top;
      const hgt = it.r.height;
      for (let moved = true; moved;) {
        moved = false;
        for (const p of placed) {
          const xOverlap = it.r.left < p.right && it.r.right > p.left;
          if (xOverlap && top < p.bottom + 2 && top + hgt > p.top - 2) { top = p.bottom + 3; moved = true; }
        }
      }
      if (top !== it.r.top) it.el.style.marginTop = `${top - it.r.top}px`;
      placed.push({ left: it.r.left, right: it.r.right, top, bottom: top + hgt });
    }
  }

  // ---------- data ----------
  // data: { view: 'mine'|'aggregate', topics: [{name, color}], mine: {topic: p},
  //         aggregate: {topic: {mean, sd, n, points: [{login, ...p}]}}, selected }
  setData(data) {
    this.data = data;
    this.rebuild();
  }

  // Make one of your points editable (or null to stop editing).
  setEdit(topic, draft) {
    this.edit = topic ? { topic, draft: { ...draft } } : null;
    this.rebuild();
  }

  clearDynamic() {
    this.dynamic.traverse((o) => { if (o.material && o.material !== this.hitMat) o.material.dispose(); });
    this.dynamic.clear();
    this.pickables = [];
  }

  marker(pos, color, r, { opacity = 1, pick = null, stem = true, shadow = true, hitR } = {}) {
    const m = new THREE.Mesh(unitSphere, new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity }));
    m.scale.setScalar(r);
    m.position.copy(pos);
    this.dynamic.add(m);
    if (stem && pos.y > FLOOR_Y + r) {
      this.dynamic.add(line([pos.clone(), V(pos.x, FLOOR_Y, pos.z)], INK.guide, { dashed: true, opacity: 0.5 * opacity }));
    }
    if (shadow) {
      const s = new THREE.Mesh(unitDisc, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 * opacity, depthWrite: false }));
      s.scale.setScalar(r * 0.8);
      s.position.set(pos.x, FLOOR_Y + 0.003, pos.z);
      this.dynamic.add(s);
    }
    if (pick) this.addHit(pos, hitR ?? Math.max(r, 0.05), pick);
    return m;
  }

  addHit(pos, r, userData) {
    this.hitMat ??= new THREE.MeshBasicMaterial({ visible: false });
    const h = new THREE.Mesh(unitSphere, this.hitMat);
    h.scale.setScalar(r);
    h.position.copy(pos);
    h.userData = userData;
    this.dynamic.add(h);
    this.pickables.push(h);
  }

  youMarker(pos, color, topic) {
    const inner = new THREE.Mesh(unitSphere, new THREE.MeshBasicMaterial({ color: 0x1c1c1d }));
    inner.scale.setScalar(0.026);
    const ring = new THREE.Mesh(unitSphere, new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }));
    ring.scale.setScalar(0.04);
    inner.position.copy(pos); ring.position.copy(pos);
    this.dynamic.add(inner, ring);
    this.addHit(pos, 0.05, { kind: 'you', topic });
  }

  topicLabel(text, pos, color, { dim = false, active = false } = {}) {
    const l = label(text, 'pt-label' + (dim ? ' is-dim' : '') + (active ? ' is-active' : ''));
    l.position.copy(pos);
    l.center.set(0, 0.5); // text starts at the point; a CSS margin clears the dot
    l.userData.pointLabel = true;
    l.element.style.setProperty('--dot', color);
    this.dynamic.add(l);
  }

  rebuild() {
    this.clearDynamic();
    const d = this.data;
    if (!d) return;
    const colorOf = Object.fromEntries(d.topics.map((t) => [t.name, t.color]));

    if (d.view === 'mine') {
      const active = this.edit?.topic;
      for (const [topic, p] of Object.entries(d.mine)) {
        if (topic === active) continue;
        const pos = toWorld(p);
        const dim = !!active;
        this.marker(pos, colorOf[topic], 0.055, { opacity: dim ? 0.45 : 1, pick: { kind: 'mine', topic } });
        this.topicLabel(topic, pos, colorOf[topic], { dim });
      }
      if (this.edit) this.drawEditable(colorOf[active]);
      return;
    }

    for (const [topic, a] of Object.entries(d.aggregate)) {
      if (!a.n) continue;
      const c = colorOf[topic];
      const f = d.selected && topic !== d.selected;
      const k = f ? 0.2 : 1;
      // individual responses only for the area whose average was clicked
      if (topic === d.selected) for (const p of a.points) {
        this.marker(toWorld(p), c, 0.018, { opacity: 0.55 * k, stem: false, shadow: false, pick: f ? null : { kind: 'resp', topic, login: p.login } });
      }
      const mpos = toWorld(a.mean);
      if (a.n > 1) {
        const ell = new THREE.Mesh(unitSphere, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.13 * k, depthWrite: false }));
        ell.scale.set(Math.max(a.sd.difficulty, 0.02), Math.max(a.sd.theory, 0.02), Math.max(a.sd.impact, 0.02));
        ell.position.copy(mpos);
        this.dynamic.add(ell);
      }
      this.marker(mpos, c, 0.06, { opacity: k, pick: { kind: 'mean', topic, n: a.n } });
      this.topicLabel(topic, mpos, c, { dim: f });
      const mine = d.mine[topic];
      if (mine && !f) this.youMarker(toWorld(mine), c, topic);
    }
  }

  drawEditable(color) {
    const { topic, draft } = this.edit;
    const pos = toWorld(draft);
    // full-height guide and floor crosshair so the position reads against the grid
    this.dynamic.add(line([V(pos.x, -1, pos.z), V(pos.x, 1, pos.z)], color, { opacity: 0.3 }));
    const fy = FLOOR_Y + 0.004;
    this.dynamic.add(line([V(-1, fy, pos.z), V(1, fy, pos.z)], color, { dashed: true, opacity: 0.4 }));
    this.dynamic.add(line([V(pos.x, fy, -1), V(pos.x, fy, 1)], color, { dashed: true, opacity: 0.4 }));

    this.marker(pos, color, 0.07, { pick: { kind: 'drag-xy', topic }, hitR: 0.1 });
    const halo = new THREE.Mesh(unitSphere, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false }));
    halo.scale.setScalar(0.11);
    halo.position.copy(pos);
    this.dynamic.add(halo);

    // up/down arrows: the height handle
    for (const dir of [1, -1]) {
      const at = pos.clone().add(V(0, dir * 0.17, 0));
      const m = new THREE.Mesh(cone, new THREE.MeshLambertMaterial({ color: 0xf5e9d0 }));
      m.position.copy(at);
      if (dir < 0) m.rotation.z = Math.PI;
      this.dynamic.add(m);
      this.addHit(at, 0.07, { kind: 'drag-z', topic });
    }
    this.topicLabel(topic, pos.clone().add(V(0.04, 0, 0)), color, { active: true });
  }

  // ---------- pointer ----------
  ndc(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  bindPointer() {
    const c = this.renderer.domElement;
    c.style.touchAction = 'none';
    let drag = null, down = null;
    c.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY };
      if (!this.edit || this.anim) return;
      const hit = this.pick(e, (u) => u.kind === 'drag-xy' || u.kind === 'drag-z');
      if (!hit) return; // let OrbitControls rotate
      e.stopImmediatePropagation();
      c.setPointerCapture(e.pointerId);
      const mode = hit.kind === 'drag-z' || e.shiftKey ? 'z' : 'xy';
      drag = { mode, offset: null };
      this.hideTooltip();
      c.style.cursor = mode === 'z' ? 'ns-resize' : 'grabbing';
    });
    c.addEventListener('pointermove', (e) => {
      if (drag) this.dragUpdate(e, drag);
      else if (e.buttons === 0) this.hover(e);
    });
    c.addEventListener('pointerup', (e) => {
      if (drag) {
        drag = null;
        c.releasePointerCapture?.(e.pointerId);
        this.onDraft({ ...this.edit.draft }, true);
        this.hover(e);
      } else if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) {
        this.click(e);
      }
      down = null;
    });
    c.addEventListener('pointercancel', () => { drag = null; down = null; });
    c.addEventListener('pointerleave', () => this.hideTooltip());
  }

  dragUpdate(e, drag) {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const p = toWorld(this.edit.draft);
    const v = new THREE.Vector3();
    if (drag.mode === 'xy') {
      if (!this.raycaster.ray.intersectPlane(new THREE.Plane(V(0, 1, 0), -p.y), v)) return;
      drag.offset ??= p.clone().sub(v);
      v.add(drag.offset);
      this.edit.draft.difficulty = clamp(v.x);
      this.edit.draft.impact = clamp(-v.z);
    } else {
      const n = this.camera.position.clone().sub(p).setY(0).normalize();
      if (!this.raycaster.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(n, p), v)) return;
      drag.offset ??= p.y - v.y;
      this.edit.draft.theory = clamp(v.y + drag.offset);
    }
    this.rebuild();
    this.onDraft({ ...this.edit.draft }, false);
  }

  click(e) {
    const hit = this.pick(e);
    if (hit) {
      if (hit.kind !== 'resp' && hit.kind !== 'drag-xy' && hit.kind !== 'drag-z') this.onSelect(hit.topic);
      return;
    }
    // while editing, a click on the floor moves the point there (height unchanged)
    if (this.edit) {
      this.raycaster.setFromCamera(this.ndc(e), this.camera);
      const v = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(new THREE.Plane(V(0, 1, 0), -FLOOR_Y), v)
        && Math.abs(v.x) <= 1.02 && Math.abs(v.z) <= 1.02) {
        this.edit.draft.difficulty = clamp(v.x);
        this.edit.draft.impact = clamp(-v.z);
        this.rebuild();
        this.onDraft({ ...this.edit.draft }, true);
        return;
      }
    }
    this.onSelect(null);
  }

  // Nudge the editable point (keyboard).
  nudge(dd, di, dt) {
    if (!this.edit) return;
    const d = this.edit.draft;
    d.difficulty = clamp(d.difficulty + dd);
    d.impact = clamp(d.impact + di);
    d.theory = clamp(d.theory + dt);
    this.rebuild();
    this.onDraft({ ...d }, true);
  }

  pick(e, filter = () => true) {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables.filter((o) => filter(o.userData)), false);
    if (!hits.length) return null;
    const rank = { 'drag-z': 0, 'drag-xy': 0, mean: 1, mine: 1, you: 2, resp: 3 };
    hits.sort((a, b) => rank[a.object.userData.kind] - rank[b.object.userData.kind] || a.distance - b.distance);
    return hits[0].object.userData;
  }

  hover(e) {
    const c = this.renderer.domElement;
    const hit = this.pick(e);
    if (!hit) { this.hideTooltip(); c.style.cursor = 'grab'; return; }
    if (hit.kind === 'drag-xy' || hit.kind === 'drag-z') {
      this.hideTooltip();
      c.style.cursor = hit.kind === 'drag-z' ? 'ns-resize' : 'move';
      return;
    }
    c.style.cursor = 'pointer';
    const t = this.tooltip;
    t.replaceChildren();
    const head = document.createElement('strong');
    head.textContent = hit.topic;
    const sub = document.createElement('span');
    sub.textContent = {
      mine: 'Click to edit',
      you: 'Your placement',
      mean: `Average of ${hit.n} response${hit.n === 1 ? '' : 's'}. Shaded region shows ±1 SD.`,
      resp: `@${hit.login}`,
    }[hit.kind];
    t.append(head, sub);
    t.hidden = false;
    const r = this.el.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const flip = x > r.width - 220;
    t.style.left = `${flip ? x - 12 : x + 14}px`;
    t.style.top = `${y + 14}px`;
    t.style.transform = flip ? 'translateX(-100%)' : 'none';
  }

  hideTooltip() { this.tooltip.hidden = true; }
}
