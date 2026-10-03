// Start orientation from the sensor data alone (no video):
//  1. Which way is down: at the start the racket moves slowly, so the accelerometer mostly feels
//     gravity. Each early reading, turned into the start frame with the gyro, says where "up" is.
//  2. Which way it faces: a forehand hits the ball with the strings facing the net, so we turn the
//     whole swing around the vertical until the strings face the net (-Z) at impact.
//  3. How the sensor sits on the racket: during the forward swing the accelerometer feels a strong
//     pull toward the hand along the handle; the axis that reads it is the handle axis.
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
  const face = names[best] === "z" ? "−y" : "−z";
  const index = MOUNTS.findIndex(m => m.handle === handle && m.face === face);
  return {index, handle, axis: names[best], meanG: bestMean};
}

export function dataOnlyStart(data, qRel, qMount, impact, window = 20){
  const up = new THREE.Vector3();
  for (let i = 0; i < window; i++) {
    up.add(new THREE.Vector3(data.ax[i], data.ay[i], data.az[i]).normalize().applyQuaternion(qRel[i]));
  }
  up.normalize();
  const tilt = new THREE.Quaternion().setFromUnitVectors(up, UP);
  const face = new THREE.Vector3(0, 0, 1).applyQuaternion(tilt.clone().multiply(qRel[impact]).multiply(qMount));
  face.y = 0; face.normalize();
  const yaw = Math.atan2(face.x, face.z) - Math.atan2(0, -1);
  return new THREE.Quaternion().setFromAxisAngle(UP, -yaw).multiply(tilt);
}
