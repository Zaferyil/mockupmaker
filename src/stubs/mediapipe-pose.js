// Stub for @mediapipe/pose.
//
// @tensorflow-models/pose-detection bundles three runtimes: MoveNet (TFJS),
// BlazePose (TFJS) and BlazePose (MediaPipe). Only the MediaPipe one needs this
// package, and it ships a UMD file with no real ESM exports, so the bundler
// fails resolving `Pose` from it even though nothing we call ever touches that
// runtime.
//
// We use MoveNet exclusively — see poseLandmarks.js — so aliasing this to a
// stub removes the dead import instead of shipping an unusable megabyte. If
// BlazePose/MediaPipe is ever wanted, drop the alias in vite.config.js and add
// the real dependency.
export class Pose {
  constructor() {
    throw new Error(
      "@mediapipe/pose is stubbed out: this build uses the MoveNet runtime. " +
        "Remove the alias in vite.config.js to enable BlazePose/MediaPipe.",
    );
  }
}

export const POSE_CONNECTIONS = [];
export const POSE_LANDMARKS = {};
export default { Pose, POSE_CONNECTIONS, POSE_LANDMARKS };
