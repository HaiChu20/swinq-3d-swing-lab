// Hand path read from video 1 (used by Video-fit mode) and a placeholder pose used while the data loads.
// Scene axes: player at the origin, hitting toward -Z (the net), +Y up, camera 1 sits on +X.
// The sensor modes compute their own orientation (js/imu.js); handAt() is reused by Video-fit.
import * as THREE from "three";

// reading = 200 + (frame - 131) * 416 / 240
const KEYS = [
  // ready / take-back, frame 16: racket up and behind, head high
  {s: 0,   hand: [0.12, 1.32, 0.42], dir: [0.05, 0.92, 0.38],  normal: [0.15, 0.25, -1]},
  // racket drop, frame 105: head low behind the hip, face toward camera 1
  {s: 155, hand: [0.26, 0.98, 0.50], dir: [0.10, -0.80, 0.60], normal: [1, 0.15, 0.1]},
  // contact, frame 131: strings facing the net, head below the hand (this player hits low)
  {s: 200, hand: [0.30, 0.98, -0.05], dir: [0.12, -0.95, -0.22], normal: [0.05, -0.1, -1]},
  // extension, frame 180: out in front and rising
  {s: 285, hand: [0.20, 1.38, -0.38], dir: [-0.25, 0.62, -0.74], normal: [0.95, 0.25, 0.1]},
  // finish, frame 225: wrapped over the left shoulder
  {s: 363, hand: [-0.12, 1.52, -0.08], dir: [-0.35, -0.05, 0.94], normal: [-0.2, 1, 0.1]}
];

function basisQuat(dir, normal){
  const y = new THREE.Vector3(...dir).normalize();
  const z = new THREE.Vector3(...normal);
  z.addScaledVector(y, -z.dot(y)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

const KEYQ = KEYS.map(k => basisQuat(k.dir, k.normal));

// The keyframes double as reference poses for calibrating the sensor (js/calibrate.js).
const LABELS = ["Start", "Drop", "Contact", "Extension", "Finish"];
export const REFERENCE = KEYS.map((k, i) => ({s: k.s, q: KEYQ[i], label: LABELS[i]}));
// Constant speed inside each segment, so the racket keeps moving through contact
// (short segments with big turns are fast). Only the finish eases out to a stop.
function segment(s){
  const c = Math.min(Math.max(s, KEYS[0].s), KEYS[KEYS.length - 1].s);
  let i = 0;
  while (i < KEYS.length - 2 && c > KEYS[i + 1].s) i++;
  let t = Math.min(Math.max((c - KEYS[i].s) / (KEYS[i + 1].s - KEYS[i].s), 0), 1);
  if (i === KEYS.length - 2) t = 1 - (1 - t) * (1 - t);
  return {i, t};
}

export function orientationAt(s, out = new THREE.Quaternion()){
  const {i, t} = segment(s);
  return out.slerpQuaternions(KEYQ[i], KEYQ[i + 1], t);
}

// Hand (racket grip) path for Video-fit mode, measured on video 1 (side camera, 255 px per metre from the
// player's height): back(+Z)/forward(-Z) and height (Y). Left/right (X) keeps the earlier two-camera reading.
// Readings 100-200 are dense because that is where the racket drops and the hand travels fastest.
const HAND_PATH = [
  [0,   [0.12, 1.34,  0.87]],
  [60,  [0.15, 1.24,  0.82]],
  [100, [0.20, 1.11,  0.75]],
  [120, [0.22, 1.01,  0.67]],
  [140, [0.24, 0.87,  0.53]],
  [155, [0.26, 0.79,  0.35]],
  [170, [0.28, 0.75,  0.11]],
  [185, [0.29, 0.79, -0.23]],
  [200, [0.30, 0.96, -0.52]],
  [240, [0.26, 1.38, -0.75]],
  [285, [0.20, 1.70, -0.58]],
  [355, [-0.12, 1.67, -0.25]]
];

// Smooth curve through the measured points (cubic Hermite with tangents scaled to the real time gaps,
// so unevenly spaced points don't overshoot). Holds the last point after reading 355.
export function handAt(s, out = new THREE.Vector3()){
  const P = HAND_PATH, n = P.length;
  const c = Math.min(Math.max(s, P[0][0]), P[n - 1][0]);
  let i = 0;
  while (i < n - 2 && c > P[i + 1][0]) i++;
  const [t0, a] = P[i], [t1, b] = P[i + 1];
  const h = t1 - t0, u = (c - t0) / h;
  const tangent = j => {
    const prev = P[Math.max(j - 1, 0)], next = P[Math.min(j + 1, n - 1)];
    return prev[1].map((_, k) => (next[1][k] - prev[1][k]) / (next[0] - prev[0]));
  };
  const ma = tangent(i), mb = tangent(i + 1);
  const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
  const v = a.map((_, k) => h00 * a[k] + h10 * h * ma[k] + h01 * b[k] + h11 * h * mb[k]);
  return out.set(v[0], v[1], v[2]);
}

export const testMotion = {name: "test", orientationAt, handAt};
