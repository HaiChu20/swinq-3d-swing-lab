// Gyroscope -> racket orientation.
// The gyro measures turning speed in the sensor's own frame (deg/s, 416 readings a second).
// Adding up each small turn gives the sensor's orientation relative to where it started.
import * as THREE from "three";
import {handAt} from "./motion.js";

export const FS = 416;
const D2R = Math.PI / 180;
// The racket frame rings for a moment after the ball hits the strings. We smooth the gyro from just
// before the detected impact to ~35 readings after it (about 85 ms).
const RING_BEFORE = 2, RING_AFTER = 35;

// Copy the gyro columns; optionally smooth the ringing right after impact (centred 5-reading average).
export function cleanGyro(data, {smoothImpact = true, impact = null} = {}){
  const g = ["gx", "gy", "gz"].map(k => Float64Array.from(data[k]));
  if (smoothImpact && impact != null) {
    const a = Math.max(0, impact - RING_BEFORE), b = Math.min(g[0].length - 1, impact + RING_AFTER);
    for (const col of g) {
      const src = Float64Array.from(col);
      for (let i = a; i <= b; i++) {
        let sum = 0, n = 0;
        for (let j = i - 2; j <= i + 2; j++) if (j >= 0 && j < src.length) { sum += src[j]; n++; }
        col[i] = sum / n;
      }
    }
  }
  return g;
}

// qRel[i]: orientation at reading i relative to reading 0 (identity at 0).
// Body-frame rates, so each small turn multiplies on the right: q = q * dq.
export function integrateGyro(data, opts){
  const [gx, gy, gz] = cleanGyro(data, opts);
  const n = gx.length, dt = 1 / FS;
  const out = [new THREE.Quaternion()];
  const w = new THREE.Vector3(), dq = new THREE.Quaternion();
  for (let i = 1; i < n; i++) {
    // average of the two neighbouring readings (trapezoid rule)
    w.set((gx[i - 1] + gx[i]) / 2, (gy[i - 1] + gy[i]) / 2, (gz[i - 1] + gz[i]) / 2).multiplyScalar(D2R);
    const angle = w.length() * dt;
    if (angle > 0) dq.setFromAxisAngle(w.normalize(), angle); else dq.identity();
    out.push(out[i - 1].clone().multiply(dq).normalize());
  }
  return out;
}

// Same API as testMotion: racket = q0 * qRel(s) * qMount
//   q0     where the sensor pointed at reading 0
//   qMount how the sensor sits on the racket (racket axes expressed in sensor axes)
export function sensorMotion(qRel, {q0, qMount, handAt: hand = handAt, name = "sensor"}){
  const a = new THREE.Quaternion();
  return {
    name,
    q0: q0.clone(), qMount: qMount.clone(),
    orientationAt(s, out = new THREE.Quaternion()){
      const c = Math.min(Math.max(s, 0), qRel.length - 1);
      const i = Math.min(Math.floor(c), qRel.length - 2);
      a.slerpQuaternions(qRel[i], qRel[i + 1], c - i);
      return out.copy(q0).multiply(a).multiply(qMount);
    },
    handAt: hand
  };
}

export function rotationAngleDeg(q1, q2){
  return 2 * Math.acos(Math.min(1, Math.abs(q1.dot(q2)))) / D2R;
}
