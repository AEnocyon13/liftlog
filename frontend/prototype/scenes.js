/**
 * scenes.js — プロトタイプの3Dシーン4つ
 *
 *   1. mountHero   ホーム背景。ネオンのグリッドの上でバーベルがゆっくり回る
 *   2. mountBody   部位選択。人体を触って胸・背中・肩・腕・腹・脚を選ぶ
 *   3. mountBurst  完了演出。プレートが弾けて衝撃波が広がる
 *   4. mountBars   レポート。月ごとのボリュームを立体の棒で
 *
 * どのシーンも、画面に映っていないあいだは描画を止めます（電池のため）。
 */
import * as THREE from 'three';

/* ======================================================= 共通の下ごしらえ == */

const LIME = 0xc8ff3d;
const CYAN = 0x2ee6ff;
const MAG  = 0xff2e92;
const DARK = 0x11141b;

/** 端末が非力なときは解像度を落とす。ピクセル比は 2 までで頭打ち */
const DPR = () => Math.min(window.devicePixelRatio || 1, 2);

function makeRenderer(canvas, { alpha = false } = {}) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha, powerPreference: 'high-performance' });
  r.setPixelRatio(DPR());
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.15;
  return r;
}

/** canvas の表示サイズに合わせる。戻り値は「サイズが変わったか」 */
function fit(renderer, camera) {
  const c = renderer.domElement;
  const w = c.clientWidth, h = c.clientHeight;
  if (!w || !h) return false;
  if (c.width === Math.floor(w * DPR()) && c.height === Math.floor(h * DPR())) return false;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  return true;
}

/** 中心が明るい円のテクスチャ。光のにじみ（ブルーム）の代わりに使う */
let glowTex = null;
function glow() {
  if (glowTex) return glowTex;
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d').createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0,   'rgba(255,255,255,1)');
  g.addColorStop(.25, 'rgba(255,255,255,.55)');
  g.addColorStop(1,   'rgba(255,255,255,0)');
  const ctx = cv.getContext('2d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  glowTex = new THREE.CanvasTexture(cv);
  return glowTex;
}

/** 光のにじみを1枚の板で表す */
function bloom(color, size, opacity = .55) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow(), color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  sp.scale.set(size, size, 1);
  return sp;
}

/** ネオンのグリッド床。奥に行くほど霧で消える */
function neonFloor(y = -1.4, size = 46, div = 46) {
  const g = new THREE.GridHelper(size, div, CYAN, 0x14323c);
  g.position.y = y;
  g.material.transparent = true;
  g.material.opacity = .34;
  g.material.depthWrite = false;
  return g;
}

/** 画面に入っているあいだだけ step を回す */
function runWhenVisible(canvas, step) {
  let raf = 0, last = performance.now(), alive = true, visible = false;
  const loop = (now) => {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min((now - last) / 1000, .05);
    last = now;
    step(dt, now / 1000);
  };
  const io = new IntersectionObserver((es) => {
    const on = es[0].isIntersecting;
    if (on === visible) return;
    visible = on;
    if (on) { last = performance.now(); raf = requestAnimationFrame(loop); }
    else cancelAnimationFrame(raf);
  }, { threshold: .01 });
  io.observe(canvas);
  return () => { alive = false; cancelAnimationFrame(raf); io.disconnect(); };
}

/* =================================================== 1. ホームの背景 ===== */

