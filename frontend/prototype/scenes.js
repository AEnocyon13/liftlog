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

/**
 * 断面（輪切り）を数枚重ねて、ひとつながりの滑らかな面を作る。
 *
 * 筋肉は箱でも球でもない。「どこがどれだけ膨らんでいるか」を
 * 断面の大きさで指定できるこの方式なら、大胸筋の扇形も、
 * 上腕二頭筋の山も、ふくらはぎの膨らみも、そのままの形で作れる。
 *
 * sections: [{ p:[x,y,z], rx, ry }]
 *   p  … その断面の中心
 *   rx … 進行方向に対して横の半径
 *   ry … 進行方向に対して奥行きの半径
 * 両端は自動で塞ぐ。
 */
function loft(sections, { radial = 24, shape = 2 } = {}) {
  // shape=2 で楕円。大きくするほど角が立ち、筋肉が「面と稜線」を持つ。
  // 解剖図の筋肉が風船に見えないのは、断面が丸ではなく角を持つから。
  const e = 2 / shape;
  const sup = (v) => Math.sign(v) * Math.pow(Math.abs(v), e);
  const pts = sections.map((s) => new THREE.Vector3(...s.p));
  const pos = [], idx = [];
  const t = new THREE.Vector3(), n = new THREE.Vector3(), b = new THREE.Vector3();
  const UPZ = new THREE.Vector3(0, 0, 1), UPY = new THREE.Vector3(0, 1, 0);

  sections.forEach((s, i) => {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    t.subVectors(next, prev);
    if (t.lengthSq() < 1e-9) t.set(0, 1, 0);
    t.normalize();
    // 接線と平行にならない参照軸を選ぶ（平行だと断面の向きが定まらない）
    const ref = Math.abs(t.z) > .9 ? UPY : UPZ;
    n.crossVectors(ref, t).normalize();
    b.crossVectors(t, n).normalize();

    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = sup(Math.cos(a)), d = sup(Math.sin(a));
      pos.push(
        pts[i].x + n.x * c * s.rx + b.x * d * s.ry,
        pts[i].y + n.y * c * s.rx + b.y * d * s.ry,
        pts[i].z + n.z * c * s.rx + b.z * d * s.ry
      );
    }
  });

  for (let i = 0; i < sections.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const p0 = i * radial + j;
      const p1 = i * radial + (j + 1) % radial;
      idx.push(p0, p0 + radial, p1, p1, p0 + radial, p1 + radial);
    }
  }

  const head = pos.length / 3;
  pos.push(pts[0].x, pts[0].y, pts[0].z);
  for (let j = 0; j < radial; j++) idx.push(head, (j + 1) % radial, j);

  const tail = pos.length / 3;
  const last = pts[pts.length - 1];
  pos.push(last.x, last.y, last.z);
  const off = (sections.length - 1) * radial;
  for (let j = 0; j < radial; j++) idx.push(tail, off + j, off + (j + 1) % radial);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 丸い膨らみ（腹直筋の一枚、臀筋、膝など）。潰した球で作る */
const blob = (() => {
  const g = new THREE.SphereGeometry(1, 20, 14);
  return () => g;
})();

/* --- 体の設計図 ---------------------------------------------------------
   身長を 7.4 とし、床が y=0。x は体の左右（+が体の左側）、z は前が+。
   比率は実際のトップビルダーのもの（肩幅は身長の約0.30）。
   ---------------------------------------------------------------------- */

