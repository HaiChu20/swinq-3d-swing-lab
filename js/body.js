// A simple mannequin that performs a generic right-handed forehand.
// Nothing here comes from the video: the timing comes from the swing phases detected in the
// sensor data, and the right hand is placed on the racket grip with two-bone IK.
// Scene axes: net toward -Z, +Y up. Facing angle psi: chest direction = rotateY(psi) * (0,0,-1).
import * as THREE from "three";

const UP = new THREE.Vector3(0, 1, 0);
const D2R = Math.PI / 180;

// ---------- forehand template, timed by phases ----------
// Key times are expressed relative to the detected phases, so a faster or slower swing stretches the template.
function keyTimes(ph){
  const fs = ph.forwardStart, im = ph.impact, end = ph.end;
  return {t0: 0, fs, im, ext: im + (end - im) * 0.4, end};
}
function interp(keys, s){
  if (s <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [a, va] = keys[i], [b, vb] = keys[i + 1];
    if (s <= b) {
      const t = (s - a) / Math.max(1e-6, b - a), e = t * t * (3 - 2 * t);
      return Array.isArray(va) ? va.map((x, k) => x + (vb[k] - x) * e) : va + (vb - va) * e;
    }
  }
  return keys[keys.length - 1][1];
}

// How complete the finish is: 1 = full wrap over the shoulder, 0 = short finish low in front.
// Set from the data (js/dataonly.js followThroughWrap); a full finish when unknown.
const finishK = ph => (ph.finishK == null ? 1 : ph.finishK);
const mix = (a, b, t) => Array.isArray(a) ? a.map((x, i) => x + (b[i] - x) * t) : a + (b - a) * t;

// Body turn: coiled sideways in the backswing, uncoils through contact, finishes past the net
// (a short finish turns less).
export function bodyTurnAt(s, ph){
  const k = keyTimes(ph), f = finishK(ph);
  return interp([[k.t0, -80], [k.fs, -95], [k.im, -30], [k.ext, mix(-18, 5, f)], [k.end, mix(-10, 20, f)]], s) * D2R;
}

// Where the right hand (racket grip) is during a generic forehand.
const HAND_KEYS = (k, f) => [
  [k.t0,  [0.15, 1.30, 0.45]],   // racket up, prepared
  [k.fs,  [0.32, 1.02, 0.55]],   // dropped behind the hip
  [k.im,  [0.36, 0.98, -0.12]],  // contact in front of the body
  [k.ext, mix([0.36, 1.10, -0.45], [0.18, 1.36, -0.42], f)],   // extending toward the net (short: lower, in front)
  [k.end, mix([0.24, 1.08, -0.30], [-0.16, 1.50, -0.06], f)]   // full: by the left shoulder · short: low in front
];
export function handTemplateAt(s, ph, out = new THREE.Vector3()){
  const v = interp(HAND_KEYS(keyTimes(ph), finishK(ph)), s);
  return out.set(v[0], v[1], v[2]);
}

// ---------- mannequin geometry ----------
const skin = new THREE.MeshStandardMaterial({color: 0xcfcfcf, roughness: 0.55, metalness: 0.0, transparent: true, opacity: 0.92});
const jointMat = new THREE.MeshStandardMaterial({color: 0xb5b5b5, roughness: 0.5});

function limb(group, r){
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, 1, 6, 16), skin);
  m.userData.r = r; m.castShadow = true; group.add(m); return m;
}
function ball(group, r, mat = jointMat){
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat);
  m.castShadow = true; group.add(m); return m;
}
// Place a capsule between a and b; optional side axis sets which way its "width" faces.
function place(mesh, a, b, side){
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  const y = d.normalize();
  if (side) {
    const x = side.clone().addScaledVector(y, -side.dot(y)).normalize();
    const z = new THREE.Vector3().crossVectors(x, y);
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  } else mesh.quaternion.setFromUnitVectors(UP, y);
  mesh.scale.y = len / (1 + 2 * mesh.userData.r);
}

// Two-bone IK: elbow/knee position for a chain root -> end with lengths l1, l2, bending toward pole.
function solveTwoBone(root, target, l1, l2, pole){
  const d = new THREE.Vector3().subVectors(target, root);
  const dist = Math.min(d.length(), l1 + l2 - 1e-4);
  const dir = d.normalize();
  const end = root.clone().addScaledVector(dir, dist);
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const bend = pole.clone().sub(root);
  bend.addScaledVector(dir, -bend.dot(dir));
  if (bend.lengthSq() < 1e-8) bend.set(0, -1, 0).addScaledVector(dir, -dir.y);
  bend.normalize();
  const mid = root.clone().addScaledVector(dir, a).addScaledVector(bend, h);
  return {mid, end};
}