export function mountHero(canvas) {
  const renderer = makeRenderer(canvas);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x06070a, .085);

  const camera = new THREE.PerspectiveCamera(48, 1, .1, 100);
  camera.position.set(0, .45, 6.8);

  scene.add(new THREE.AmbientLight(0x3a4a6a, .5));
  const keyL = new THREE.PointLight(LIME, 44, 22, 2); keyL.position.set(-3.2,  2.6, 2.8); scene.add(keyL);
  const rimL = new THREE.PointLight(CYAN, 36, 22, 2); rimL.position.set( 3.6, -1.4, 1.6); scene.add(rimL);
  const topL = new THREE.DirectionalLight(0xdfe8ff, .55);  topL.position.set(0, 6, 3);    scene.add(topL);

  scene.add(neonFloor(-1.1));

  /* --- バーベル ------------------------------------------------------- */
  const bar = new THREE.Group();

  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa6b8, metalness: 1, roughness: .28 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, 7.4, 24), steel);
  shaft.rotation.z = Math.PI / 2;
  bar.add(shaft);

  const plateMat  = new THREE.MeshStandardMaterial({ color: DARK, metalness: .85, roughness: .34 });
  const ringMat   = new THREE.MeshBasicMaterial({ color: LIME });
  const ringMat2  = new THREE.MeshBasicMaterial({ color: CYAN });

  // 内側から外側へ、だんだん小さくなるプレート
  const spec = [
    { x: 1.05, r: 1.00, t: .17, neon: ringMat  },
    { x: 1.36, r: .80,  t: .14, neon: ringMat2 },
    { x: 1.62, r: .62,  t: .12, neon: ringMat  }
  ];
  spec.forEach(({ x, r, t, neon }) => {
    [-1, 1].forEach((s) => {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(r, r, t, 48), plateMat);
      plate.rotation.z = Math.PI / 2;
      plate.position.x = x * s;
      bar.add(plate);

      // ふちのネオン。細いトーラスを貼るだけで「光っている」ように見える
      const edge = new THREE.Mesh(new THREE.TorusGeometry(r + .005, .016, 8, 72), neon);
      edge.rotation.y = Math.PI / 2;
      edge.position.x = x * s;
      bar.add(edge);

      // 中心の穴（黒く抜く）
      const hole = new THREE.Mesh(new THREE.TorusGeometry(.17, .035, 8, 32),
        new THREE.MeshStandardMaterial({ color: 0x05060a, metalness: .4, roughness: .8 }));
      hole.rotation.y = Math.PI / 2;
      hole.position.x = x * s + (t / 2 + .005) * s;
      bar.add(hole);
    });
  });

  bar.add(bloom(LIME, 4.4, .30));
  bar.rotation.set(.22, -.5, .12);
  bar.scale.setScalar(.62);
  bar.position.set(.78, 1.45, .6);   // 見出しの右側。文字に重ねない
  scene.add(bar);

  // 奥に浮かぶ光の粒
  const dustGeo = new THREE.BufferGeometry();
  const N = 140, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3]     = (Math.random() - .5) * 16;
    pos[i * 3 + 1] = (Math.random() - .5) * 8;
    pos[i * 3 + 2] = -Math.random() * 12;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    size: .075, map: glow(), color: 0x7fd8ff, transparent: true, opacity: .5,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  scene.add(dust);

  /* --- 指の動きに少しだけ反応させる ------------------------------------ */
  let px = 0, py = 0, tx = 0, ty = 0;
  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width  - .5) * .5;
    ty = ((e.clientY - r.top)  / r.height - .5) * .35;
  };
  canvas.parentElement?.addEventListener('pointermove', onMove);

  const stop = runWhenVisible(canvas, (dt, t) => {
    fit(renderer, camera);
    px += (tx - px) * .06;
    py += (ty - py) * .06;
    // 一周させるとバーが真横を向いて画面から消えるので、振り子のように往復させる
    bar.rotation.y = -.95 + Math.sin(t * .22) * .5 + px;
    bar.rotation.x = .26 + Math.sin(t * .55) * .05 - py;
    bar.position.y = 1.45 + Math.sin(t * .85) * .08;
    dust.rotation.y = t * .02;
    renderer.render(scene, camera);
  });

  return () => { canvas.parentElement?.removeEventListener('pointermove', onMove); stop(); renderer.dispose(); };
}

/* ================================================= 2. 部位選択の人体 ===== */

export const BODY_PARTS = ['肩', '胸', '背中', '腕', '腹', '脚'];

