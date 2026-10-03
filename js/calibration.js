// Saved calibration: how the sensor sits on the racket and where it pointed at reading 0.
// Found by the automatic fit to five moments in both videos (js/calibrate.js).
// Average handle-direction error vs. video: 30° (Start 47°, Drop 18°, Contact 37°, Extension 24°, Finish 23°).
// The mounting it picked (handle along −x) matches the accelerometer: +x reads the +16 g pull toward the hand.
// Set to null to re-run the automatic fit on every load.
export const CALIBRATION = {
  mountIndex: 7,
  mount: "handle −x · face −z",
  q0: [-0.335912, 0.924096, 0.17017, -0.065208]   // [x, y, z, w]
};
