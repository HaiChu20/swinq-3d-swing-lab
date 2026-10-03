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
const KEYH = KEYS.map(k => new THREE.Vector3(...k.hand));

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

export function handAt(s, out = new THREE.Vector3()){
  // Catmull-Rom through the hand keyframes so the hand path is smooth, not kinked.
  const {i, t} = segment(s);
  const p0 = KEYH[Math.max(i - 1, 0)], p1 = KEYH[i], p2 = KEYH[i + 1], p3 = KEYH[Math.min(i + 2, KEYH.length - 1)];
  const t2 = t * t, t3 = t2 * t;
  for (const k of ["x", "y", "z"]) {
    out[k] = 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
  }
  return out;
}

export const testMotion = {name: "test", orientationAt, handAt};