export function mountBody(canvas, onChange) {
  const renderer = makeRenderer(canvas, { alpha: true });
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(34, 1, .1, 60);
  camera.position.set(0, .92, 8.6);

  scene.add(new THREE.AmbientLight(0x4a5a7a, .6));
  const l1 = new THREE.PointLight(LIME, 42, 26, 2); l1.position.set(-4, 3.4, 5);  scene.add(l1);
  const l2 = new THREE.PointLight(CYAN, 34, 26, 2); l2.position.set( 4.4, .4, 3); scene.add(l2);
  const l3 = new THREE.DirectionalLight(0xcfe0ff, .9); l3.position.set(0, 5, 6);  scene.add(l3);
  const l4 = new THREE.DirectionalLight(0x7fa0d0, .5); l4.position.set(0, -3, 4);  scene.add(l4);

  const figure = new THREE.Group();
  figure.position.y = -.2;
  scene.add(figure);

  /* 部位ごとに材質を分ける。光らせるのは「その部位だけ」にしたいので */
  const matFor = () => new THREE.MeshStandardMaterial({
    color: 0x2b3648, metalness: .5, roughness: .38,
    emissive: new THREE.Color(0x7ad016), emissiveIntensity: 0
  });
  const neutral = new THREE.MeshStandardMaterial({ color: 0x1d2635, metalness: .45, roughness: .5 });

  const groups = {};
  BODY_PARTS.forEach((p) => {
    const g = new THREE.Group();
    g.userData = { part: p, mat: matFor(), level: 0, selected: false };
    figure.add(g);
    groups[p] = g;
  });

  const add = (part, geo, [x, y, z], rot = [0, 0, 0]) => {
    const g = groups[part];
    const m = new THREE.Mesh(geo, g.userData.mat);
    m.position.set(x, y, z);
    m.rotation.set(...rot);
    m.userData.part = part;
    g.add(m);
    return m;
  };
  const addNeutral = (geo, [x, y, z], rot = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, neutral);
    m.position.set(x, y, z);
    m.rotation.set(...rot);
    figure.add(m);
    return m;
  };

  /* --- 体を組む（単純な形の組み合わせ。低ポリゴンでネオンに映える） ----- */
  // 頭と首
  addNeutral(new THREE.SphereGeometry(.34, 24, 18), [0, 3.12, 0]);
  addNeutral(new THREE.CapsuleGeometry(.15, .18, 4, 14), [0, 2.74, 0]);

  // 胴体の芯（選択対象にしない）
  addNeutral(new THREE.BoxGeometry(.98, 1.5, .52), [0, 1.78, 0]);
  addNeutral(new THREE.BoxGeometry(1.0, .42, .58), [0, .9, 0]);           // 骨盤

  // 肩
  [-1, 1].forEach((s) => add('肩', new THREE.SphereGeometry(.35, 20, 16), [.66 * s, 2.42, 0]));

  // 胸（胴体の前面に2枚）
  [-1, 1].forEach((s) =>
    add('胸', new THREE.BoxGeometry(.4, .5, .22), [.27 * s, 2.1, .33], [0, 0, .1 * s]));

  // 背中（背面に広がる逆三角）
  add('背中', new THREE.BoxGeometry(1.06, .78, .2),  [0, 2.12, -.31]);
  [-1, 1].forEach((s) => add('背中', new THREE.BoxGeometry(.3, .62, .18), [.6 * s, 1.84, -.26], [0, 0, .42 * s]));

  // 腹
  add('腹', new THREE.BoxGeometry(.56, .64, .2), [0, 1.42, .3]);

  // 腕（上腕＋前腕）
  [-1, 1].forEach((s) => {
    add('腕', new THREE.CapsuleGeometry(.185, .62, 5, 16), [.84 * s, 1.92, 0], [0, 0, .13 * s]);
    add('腕', new THREE.CapsuleGeometry(.15,  .58, 5, 16), [.99 * s, 1.14, 0], [0, 0, .09 * s]);
    addNeutral(new THREE.SphereGeometry(.15, 14, 12), [1.07 * s, .74, 0]);   // 手
  });

  // 脚（腿＋ふくらはぎ）
  [-1, 1].forEach((s) => {
    add('脚', new THREE.CapsuleGeometry(.26, .78, 5, 16), [.3 * s, .22, 0]);
    add('脚', new THREE.CapsuleGeometry(.2,  .68, 5, 16), [.3 * s, -.78, 0]);
    addNeutral(new THREE.BoxGeometry(.26, .14, .56), [.3 * s, -1.34, .1]);   // 足
  });

  // 足元の光だまり
  const pool = bloom(CYAN, 3.4, .22);
  pool.position.set(0, -1.5, -.4);
  scene.add(pool);

  /* --- 当たり判定と操作 ------------------------------------------------ */
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  const targets = [];
  Object.values(groups).forEach((g) => g.children.forEach((m) => targets.push(m)));

  const selected = new Set(['胸']);
  let hovered = null;

  function pick(ev) {
    const r = canvas.getBoundingClientRect();
    ptr.x = ((ev.clientX - r.left) / r.width)  * 2 - 1;
    ptr.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ptr, camera);
    return ray.intersectObjects(targets, false)[0]?.object.userData.part || null;
  }

  let dragging = false, moved = 0, lastX = 0, spin = 0, spinV = 0;

  const onDown = (ev) => { dragging = true; moved = 0; lastX = ev.clientX; canvas.setPointerCapture?.(ev.pointerId); };
  const onMove = (ev) => {
    if (dragging) {
      const dx = ev.clientX - lastX;
      lastX = ev.clientX;
      moved += Math.abs(dx);
      spinV = dx * .009;
    }
    hovered = dragging ? null : pick(ev);
  };
  const onUp = (ev) => {
    if (dragging && moved < 6) {                  // 動かしていなければ「タップ」
      const p = pick(ev);
      if (p) {
        selected.has(p) ? selected.delete(p) : selected.add(p);
        onChange?.([...selected]);
      }
    }
    dragging = false;
  };
  const onLeave = () => { hovered = null; dragging = false; };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointerleave', onLeave);

  const stop = runWhenVisible(canvas, (dt, t) => {
    fit(renderer, camera);

    // 触っていないあいだはゆっくり回り続ける
    if (!dragging) spinV += (0.0028 - spinV) * .03;
    spin += spinV;
    spinV *= .92;
    figure.rotation.y = spin;
    figure.position.y = -.2 + Math.sin(t * .7) * .045;

    // 選択・ホバーに応じて発光を近づける（カクつかないよう補間）
    Object.values(groups).forEach((g) => {
      const d = g.userData;
      const want = d.selected ? 1 : (hovered === d.part ? .42 : 0);
      d.selected = selected.has(d.part);
      d.level += (want - d.level) * .14;
      d.mat.emissiveIntensity = d.level * .5;
      d.mat.color.lerpColors(new THREE.Color(0x2b3648), new THREE.Color(0x5f8f1a), d.level);
      const s = 1 + d.level * .045;
      g.scale.setScalar(s);
    });

    renderer.render(scene, camera);
  });

  onChange?.([...selected]);

  return {
    /** チップ側から選択を変えたときに呼ぶ */
    setSelection(list) { selected.clear(); list.forEach((p) => selected.add(p)); },
    dispose() {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      stop(); renderer.dispose();
    }
  };
}

