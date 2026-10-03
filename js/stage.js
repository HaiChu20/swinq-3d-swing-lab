// The 3D swing viewer. The page drives it through window.swingStage:
//   setSample(s)   move to sensor reading s (0 .. number of readings - 1)
//   setData(data, {phases, hasVideo})  a recording: rebuilds the whole swing (can be called again)
//   setView(name)  "side" | "behind" | "free"
//   setMotion(m)   swap the motion source ({orientationAt, handAt}); step 4 plugs the gyro in here
import * as THREE from "three";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";
import {RoomEnvironment} from "three/addons/environments/RoomEnvironment.js";
import {Line2} from "three/addons/lines/Line2.js";
import {LineMaterial} from "three/addons/lines/LineMaterial.js";
import {LineGeometry} from "three/addons/lines/LineGeometry.js";
import {buildRacket, RACKET_POINTS} from "./racket.js";
import {testMotion as placeholderMotion, handAt as videoHandAt} from "./motion.js";
import {integrateGyro, sensorMotion} from "./imu.js";
import {autoCalibrate, MOUNTS, errorsForMotion} from "./calibrate.js";
import {createBody, handTemplateAt} from "./body.js";
import {dataOnlyStart, physicsMount, followThroughWrap} from "./dataonly.js";
import {CALIBRATION} from "./calibration.js";

const IMPACT = 200;
const TRAIL = 60;                 // readings shown in the orange trail
const BG = 0x070707;
const EMBER = new THREE.Color(0xff6735);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const wrap = document.getElementById("stage-wrap");
const host = document.getElementById("stage");

// ---------- renderer, scene, camera ----------
const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(BG);
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.Fog(BG, 7, 18);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

const camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.05, 60);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.2;
controls.maxDistance = 9;
controls.maxPolarAngle = Math.PI * 0.495;

// ---------- lights ----------
scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1a1a, 0.35));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(2.6, 5.2, 2.2);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, {left: -2.2, right: 2.2, top: 2.2, bottom: -2.2, near: 1, far: 12});
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
scene.add(key);
const fill = new THREE.DirectionalLight(0xffe2d6, 0.45);
fill.position.set(-3, 2, -2.5);
scene.add(fill);

// ---------- floor and court ----------
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({color: 0x0b0c0e, roughness: 0.95, envMapIntensity: 0.25}));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

function radialTexture(){
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, "rgba(255,255,255,0.10)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.03)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const spot = new THREE.Mesh(new THREE.CircleGeometry(3.2, 64), new THREE.MeshBasicMaterial({map: radialTexture(), transparent: true, depthWrite: false}));
spot.rotation.x = -Math.PI / 2; spot.position.y = 0.001;
scene.add(spot);

const lineMat = new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0.32});
function courtLine(x1, z1, x2, z2){
  const len = Math.hypot(x2 - x1, z2 - z1);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.05), lineMat);
  m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(z2 - z1, x2 - x1);
  m.position.set((x1 + x2) / 2, 0.002, (z1 + z2) / 2); scene.add(m);
}
// half court in metres: baseline just behind the player, net toward -Z
courtLine(-5.485, 0.9, 5.485, 0.9);
courtLine(-4.115, 0.9, -4.115, -11); courtLine(4.115, 0.9, 4.115, -11);
courtLine(-5.485, 0.9, -5.485, -11); courtLine(5.485, 0.9, 5.485, -11);
courtLine(-4.115, -5.5, 4.115, -5.5); courtLine(0, -5.5, 0, -11);
courtLine(0, 0.9, 0, 0.75);

// ---------- player: a mannequin doing a generic forehand, timed by the data ----------
const body = createBody();
const player = body.group;
scene.add(player);

// ---------- racket ----------
const racket = buildRacket();
const rig = new THREE.Group();
rig.add(racket);
scene.add(rig);


// ---------- ball ----------
function feltTexture(){
  const c = document.createElement("canvas"); c.width = 512; c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#d4ec3f"; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = 7;
  g.beginPath();
  for (let x = 0; x <= 512; x += 4) { const y = 128 + Math.sin(x / 512 * Math.PI * 4) * 62; x ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const ballMat = new THREE.MeshStandardMaterial({map: feltTexture(), roughness: 1, emissive: 0xd9f04a, emissiveIntensity: 0});
const ball = new THREE.Mesh(new THREE.SphereGeometry(0.0335, 32, 20), ballMat);
ball.castShadow = true;
scene.add(ball);

const ring = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.057, 64),
  new THREE.MeshBasicMaterial({color: EMBER, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false}));
