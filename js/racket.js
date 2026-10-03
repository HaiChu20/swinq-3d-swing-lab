// Tennis racket built from simple shapes, at real size (metres).
// Local frame: origin = the hand (8 cm up from the butt), +Y = along the handle toward the head,
// +Z = the string face normal, +X = across the head.
import * as THREE from "three";

const BUTT = -0.08;              // butt cap, 8 cm below the hand
const LENGTH = 0.685;            // overall length
const HANDLE_TOP = BUTT + 0.19;  // 19 cm handle
const HEAD_CENTER = 0.44;        // 52 cm from the butt
const HEAD_A = 0.13;             // outer half-width  (26 cm head)
const HEAD_B = 0.165;            // outer half-height (33 cm head)
const BED_A = 0.116, BED_B = 0.15;

export const RACKET_POINTS = {
  headCenter: new THREE.Vector3(0, HEAD_CENTER, 0),
  tip: new THREE.Vector3(0, BUTT + LENGTH, 0),
  faceNormal: new THREE.Vector3(0, 0, 1)
};

function gripTexture(){
  const c = document.createElement("canvas"); c.width = 64; c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#2b2b2d"; g.fillRect(0, 0, 64, 256);
  g.strokeStyle = "rgba(255,255,255,.07)"; g.lineWidth = 6;
  for (let y = -64; y < 320; y += 22) { g.beginPath(); g.moveTo(0, y); g.lineTo(64, y + 40); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function buildRacket(){
  const racket = new THREE.Group();
  racket.name = "racket";

  const frameMat = new THREE.MeshPhysicalMaterial({color: 0xf3f3f1, roughness: 0.32, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.25});
  const emberMat = new THREE.MeshPhysicalMaterial({color: 0xff6735, roughness: 0.38, metalness: 0.1, clearcoat: 0.5, clearcoatRoughness: 0.3});
  const gripMat = new THREE.MeshStandardMaterial({map: gripTexture(), roughness: 0.9});
  const capMat = new THREE.MeshStandardMaterial({color: 0x1a1a1a, roughness: 0.6});

  // Head: a tube around the oval, made deeper than it is wide like a real beam.
  const pts = [];
  for (let i = 0; i < 128; i++) {
    const a = i / 128 * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.sin(a) * (HEAD_A - 0.009), HEAD_CENTER + Math.cos(a) * (HEAD_B - 0.009), 0));
  }
  const beamGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 200, 0.0085, 12, true);
  beamGeo.scale(1, 1, 1.35);
  const beam = new THREE.Mesh(beamGeo, frameMat);
  racket.add(beam);

  // Throat: open "Y" from the handle top to the lower head, in orange.
  const throatTop = new THREE.Vector3(0, HANDLE_TOP + 0.03, 0);
  for (const side of [-1, 1]) {
    const x = 0.072 * side;
    const y = HEAD_CENTER - (HEAD_B - 0.009) * Math.sqrt(1 - (x / (HEAD_A - 0.009)) ** 2);
    const curve = new THREE.QuadraticBezierCurve3(throatTop, new THREE.Vector3(0.02 * side, HANDLE_TOP + 0.12, 0), new THREE.Vector3(x, y, 0));
    const arm = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.0085, 10, false), emberMat);
    arm.geometry.scale(1, 1, 1.25);
    racket.add(arm);
  }
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0155, 0.04, 16), emberMat);
  collar.position.y = HANDLE_TOP + 0.012;
  racket.add(collar);

  // Handle: eight-sided grip with a wrap texture, and a butt cap.
  const handleGeo = new THREE.CylinderGeometry(0.0155, 0.0155, HANDLE_TOP - BUTT, 8);
  const handle = new THREE.Mesh(handleGeo, gripMat);
  handle.position.y = (HANDLE_TOP + BUTT) / 2;
  racket.add(handle);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.0165, 0.012, 8), capMat);
  cap.position.y = BUTT;
  racket.add(cap);

  // Strings: 16 mains x 19 crosses clipped to the inner oval.
  const s = [];
  const mains = 16, crosses = 19;
  for (let i = 0; i < mains; i++) {
    const x = (-0.5 + (i + 0.5) / mains) * 2 * BED_A * 0.94;
    const h = BED_B * Math.sqrt(1 - (x / BED_A) ** 2);
    s.push(x, HEAD_CENTER - h, 0, x, HEAD_CENTER + h, 0);
  }
  for (let j = 0; j < crosses; j++) {
    const y = (-0.5 + (j + 0.5) / crosses) * 2 * BED_B * 0.95;
    const w = BED_A * Math.sqrt(1 - (y / BED_B) ** 2);
    s.push(-w, HEAD_CENTER + y, 0, w, HEAD_CENTER + y, 0);
  }
  const stringGeo = new THREE.BufferGeometry();
  stringGeo.setAttribute("position", new THREE.Float32BufferAttribute(s, 3));
  racket.add(new THREE.LineSegments(stringGeo, new THREE.LineBasicMaterial({color: 0xd4d4d4, transparent: true, opacity: 0.75})));

  // A barely-there string bed so the face catches light and casts a soft shadow.
  const bedShape = new THREE.Shape();
  bedShape.absellipse(0, HEAD_CENTER, BED_A + 0.004, BED_B + 0.004, 0, Math.PI * 2);
  const bed = new THREE.Mesh(new THREE.ShapeGeometry(bedShape, 64),
    new THREE.MeshStandardMaterial({color: 0xffffff, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false}));
  racket.add(bed);

  // SWINQ dampener: where the real sensor sits, on the strings just above the throat.
  const damp = new THREE.Mesh(new THREE.CapsuleGeometry(0.0075, 0.016, 4, 12), emberMat);
  damp.rotation.z = Math.PI / 2;
  damp.scale.set(1, 1, 0.75);
  damp.position.set(0, HEAD_CENTER - BED_B + 0.018, 0.002);
  racket.add(damp);

  racket.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  bed.castShadow = false;
  return racket;
}