/* ==================================================== 3. 完了の演出 ===== */

export function mountBurst(canvas) {
  const renderer = makeRenderer(canvas, { alpha: true });
  renderer.setClearAlpha(0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, .1, 60);
  camera.position.set(0, 0, 8);

  scene.add(new THREE.AmbientLight(0xffffff, .7));
  const l = new THREE.PointLight(LIME, 60, 30, 2); l.position.set(-3, 4, 6); scene.add(l);
  const l2 = new THREE.PointLight(CYAN, 44, 30, 2); l2.position.set(4, -2, 5); scene.add(l2);

  /* プレート（小さな輪）を撒く */
  const COLORS = [LIME, CYAN, MAG, 0xffffff];
  const plates = [];
  const plateGeo = new THREE.TorusGeometry(.2, .066, 10, 26);
  for (let i = 0; i < 26; i++) {
    const m = new THREE.Mesh(plateGeo, new THREE.MeshStandardMaterial({
      color: COLORS[i % COLORS.length], metalness: .7, roughness: .3,
      emissive: COLORS[i % COLORS.length], emissiveIntensity: .35,
      transparent: true
    }));
    m.visible = false;
    scene.add(m);
    plates.push({ m, v: new THREE.Vector3(), s: new THREE.Vector3() });
  }

  /* 広がる衝撃波 */
  const waveMat = new THREE.MeshBasicMaterial({
    color: LIME, transparent: true, opacity: 0, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const wave = new THREE.Mesh(new THREE.RingGeometry(.9, 1, 64), waveMat);
  scene.add(wave);

  /* 光の粒 */
  const SP = 180;
  const sparkPos = new Float32Array(SP * 3);
  const sparkVel = [];
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({
    size: .17, map: glow(), color: 0xeaffb0, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  scene.add(sparks);

  let tLeft = 0;

  function fire() {
    tLeft = 3.0;
    plates.forEach((p, i) => {
      p.m.visible = true;
      p.m.material.opacity = 1;
      p.m.position.set((Math.random() - .5) * .9, -2.3, (Math.random() - .5) * 1.4);
      const a = (i / plates.length) * Math.PI * 2 + Math.random() * .4;
      p.v.set(Math.cos(a) * (1.2 + Math.random() * 1.8), 7.4 + Math.random() * 3.6, Math.sin(a) * 1.1);
      p.s.set(Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3);
      p.m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    });
    sparkVel.length = 0;
    for (let i = 0; i < SP; i++) {
      sparkPos[i * 3] = sparkPos[i * 3 + 1] = sparkPos[i * 3 + 2] = 0;
      const a = Math.random() * Math.PI * 2, b = Math.acos(Math.random() * 2 - 1), sp = 2 + Math.random() * 5.5;
      sparkVel.push(new THREE.Vector3(
        Math.sin(b) * Math.cos(a) * sp, Math.sin(b) * Math.sin(a) * sp + 1.6, Math.cos(b) * sp * .5));
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparkMat.opacity = 1;
    wave.scale.setScalar(.2);
    waveMat.opacity = .9;
  }

  const stop = runWhenVisible(canvas, (dt) => {
    fit(renderer, camera);
    if (tLeft > 0) {
      tLeft -= dt;
      const fade = Math.min(1, tLeft / .9);

      plates.forEach((p) => {
        p.v.y -= 13 * dt;
        p.m.position.addScaledVector(p.v, dt);
        p.m.rotation.x += p.s.x * dt;
        p.m.rotation.y += p.s.y * dt;
        p.m.rotation.z += p.s.z * dt;
        p.m.material.opacity = fade;
      });

      const pos = sparkGeo.attributes.position.array;
      for (let i = 0; i < SP; i++) {
        const v = sparkVel[i];
        v.y -= 7 * dt;
        pos[i * 3]     += v.x * dt;
        pos[i * 3 + 1] += v.y * dt;
        pos[i * 3 + 2] += v.z * dt;
      }
      sparkGeo.attributes.position.needsUpdate = true;
      sparkMat.opacity = fade * .95;

      wave.scale.setScalar(wave.scale.x + dt * 4.2);
      waveMat.opacity = Math.max(0, waveMat.opacity - dt * 1.9);

      if (tLeft <= 0) plates.forEach((p) => { p.m.visible = false; });
      renderer.render(scene, camera);
    } else {
      renderer.clear();
    }
  });

  return { fire, dispose() { stop(); renderer.dispose(); } };
}

/* ============================================== 4. レポートの立体の棒 ==== */

export function mountBars(canvas, values, labelsEl) {
  const renderer = makeRenderer(canvas, { alpha: true });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, .1, 60);
  camera.position.set(0, 2.5, 9.4);
  camera.lookAt(0, .9, 0);

  scene.add(new THREE.AmbientLight(0x44557a, .75));
  const l1 = new THREE.PointLight(LIME, 30, 24, 2); l1.position.set(-3, 4.6, 4); scene.add(l1);
  const l2 = new THREE.PointLight(CYAN, 26, 24, 2); l2.position.set(4, 1.4, 4);  scene.add(l2);

  const grid = new THREE.GridHelper(16, 16, 0x1d4350, 0x14262e);
  grid.material.transparent = true;
  grid.material.opacity = .5;
  grid.material.depthWrite = false;
  scene.add(grid);

  const max = Math.max(...values, 1);
  const W = .62, GAP = 1.12;
  const bars = [];

  values.forEach((v, i) => {
    const last = i === values.length - 1;
    const col = last ? MAG : (v / max > .6 ? LIME : CYAN);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x18202c, metalness: .72, roughness: .3,
      emissive: col, emissiveIntensity: last ? .5 : .22
    });
    const m = new THREE.Mesh(new THREE.BoxGeometry(W, 1, W), mat);
    m.position.x = (i - (values.length - 1) / 2) * GAP;
    scene.add(m);

    // 天面のネオン
    const cap = new THREE.Mesh(new THREE.BoxGeometry(W + .04, .035, W + .04),
      new THREE.MeshBasicMaterial({ color: col }));
    cap.position.x = m.position.x;
    scene.add(cap);

    const b = bloom(col, 1.5, last ? .5 : .28);
    b.position.x = m.position.x;
    scene.add(b);

    bars.push({ m, cap, b, target: Math.max(.08, (v / max) * 3.0), h: 0 });
  });

  if (labelsEl) labelsEl.style.gridTemplateColumns = `repeat(${values.length}, 1fr)`;

  let t0 = null;
  const stop = runWhenVisible(canvas, (dt, t) => {
    fit(renderer, camera);
    if (t0 === null) t0 = t;

    bars.forEach((b, i) => {
      const delay = i * .09;
      const go = Math.max(0, Math.min(1, (t - t0 - delay) / .75));
      const e = 1 - Math.pow(1 - go, 3);                 // ゆるく着地させる
      b.h += (b.target * e - b.h) * .2;
      b.m.scale.y = Math.max(.001, b.h);
      b.m.position.y = b.h / 2;
      b.cap.position.y = b.h + .02;
      b.b.position.y = b.h + .1;
    });

    // ごくゆっくり左右に振る。真正面より立体に見える
    const a = Math.sin(t * .22) * .22;
    camera.position.x = Math.sin(a) * 9.4;
    camera.position.z = Math.cos(a) * 9.4;
    camera.lookAt(0, .9, 0);

    renderer.render(scene, camera);
  });

  return () => { stop(); renderer.dispose(); };
}