scene.add(ring);

// ---------- trail ----------
const pathMat = new LineMaterial({color: 0x3a3a3a, linewidth: 1.5, transparent: true, opacity: 0.9});
const pathLine = new Line2(new LineGeometry(), pathMat);
scene.add(pathLine);
const trailMat = new LineMaterial({vertexColors: true, linewidth: 3.5});
const trailLine = new Line2(new LineGeometry(), trailMat);
scene.add(trailLine);

// ---------- state ----------
// Until the sensor data has loaded, a placeholder pose positions things; the racket stays hidden.
let motion = placeholderMotion;
let ready = false;
let last = 399;                    // last reading index of the current recording
let phases = window.swingPhases || {forwardStart: 150, impact: IMPACT, end: last};
let data = window.swingData || null;
let sample = parseFloat(document.getElementById("scrub")?.value || "0") || 0;
let headPath = [];                 // head-centre position for every reading
let dirty = true;

const tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3();
function headCenterAt(s, out = new THREE.Vector3()){
  motion.orientationAt(s, tmpQ);
  return out.copy(RACKET_POINTS.headCenter).applyQuaternion(tmpQ).add(motion.handAt(s, tmpV));
}

function rebuildPath(){
  headPath = [];
  const flat = [];
  for (let i = 0; i <= last; i++) { const p = headCenterAt(i); headPath.push(p); flat.push(p.x, p.y, p.z); }
  pathLine.geometry.dispose();
  pathLine.geometry = new LineGeometry().setPositions(flat);
  pathLine.computeLineDistances();

  // ball sits on the string face at contact
  const q = motion.orientationAt(phases.impact, new THREE.Quaternion());
  const n = RACKET_POINTS.faceNormal.clone().applyQuaternion(q);
  if (n.z > 0) n.negate();          // the ball sits on the side facing the net
  ball.position.copy(headCenterAt(phases.impact)).addScaledVector(n, 0.0335 + 0.003);
  ring.position.copy(ball.position);
  ring.lookAt(tmpV.copy(ball.position).add(n));
}

const bgColor = new THREE.Color(BG);
function updateTrail(){
  const end = Math.min(sample, last);
  const start = Math.max(0, end - TRAIL);
  const pos = [], col = [];
  const n = Math.floor(end) - Math.ceil(start) + 2;
  const pts = [];
  for (let i = Math.ceil(start); i <= Math.floor(end); i++) pts.push(headPath[i]);
  pts.push(headCenterAt(end));
  if (pts.length < 2) pts.unshift(headPath[0]);
  pts.forEach((p, k) => {
    const t = k / (pts.length - 1);
    const c = bgColor.clone().lerp(EMBER, t * t);
    pos.push(p.x, p.y, p.z); col.push(c.r, c.g, c.b);
  });
  trailLine.geometry.dispose();
  trailLine.geometry = new LineGeometry().setPositions(pos).setColors(col);
  trailLine.visible = ready && n > 0 && end > 0.5;
}

const speedBadge = document.getElementById("speed-badge");
function updateSpeed(){
  if (!speedBadge) return;
  if (!data) { speedBadge.textContent = "Rotation – °/s"; return; }
  const i = Math.round(Math.min(Math.max(sample, 0), last));
  const w = Math.hypot(data.gx[i], data.gy[i], data.gz[i]);
  speedBadge.textContent = "Rotation " + Math.round(w).toLocaleString("en-US") + " °/s";
  speedBadge.classList.toggle("hot", w > 900);
}

function setSample(s){
  sample = Math.min(Math.max(s, 0), last);
  motion.orientationAt(sample, rig.quaternion);
  motion.handAt(sample, rig.position);
  body.update(sample, rig.position, phases);
  updateTrail();

  // impact: ring expands through contact, ball glows
  const d = sample - phases.impact;
  const k = Math.max(0, 1 - Math.abs(d) / 6);
  ring.material.opacity = k * 0.9;
  ring.visible = k > 0;
  ring.scale.setScalar(reduceMotion ? 1.6 : 1 + (d + 6) / 12 * 2.4);
  ballMat.emissiveIntensity = k * 0.6;

  updateSpeed();
  dirty = true;
}

