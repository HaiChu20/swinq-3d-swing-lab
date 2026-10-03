// Start orientation from the sensor data alone (no video):
//  1. Which way is down: at the start the racket moves slowly, so the accelerometer mostly feels
//     gravity. Each early reading, turned into the start frame with the gyro, says where "up" is.
//  2. Which way it faces: a forehand hits the ball with the strings facing the net, so we turn the
//     whole swing around the vertical until the strings face the net (-Z) at impact.
//  3. How the sensor sits on the racket: during the forward swing the accelerometer feels a strong
//     pull toward the hand along the handle; the axis that reads it is the handle axis. Which side of
//     the strings is the front comes from the swing itself: the head moves into the ball face-first.
//     This works for any mounting (dampener or overmould, either way round).
import * as THREE from "three";
import {MOUNTS} from "./calibrate.js";

const UP = new THREE.Vector3(0, 1, 0);

export function physicsMount(data, ph){
  const axes = ["ax", "ay", "az"], names = ["x", "y", "z"];
  let best = 0, bestMean = 0;
  axes.forEach((k, i) => {
    let m = 0; for (let s = ph.forwardStart; s < ph.impact; s++) m += data[k][s];
    m /= Math.max(1, ph.impact - ph.forwardStart);
    if (Math.abs(m) > Math.abs(bestMean)) { best = i; bestMean = m; }
  });
  // + reading = pull toward the hand, so the handle (hand -> head) points the other way
  const handle = (bestMean > 0 ? "−" : "+") + names[best];
  const faceAxis = names[best] === "z" ? "y" : "z";

  // Which side of the strings is the front? The strings can't tell front from back, but the swing can:
  // just before impact the racket head moves INTO the ball, in the direction the strings face.
  // Head velocity from rotation = turning speed x (handle direction); compare it with the face axis.
  const h = new THREE.Vector3(...["x", "y", "z"].map(a => a === names[best] ? (handle[0] === "−" ? -1 : 1) : 0));
  const e = new THREE.Vector3(...["x", "y", "z"].map(a => a === faceAxis ? 1 : 0));
  let lead = 0;
  for (let s = Math.max(0, ph.impact - 12); s <= ph.impact - 3; s++) {
    const w = new THREE.Vector3(data.gx[s], data.gy[s], data.gz[s]);
    lead += w.cross(h).dot(e);
  }
  const face = (lead >= 0 ? "+" : "−") + faceAxis;
  const index = MOUNTS.findIndex(m => m.handle === handle && m.face === face);
  return {index, handle, face, axis: names[best], meanG: bestMean};
}

// The calmest stretch between a0 and a1: slow turning, and a pull close to 1 g (mostly gravity).
// Score = turning (per 100 deg/s) + distance of the pull from 1 g (in g). Lower is calmer. Both matter:
// a racket turning fast feels its own swing, and a racket being stopped hard feels a pull far from 1 g.
export function calmestWindow(data, a0, a1, size = 20){
  let best = null;
  for (let a = Math.max(0, a0); a + size <= a1; a += 2) {
    let turn = 0, pullErr = 0;
    for (let i = a; i < a + size; i++) {
      turn += Math.hypot(data.gx[i], data.gy[i], data.gz[i]);
      pullErr += Math.abs(Math.hypot(data.ax[i], data.ay[i], data.az[i]) - 1);
    }
    turn /= size; pullErr /= size;
    const score = turn / 100 + pullErr;
    if (!best || score < best.score) best = {start: a, end: a + size - 1, turn, pullErr, score};
  }
  return best;
}

// Start orientation q0 from the data alone.
//  - Which way is down: gravity, read where the racket is calmest, either in the take-back (before the
//    forward swing) or in the held finish (well after impact). Each reading is turned into the start frame
//    with the gyro, so either stretch can be used.
//  - Which way it faces: turned around the vertical until the strings face the net (-Z) at impact.
export function dataOnlyStart(data, qRel, qMount, ph){
  const n = data.gx.length;
  const candidates = [
    {where: "take-back", w: calmestWindow(data, 0, Math.max(20, ph.forwardStart - 10))},
    {where: "finish", w: calmestWindow(data, ph.impact + 60, n)}
  ].filter(c => c.w);
  candidates.sort((a, b) => a.w.score - b.w.score);
  const {where, w} = candidates[0];

  const up = new THREE.Vector3();
  for (let i = w.start; i <= w.end; i++) {
    up.add(new THREE.Vector3(data.ax[i], data.ay[i], data.az[i]).normalize().applyQuaternion(qRel[i]));
  }
  up.normalize();
  const tilt = new THREE.Quaternion().setFromUnitVectors(up, UP);
  const face = new THREE.Vector3(0, 0, 1).applyQuaternion(tilt.clone().multiply(qRel[ph.impact]).multiply(qMount));
  face.y = 0; face.normalize();
  const yaw = Math.atan2(face.x, face.z) - Math.atan2(0, -1);
  const q0 = new THREE.Quaternion().setFromAxisAngle(UP, -yaw).multiply(tilt);
  return {q0, gravity: {where, start: w.start, end: w.end, turn: w.turn, pull: 1 + w.pullErr}};
}

// How far the racket wraps after impact: the "wiper" turn around the string-face axis, averaged over the
// first ~80 readings of the follow-through. A full forehand wraps fast (~900 deg/s); a short beginner's
// finish barely does. finishK: 1 = full wrap over the shoulder, 0 = short finish low in front.
export function followThroughWrap(data, ph, faceAxis){
  const col = "g" + faceAxis.replace(/[+−-]/g, "");
  const a = ph.impact + 5, b = Math.min(data.gx.length, ph.impact + 80);
  let sum = 0; for (let i = a; i < b; i++) sum += Math.abs(data[col][i]);
  const wiper = sum / Math.max(1, b - a);
  return {wiper, finishK: Math.min(1, Math.max(0, (wiper - 200) / 400))};
}