export function createBody(){
  const g = new THREE.Group();
  g.name = "player";
  const parts = {
    torso: limb(g, 0.13), pelvis: limb(g, 0.1), neck: limb(g, 0.045),
    head: ball(g, 0.105, skin),
    rUpper: limb(g, 0.048), rFore: limb(g, 0.042), lUpper: limb(g, 0.048), lFore: limb(g, 0.042),
    lThigh: limb(g, 0.068), lShin: limb(g, 0.055), rThigh: limb(g, 0.068), rShin: limb(g, 0.055),
    joints: Array.from({length: 8}, () => ball(g, 0.05))
  };
  const lFoot = new THREE.Vector3(0.05, 0.07, -0.36), rFoot = new THREE.Vector3(-0.06, 0.07, 0.32);
  const feet = [ball(g, 0.06, skin), ball(g, 0.06, skin)];
  feet[0].scale.set(1, 0.6, 1.9); feet[1].scale.set(1, 0.6, 1.9);
  feet[0].position.copy(lFoot).setY(0.04); feet[1].position.copy(rFoot).setY(0.04);

  const tmp = new THREE.Vector3();
  function update(s, hand, ph){
    const psi = bodyTurnAt(s, ph), hipPsi = psi * 0.65;
    const chest = new THREE.Vector3(0, 0, -1).applyAxisAngle(UP, psi);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, psi);
    const hipRight = new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, hipPsi);
    const hipFwd = new THREE.Vector3(0, 0, -1).applyAxisAngle(UP, hipPsi);

    const pelvis = new THREE.Vector3(0, 0.93, 0);
    const neck = pelvis.clone().add(new THREE.Vector3(0, 0.5, 0)).addScaledVector(chest, 0.04);
    const head = neck.clone().add(new THREE.Vector3(0, 0.2, 0)).addScaledVector(chest, 0.02);
    const rSh = neck.clone().addScaledVector(right, 0.19).add(tmp.set(0, -0.03, 0));
    const lSh = neck.clone().addScaledVector(right, -0.19).add(tmp.set(0, -0.03, 0));
    const rHip = pelvis.clone().addScaledVector(hipRight, 0.1), lHip = pelvis.clone().addScaledVector(hipRight, -0.1);

    place(parts.torso, pelvis.clone().add(tmp.set(0, 0.1, 0)), neck.clone().add(tmp.set(0, -0.08, 0)), right);
    parts.torso.scale.x = 1.35;
    place(parts.pelvis, lHip, rHip);
    place(parts.neck, neck, head);
    parts.head.position.copy(head);

    // right arm reaches the racket grip
    const r = solveTwoBone(rSh, hand, 0.3, 0.31, rSh.clone().add(tmp.set(0, -1, 0)).addScaledVector(right, 0.6));
    place(parts.rUpper, rSh, r.mid); place(parts.rFore, r.mid, r.end);

    // left arm: out toward the net in the backswing, folds in after contact
    const k = keyTimes(ph);
    const out = interp([[k.t0, 1], [k.fs, 1], [k.im, 0.35], [k.end, 0]], s);
    const lTarget = lSh.clone()
      .addScaledVector(right, -0.56 * out)
      .addScaledVector(chest, 0.32 * (1 - out) + 0.05)
      .add(tmp.set(0, -0.08 - 0.22 * (1 - out), 0));
    const l = solveTwoBone(lSh, lTarget, 0.3, 0.31, lSh.clone().add(tmp.set(0, -1, 0)).addScaledVector(right, -0.4));
    place(parts.lUpper, lSh, l.mid); place(parts.lFore, l.mid, l.end);

    // legs: feet planted, knees bend forward
    const lk = solveTwoBone(lHip, lFoot, 0.47, 0.47, lHip.clone().addScaledVector(hipFwd, 1));
    const rk = solveTwoBone(rHip, rFoot, 0.47, 0.47, rHip.clone().addScaledVector(hipFwd, 1));
    place(parts.lThigh, lHip, lk.mid); place(parts.lShin, lk.mid, lk.end);
    place(parts.rThigh, rHip, rk.mid); place(parts.rShin, rk.mid, rk.end);

    [rSh, r.mid, lSh, l.mid, lk.mid, rk.mid, r.end, l.end].forEach((p, i) => parts.joints[i].position.copy(p));
    parts.joints[6].scale.setScalar(0.85); parts.joints[7].scale.setScalar(0.85);
  }
  return {group: g, update};
}