// ---------- cameras ----------
const VIEWS = {
  side:   {pos: [4.2, 1.05, -0.4],  target: [0.05, 0.98, -0.3]},
  behind: {pos: [0.95, 1.8, 4.7],   target: [0.12, 1.02, -0.25]},
  free:   {pos: [3.1, 2.0, 3.3],    target: [0.05, 1.0, -0.1]}
};
let glide = null;
function markView(name){
  document.querySelectorAll("[data-view]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.view === name)));
}
function setView(name, {instant = false} = {}){
  const v = VIEWS[name]; if (!v) return;
  markView(name);
  const toPos = new THREE.Vector3(...v.pos), toTarget = new THREE.Vector3(...v.target);
  if (instant || reduceMotion) {
    camera.position.copy(toPos); controls.target.copy(toTarget); glide = null; dirty = true; return;
  }
  glide = {t0: performance.now(), fromPos: camera.position.clone(), fromTarget: controls.target.clone(), toPos, toTarget};
}
document.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));
renderer.domElement.addEventListener("pointerdown", () => { glide = null; markView("free"); });

// ---------- player toggle ----------
const playerBtn = document.getElementById("toggle-player");
if (playerBtn) playerBtn.addEventListener("click", () => {
  player.visible = !player.visible;
  playerBtn.setAttribute("aria-pressed", String(player.visible));
  dirty = true;
});

// ---------- sizing and render loop ----------
function resize(){
  const w = wrap.clientWidth, h = wrap.clientHeight;
  renderer.setSize(w, h, false);
  renderer.domElement.style.width = w + "px"; renderer.domElement.style.height = h + "px";
  camera.aspect = w / h; camera.updateProjectionMatrix();
  pathMat.resolution.set(w, h); trailMat.resolution.set(w, h);
  dirty = true;
}
new ResizeObserver(resize).observe(wrap);
controls.addEventListener("change", () => { dirty = true; });

renderer.setAnimationLoop(now => {
  if (glide) {
    const t = Math.min(1, (now - glide.t0) / 600), e = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(glide.fromPos, glide.toPos, e);
    controls.target.lerpVectors(glide.fromTarget, glide.toTarget, e);
    if (t >= 1) glide = null;
    dirty = true;
  }
  controls.update();
  if (!dirty) return;
  dirty = false;
  renderer.render(scene, camera);
});
// ---------- motion sources ----------
//   data  : gyroscope + gravity + "strings face the net at impact"; body and hand from a forehand template
//   video : gyroscope, start direction and mounting fitted to five moments in the videos; hand path from video
let mode = "data";
let qRel = null;
let dataInfo = null;                                    // how the data-only start and finish were chosen
const bases = {data: null, video: null};                 // {q0, mountIndex}
const offsets = {data: {yaw: 0, pitch: 0, roll: 0}, video: {yaw: 0, pitch: 0, roll: 0}};
const motions = {data: null, video: null};
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const $ = id => document.getElementById(id);
const handTemplate = (s, out) => handTemplateAt(s, phases, out);

function q0For(m){
  const o = offsets[m];
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(o.pitch * D2R, o.yaw * D2R, o.roll * D2R, "YXZ")).multiply(bases[m].q0);
}
function buildMotion(m){
  if (!qRel || !bases[m]) return;
  motions[m] = sensorMotion(qRel, {q0: q0For(m), qMount: MOUNTS[bases[m].mountIndex].q,
    handAt: m === "data" ? handTemplate : videoHandAt, name: m});
}