/** 左右対称な筋肉。+x 側だけ書いて、反対側は鏡像で作る */
const SIDE_MUSCLES = [
  { part: '肩', shape: 2.1, sections: [        // 三角筋：肩関節を覆うお椀。外端が肩幅を決める
    { p: [.66, 6.12,  .08], rx: .19, ry: .21 },
    { p: [.80, 5.96,  .04], rx: .29, ry: .30 },
    { p: [.86, 5.72,  .00], rx: .29, ry: .30 },
    { p: [.84, 5.46, -.04], rx: .20, ry: .21 }
  ]},

  { part: '胸', shape: 2.4, sections: [        // 大胸筋：胸骨から上腕へ。板ではなく、下縁の立った扇
    { p: [.13, 5.42, .38], rx: .26, ry: .05 },
    { p: [.30, 5.46, .42], rx: .29, ry: .09 },
    { p: [.47, 5.50, .41], rx: .27, ry: .09 },
    { p: [.62, 5.58, .33], rx: .21, ry: .07 },
    { p: [.72, 5.70, .18], rx: .11, ry: .05 }
  ]},

  { part: '背中', shape: 2.7, sections: [      // 広背筋：腰から脇へ。ここがV字の広がりを作る
    { p: [.40, 4.32, -.14], rx: .18, ry: .13 },
    { p: [.56, 4.84, -.18], rx: .24, ry: .18 },
    { p: [.70, 5.28, -.18], rx: .28, ry: .23 },
    { p: [.78, 5.62, -.14], rx: .24, ry: .20 },
    { p: [.82, 5.88, -.06], rx: .15, ry: .12 }
  ]},

  { part: '腕', shape: 2.05, sections: [        // 上腕二頭筋
    { p: [.72, 5.56,  .12], rx: .17, ry: .17 },
    { p: [.82, 5.16,  .15], rx: .24, ry: .23 },
    { p: [.89, 4.86,  .12], rx: .22, ry: .21 },
    { p: [.95, 4.60,  .04], rx: .12, ry: .11 }
  ]},
  { part: '腕', shape: 2.1, sections: [        // 上腕三頭筋（二頭より一回り大きい）
    { p: [.76, 5.64, -.10], rx: .18, ry: .17 },
    { p: [.85, 5.20, -.15], rx: .26, ry: .24 },
    { p: [.92, 4.86, -.13], rx: .24, ry: .22 },
    { p: [.97, 4.56, -.04], rx: .13, ry: .11 }
  ]},
  { part: '腕', shape: 2.0, sections: [        // 前腕：肘のすぐ下がもっとも太い
    { p: [.97, 4.50, .02], rx: .19, ry: .19 },
    { p: [1.02, 4.14, .05], rx: .25, ry: .23 },
    { p: [1.06, 3.78, .02], rx: .18, ry: .17 },
    { p: [1.09, 3.42, .00], rx: .12, ry: .11 }
  ]},

  { part: '脚', shape: 2.15, sections: [        // 大腿四頭筋：膝の上で一度細り、内側広筋で張り出す
    { p: [.31, 3.76, .06], rx: .32, ry: .33 },
    { p: [.33, 3.20, .09], rx: .37, ry: .38 },
    { p: [.35, 2.70, .09], rx: .35, ry: .36 },
    { p: [.37, 2.28, .05], rx: .28, ry: .28 },
    { p: [.38, 2.06, .02], rx: .21, ry: .21 }
  ]},
  { part: '脚', shape: 2.1, sections: [        // ハムストリングス
    { p: [.33, 3.68, -.16], rx: .27, ry: .25 },
    { p: [.35, 3.20, -.19], rx: .30, ry: .28 },
    { p: [.37, 2.70, -.18], rx: .28, ry: .26 },
    { p: [.38, 2.26, -.11], rx: .20, ry: .19 }
  ]},
  { part: '脚', shape: 2.05, sections: [        // 腓腹筋
    { p: [.36, 2.02,  .00], rx: .22, ry: .21 },
    { p: [.35, 1.78, -.04], rx: .30, ry: .28 },
    { p: [.34, 1.48, -.05], rx: .27, ry: .26 },
    { p: [.34, 1.10, -.02], rx: .16, ry: .16 },
    { p: [.34,  .64,  .00], rx: .11, ry: .11 }
  ]}
];

/** 体の中央にある、左右をまたぐ筋肉 */
const CENTER_MUSCLES = [
  { part: '背中', shape: 2.4, sections: [      // 僧帽筋：首から肩へ落ちる傾斜。ここが薄いと首が長く見える
    { p: [-.86, 5.90, -.02], rx: .17, ry: .15 },
    { p: [-.36, 6.26, -.12], rx: .27, ry: .20 },
    { p: [ .00, 6.36, -.14], rx: .30, ry: .23 },
    { p: [ .36, 6.26, -.12], rx: .27, ry: .20 },
    { p: [ .86, 5.90, -.02], rx: .17, ry: .15 }
  ]},
  { part: '背中', shape: 2.4, sections: [      // 脊柱起立筋と中背部の厚み
    { p: [0, 4.36, -.28], rx: .26, ry: .07 },
    { p: [0, 4.88, -.34], rx: .34, ry: .10 },
    { p: [0, 5.32, -.40], rx: .40, ry: .12 },
    { p: [0, 5.74, -.38], rx: .36, ry: .11 }
  ]}
];

