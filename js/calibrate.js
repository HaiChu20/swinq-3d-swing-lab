// Fit the sensor motion to the video.
//
// Reference poses were read from BOTH camera angles at five moments: which way the handle
// points (reliable from video) and which way the strings face (only up to front/back, so the
// sign is ignored). For each of the 24 ways the sensor could sit on the racket we search for
// the start orientation q0 that best matches them, and keep the best mounting.
import * as THREE from "three";
import {rotationAngleDeg} from "./imu.js";

const V = a => new THREE.Vector3(...a).normalize();
// Scene axes: player at origin, net toward -Z, camera 1 (side) on +X, camera 2 (behind) on +Z.
export const VIDEO_POSES = [
  {label: "Start",     s: 0,   handle: V([0.1, 0.95, 0.3]),   face: V([0, 0, 1]), faceWeight: 1},   // upright, strings to the net
  {label: "Drop",      s: 155, handle: V([0.1, -0.25, 0.96]), face: null,         faceWeight: 0},   // pointing back, low
  {label: "Contact",   s: 200, handle: V([0.12, -0.95, -0.22]), face: V([0, 0, 1]), faceWeight: 1}, // pointing down, strings to the net
  {label: "Extension", s: 285, handle: V([-0.5, 0.75, -0.4]), face: V([0, 0, 1]), faceWeight: 0.5}, // up and across the body
  {label: "Finish",    s: 363, handle: V([-0.2, 0.1, 0.97]),  face: V([1, 0, 0]), faceWeight: 0.5}  // back over the shoulder
];

// All 24 rotations that map axes onto axes (signed permutations with det +1).
export const MOUNTS = (() => {
  const axes = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  const names = ["+x","−x","+y","−y","+z","−z"];
  const out = [];
  for (let h = 0; h < 6; h++) for (let f = 0; f < 6; f++) {
    const y = new THREE.Vector3(...axes[h]), z = new THREE.Vector3(...axes[f]);
    if (Math.abs(y.dot(z)) > 0.5) continue;
    const x = new THREE.Vector3().crossVectors(y, z);
    // columns = where the racket's x, y (handle), z (face) point in sensor axes
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    out.push({q, label: "handle " + names[h] + " · face " + names[f], handle: names[h], face: names[f]});
  }
  return out;
})();

const D = 180 / Math.PI;
const Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const rotVec = p => {
  const v = new THREE.Vector3(...p), a = v.length();
  return a < 1e-9 ? new THREE.Quaternion() : new THREE.Quaternion().setFromAxisAngle(v.divideScalar(a), a);
};

// Per-pose errors in degrees: handle direction, and string direction (front/back ignored).
export function poseErrors(q0, qRel, qMount){
  return VIDEO_POSES.map(p => {
    const o = q0.clone().multiply(qRel[p.s]).multiply(qMount);
    const h = Y.clone().applyQuaternion(o), n = Z.clone().applyQuaternion(o);
    return {
      label: p.label,
      handle: Math.acos(Math.min(1, h.dot(p.handle))) * D,
      face: p.face ? Math.acos(Math.min(1, Math.abs(n.dot(p.face)))) * D : null,
      faceWeight: p.faceWeight
    };
  });
}
// Same comparison for any motion source ({orientationAt}), e.g. the data-only or test motion.
export function errorsForMotion(motion){
  const q = new THREE.Quaternion();
  const errors = VIDEO_POSES.map(p => {
    motion.orientationAt(p.s, q);
    const h = Y.clone().applyQuaternion(q), n = Z.clone().applyQuaternion(q);
    return {label: p.label, handle: Math.acos(Math.min(1, h.dot(p.handle))) * D,
      face: p.face ? Math.acos(Math.min(1, Math.abs(n.dot(p.face)))) * D : null, faceWeight: p.faceWeight};
  });
  return {errors, meanHandle: errors.reduce((a, e) => a + e.handle, 0) / errors.length};
}

const cost = errs => errs.reduce((c, e) => c + e.handle * e.handle + (e.face == null ? 0 : e.faceWeight * e.face * e.face), 0);

// Best q0 for a fixed mounting: coordinate descent on a rotation vector, from several random starts.
export function fitStart(qRel, qMount, restarts = 24){
  let best = null;
  for (let t = 0; t < restarts; t++) {
    const base = new THREE.Quaternion().random();
    let p = [0, 0, 0], b = cost(poseErrors(base, qRel, qMount));
    for (let step = 0.6; step > 1e-4; step /= 2) {
      let improved = true;
      while (improved) {
        improved = false;
        for (let k = 0; k < 3; k++) for (const sg of [1, -1]) {
          const tp = p.slice(); tp[k] += sg * step;
          const c = cost(poseErrors(rotVec(tp).multiply(base), qRel, qMount));
          if (c < b) { b = c; p = tp; improved = true; }
        }
      }
    }
    if (!best || b < best.cost) best = {cost: b, q0: rotVec(p).multiply(base)};
  }
  return best.q0;
}

export function summarise(q0, qRel, qMount){
  const errors = poseErrors(q0, qRel, qMount);
  const meanHandle = errors.reduce((a, e) => a + e.handle, 0) / errors.length;
  return {errors, meanHandle};
}

// Try every mounting, keep the best. Then pick the string side so the strings face the net at contact
// (the ball must sit on the side it comes from).
export function autoCalibrate(qRel){
  let best = null;
  MOUNTS.forEach((m, index) => {
    const q0 = fitStart(qRel, m.q, 12);
    const c = cost(poseErrors(q0, qRel, m.q));
    if (!best || c < best.cost) best = {cost: c, q0, mountIndex: index};
  });
  const contact = VIDEO_POSES.find(p => p.label === "Contact");
  const m = MOUNTS[best.mountIndex];
  const o = best.q0.clone().multiply(qRel[contact.s]).multiply(m.q);
  if (Z.clone().applyQuaternion(o).z > 0) {
    const flipped = MOUNTS.findIndex(x => x.handle === m.handle && x.face === (m.face[0] === "+" ? "−" : "+") + m.face[1]);
    best.mountIndex = flipped;
    best.q0 = fitStart(qRel, MOUNTS[flipped].q, 24);
  } else {
    best.q0 = fitStart(qRel, m.q, 24);
  }
  return {...best, ...summarise(best.q0, qRel, MOUNTS[best.mountIndex].q)};
}

export {rotationAngleDeg};