const MODE_TEXT = {
  data:  ["Data only", "gyroscope + gravity + forehand rule", "Start direction from gravity at the start of the swing and the rule that the strings face the net at impact. Sensor mounting from the accelerometer. The video is only used for the check above."],
  video: ["Video-fit", "start direction fitted to the video", "Start direction and sensor mounting fitted to five moments read from both videos. Fine-tune with the sliders and Save."]
};
function applyMode(){
  if (!motions[mode]) return;
  motion = motions[mode];
  ready = true;
  rig.visible = ball.visible = pathLine.visible = true;
  document.querySelectorAll("[data-motion]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.motion === mode)));
  const [name, sub, note] = MODE_TEXT[mode];
  const badge = $("mode-badge");
  if (badge) { badge.textContent = name + " "; const em = document.createElement("em"); em.textContent = "· " + sub; badge.appendChild(em); }
  const chip = $("racket-chip"); if (chip) chip.textContent = "· sensor";
  const noteEl = $("calib-note"); if (noteEl) noteEl.textContent = note;

  // controls: sliders for data/video, mounting + auto-fit + save only for video
  if ($("cal-mount")) $("cal-mount").disabled = mode !== "video";
  if ($("cal-auto")) $("cal-auto").disabled = mode !== "video";
  if ($("cal-save")) $("cal-save").disabled = mode !== "video";
  syncControls();

  renderFit(errorsForMotion(motion));
  rebuildPath(); setSample(sample);
  updateMetrics();
}
function renderFit(sum){
  const list = $("fit-list"); if (!list) return;
  list.textContent = "";
  for (const e of sum.errors) {
    const c = document.createElement("span");
    c.className = "fit-chip" + (e.handle < 25 ? " good" : e.handle < 45 ? "" : " bad");
    c.innerHTML = "<b></b><em></em>";
    c.querySelector("b").textContent = e.label;
    c.querySelector("em").textContent = Math.round(e.handle) + "°";
    list.appendChild(c);
  }
  $("fit-mean").textContent = Math.round(sum.meanHandle) + "°";
}
function syncControls(){
  const b = bases[mode], o = offsets[mode];
  const sel = $("cal-mount"); if (sel && b) sel.value = String(b.mountIndex);
  for (const k of ["yaw", "pitch", "roll"]) {
    const r = $("cal-" + k); if (!r) continue;
    const v = o ? o[k] : 0; r.value = v; $("cal-" + k + "-v").textContent = v + "°";
  }
}

// Face angle and swing path at impact, from the racket's rotation.
function updateMetrics(){
  const im = phases.impact;
  const q = motion.orientationAt(im - 2, new THREE.Quaternion());
  const n = RACKET_POINTS.faceNormal.clone().applyQuaternion(q);
  if (n.z > 0) n.negate();
  const tilt = Math.asin(Math.max(-1, Math.min(1, n.y))) * R2D;
  const a = RACKET_POINTS.headCenter.clone().applyQuaternion(motion.orientationAt(im - 5, new THREE.Quaternion()));
  const b = RACKET_POINTS.headCenter.clone().applyQuaternion(motion.orientationAt(im - 1, new THREE.Quaternion()));
  const v = b.sub(a);
  const path = Math.asin(Math.max(-1, Math.min(1, v.y / (v.length() || 1)))) * R2D;
  const face = $("m-face"), faceSub = $("m-face-sub"), pathEl = $("m-path"), pathSub = $("m-path-sub");
  if (face) { face.innerHTML = Math.abs(Math.round(tilt)) + "<small>°</small>"; faceSub.textContent = Math.abs(tilt) < 3 ? "square to the net" : tilt > 0 ? "open (tilted up)" : "closed (tilted down)"; }
  if (pathEl) { pathEl.innerHTML = Math.abs(Math.round(path)) + "<small>°</small>"; pathSub.textContent = path > 2 ? "low to high" : path < -2 ? "high to low" : "level"; }
}

function runAutoFit(){
  const fit = autoCalibrate(qRel);
  bases.video = {q0: fit.q0, mountIndex: fit.mountIndex};
  offsets.video = {yaw: 0, pitch: 0, roll: 0};
  console.log("[calibration] auto-fit", MOUNTS[fit.mountIndex].label, fit.errors.map(e => e.label + " " + e.handle.toFixed(0) + "°").join(", "));
  buildMotion("video"); applyMode();
}
function loadVideoCalibration(){
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem("swinq-calibration") || "null"); } catch (e) {}
  const c = saved || CALIBRATION;
  if (c && MOUNTS[c.mountIndex]) { bases.video = {q0: new THREE.Quaternion(...c.q0), mountIndex: c.mountIndex}; buildMotion("video"); }
  else runAutoFit();
}