/** 潰した球で作る膨らみ。[部位, 中心, 大きさ] */
const SIDE_BLOBS = [
  ['腹', [.145, 5.06, .35], [.140, .115, .055]],  // 腹直筋。縦に4段
  ['腹', [.145, 4.82, .35], [.145, .115, .055]],
  ['腹', [.145, 4.58, .33], [.140, .110, .055]],
  ['腹', [.145, 4.35, .30], [.125, .100, .050]],
  ['腹', [.44,  4.70, .13], [.080, .300, .15]],   // 外腹斜筋（脇腹）
  ['脚', [.25,  2.34, .14], [.140, .210, .12]],   // 内側広筋（膝上の瘤）
  ['脚', [.30,  3.62, -.32], [.270, .280, .21]],  // 大臀筋
  ['腕', [.73,  5.86, .18], [.110, .110, .10]]    // 三角筋前部と二頭の合わせ目
];

/** 選択の対象にしない土台。[中心, 大きさ] */
const NEUTRAL_BLOBS = [
  [[.37, 2.06,  .04], [.19, .15, .18]],   // 膝
  [[1.11, 3.18, .01], [.13, .22, .10]],   // 手
  [[.34,  .18,  .13], [.15, .11, .31]]    // 足
];

const NEUTRAL_LOFTS = [
  [                                        // 頭：顎と頭蓋を持たせる（球だと卵に見える）
    { p: [0, 6.48,  .00], rx: .22, ry: .24 },
    { p: [0, 6.64,  .02], rx: .30, ry: .34 },
    { p: [0, 6.86,  .02], rx: .36, ry: .42 },
    { p: [0, 7.10,  .00], rx: .38, ry: .44 },
    { p: [0, 7.32, -.02], rx: .30, ry: .34 },
    { p: [0, 7.44, -.03], rx: .14, ry: .16 }
  ],
  [                                        // 胴体の芯（骨盤から鎖骨まで）
    { p: [0, 3.50, 0], rx: .54, ry: .36 },
    { p: [0, 3.86, 0], rx: .64, ry: .40 },
    { p: [0, 4.20, 0], rx: .58, ry: .36 },
    { p: [0, 4.52, 0], rx: .49, ry: .31 },
    { p: [0, 4.90, 0], rx: .55, ry: .36 },
    { p: [0, 5.30, 0], rx: .65, ry: .42 },
    { p: [0, 5.70, 0], rx: .72, ry: .46 },
    { p: [0, 6.02, 0], rx: .62, ry: .40 },
    { p: [0, 6.24, 0], rx: .44, ry: .32 }
  ],
  [                                        // 首
    { p: [0, 5.96, -.02], rx: .35, ry: .34 },
    { p: [0, 6.28, -.02], rx: .31, ry: .31 },
    { p: [0, 6.58, -.01], rx: .28, ry: .28 }
  ],
  [                                        // 脛
    { p: [.35, 1.98, .06], rx: .21, ry: .20 },
    { p: [.34, 1.42, .06], rx: .17, ry: .17 },
    { p: [.34,  .84, .03], rx: .13, ry: .14 },
    { p: [.34,  .40, .01], rx: .10, ry: .11 }
  ]
];