// calibration panel
const mountSel = $("cal-mount");
if (mountSel) {
  MOUNTS.forEach((m, i) => { const o = document.createElement("option"); o.value = i; o.textContent = m.label; mountSel.appendChild(o); });
  mountSel.addEventListener("change", () => { if (mode !== "video") return; bases.video.mountIndex = +mountSel.value; buildMotion("video"); applyMode(); });
}
for (const k of ["yaw", "pitch", "roll"]) {
  const r = $("cal-" + k); if (!r) continue;
  r.addEventListener("input", () => {
    offsets[mode][k] = +r.value; $("cal-" + k + "-v").textContent = r.value + "°";
    buildMotion(mode); applyMode();
  });
}
$("cal-auto")?.addEventListener("click", () => { if (qRel && mode === "video") runAutoFit(); });
$("cal-reset")?.addEventListener("click", () => { offsets[mode] = {yaw: 0, pitch: 0, roll: 0}; buildMotion(mode); applyMode(); });
$("cal-save")?.addEventListener("click", () => {
  if (mode !== "video") return;
  const q = q0For("video");
  const out = {mountIndex: bases.video.mountIndex, mount: MOUNTS[bases.video.mountIndex].label, q0: [q.x, q.y, q.z, q.w].map(v => +v.toFixed(6))};
  try { localStorage.setItem("swinq-calibration", JSON.stringify(out)); } catch (e) {}
  console.log("CALIBRATION =", JSON.stringify(out));
  const btn = $("cal-save"); btn.textContent = "Saved"; setTimeout(() => { btn.textContent = "Save"; }, 1500);
});
document.querySelectorAll("[data-motion]").forEach(b => b.addEventListener("click", () => { mode = b.dataset.motion; applyMode(); }));

function setData(d, {phases: ph = window.swingPhases, hasVideo = true} = {}){
  data = d;
  last = d.gx.length - 1;
  if (ph) phases = ph;
  sample = Math.min(sample, last);
  // gyro -> rotation, with the ringing smoothed right after THIS recording's impact
  qRel = integrateGyro(d, {impact: phases.impact});
  // data only
  const pm = physicsMount(d, phases);
  const start = dataOnlyStart(d, qRel, MOUNTS[pm.index].q, phases);
  bases.data = {mountIndex: pm.index, q0: start.q0};
  // full wrap over the shoulder, or a short finish low in front: the body template follows the data
  const wrap = followThroughWrap(d, phases, pm.face);
  phases = {...phases, finishK: wrap.finishK};
  dataInfo = {gravity: start.gravity, wrap, mount: MOUNTS[pm.index].label};
  console.log("[data only] gravity from the calm " + start.gravity.where + " (readings " + start.gravity.start + "–" + start.gravity.end + ", " + Math.round(start.gravity.turn) + " °/s); follow-through wrap " + Math.round(wrap.wiper) + " °/s → finishK " + wrap.finishK.toFixed(2));
  console.log("[data only] handle axis from accelerometer:", MOUNTS[pm.index].label, "(mean " + pm.meanG.toFixed(1) + " g along " + pm.axis + " in the forward swing)");
  buildMotion("data");
  // video-fit only exists for the sample shot, whose videos we have
  if (hasVideo) loadVideoCalibration();
  else { bases.video = null; motions.video = null; mode = "data"; }
  applyMode();
  updateSpeed();
}

// ---------- public API ----------
window.swingStage = {
  setSample,
  setData,
  setView,
  setMotion(m){ motion = m; rebuildPath(); setSample(sample); },
  setMode(m){ mode = m; applyMode(); },
  autoFit: () => qRel && runAutoFit(),
  motions, bases, offsets,
  get dataInfo(){ return dataInfo; },
  renderNow(){ controls.update(); renderer.render(scene, camera); },   // for screenshots
  racket, rig, ball, player, scene, camera
};

rig.visible = ball.visible = pathLine.visible = trailLine.visible = false;
rebuildPath();
resize();
setView("side", {instant: true});
setSample(sample);
if (data) setData(data, {phases: window.swingPhases, hasVideo: window.swingHasVideo !== false});