export function mountBody(canvas, onChange) {
  const renderer = makeRenderer(canvas, { alpha: true });
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(32, 1, .1, 60);
  camera.position.set(0, .1, 14.2);

  /* 筋肉の起伏は、正面からの強い光より「斜めの主光＋縁の光」で出る。
     上から下へ色が変わる半球光を足すと、丸みが素直に見える。 */
  scene.add(new THREE.HemisphereLight(0x7f95c6, 0x10151f, .6));
  const key  = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(-3.2, 5, 6);  scene.add(key);
  const fill = new THREE.DirectionalLight(0x6b80b0, .35); fill.position.set(3.5, 1, 5);  scene.add(fill);
  const limeL = new THREE.PointLight(LIME, 55, 32, 2);    limeL.position.set(-4.6, 2.6, 3.5); scene.add(limeL);
  const rimR = new THREE.PointLight(CYAN, 95, 32, 2);     rimR.position.set(5.0, 1.2, -1.8); scene.add(rimR);
  const rimL = new THREE.PointLight(0xa9b6ff, 60, 32, 2); rimL.position.set(-5.0, .6, -2.4); scene.add(rimL);

  const figure = new THREE.Group();
  figure.position.y = -3.72;      // 体の中心を原点に合わせる
  scene.add(figure);

  const groups = {};
  BODY_PARTS.forEach((p) => {
    const g = new THREE.Group();
    g.userData = {
      part: p, level: 0,
      mat: new THREE.MeshPhysicalMaterial({
        color: 0x343f57, metalness: .08, roughness: .5,
        clearcoat: .16, clearcoatRoughness: .6,      // うっすら汗ばんだ程度
        emissive: new THREE.Color(0x7ad016), emissiveIntensity: 0
      })
    };
    figure.add(g);
    groups[p] = g;
  });

  const neutralMat = new THREE.MeshPhysicalMaterial({
    color: 0x2a3348, metalness: .06, roughness: .6, clearcoat: .1
  });

  const targets = [];
  const place = (part, geo, { mirror = false } = {}) => {
    const g = groups[part];
    const m = new THREE.Mesh(geo, g.userData.mat);
    if (mirror) m.scale.x = -1;
    m.userData.part = part;
    g.add(m);
    targets.push(m);
  };

  SIDE_MUSCLES.forEach(({ part, sections, shape }) => {
    const geo = loft(sections, { shape });
    place(part, geo);
    place(part, geo, { mirror: true });
  });
  CENTER_MUSCLES.forEach(({ part, sections, shape }) => place(part, loft(sections, { shape })));

  SIDE_BLOBS.forEach(([part, p, s]) => {
    [1, -1].forEach((side) => {
      const g = groups[part];
      const m = new THREE.Mesh(blob(), g.userData.mat);
      m.position.set(p[0] * side, p[1], p[2]);
      m.scale.set(...s);
      m.userData.part = part;
      g.add(m);
      targets.push(m);
    });
  });

  NEUTRAL_LOFTS.forEach((sections) => {
    const geo = loft(sections);
    const mirrored = sections.some((s) => s.p[0] !== 0);
    const m = new THREE.Mesh(geo, neutralMat);
    figure.add(m);
    if (mirrored) {
      const m2 = new THREE.Mesh(geo, neutralMat);
      m2.scale.x = -1;
      figure.add(m2);
    }
  });
  NEUTRAL_BLOBS.forEach(([p, s]) => {
    [1, -1].forEach((side) => {
      if (p[0] === 0 && side === -1) return;
      const m = new THREE.Mesh(blob(), neutralMat);
      m.position.set(p[0] * side, p[1], p[2]);
      m.scale.set(...s);
      figure.add(m);
    });
  });

  // 足元の光だまり
  const pool = bloom(CYAN, 5.2, .2);
  pool.position.set(0, -3.6, -.4);
  scene.add(pool);

  /* --- 当たり判定と操作 ------------------------------------------------ */
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
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
    if (dragging && moved < 6) {
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

  const COL_OFF = new THREE.Color(0x343f57);
  const COL_ON  = new THREE.Color(0x6ea31e);

  const stop = runWhenVisible(canvas, (dt, t) => {
    fit(renderer, camera);

    if (!dragging) spinV += (0.0026 - spinV) * .03;
    spin += spinV;
    spinV *= .92;
    figure.rotation.y = spin;
    figure.position.y = -3.72 + Math.sin(t * .7) * .05;

    Object.values(groups).forEach((g) => {
      const d = g.userData;
      const want = selected.has(d.part) ? 1 : (hovered === d.part ? .4 : 0);
      d.level += (want - d.level) * .14;
      d.mat.emissiveIntensity = d.level * .55;
      d.mat.color.lerpColors(COL_OFF, COL_ON, d.level);
    });

    renderer.render(scene, camera);
  });

  onChange?.([...selected]);

  return {
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
