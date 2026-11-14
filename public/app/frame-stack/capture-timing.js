// Keep a fixed sampling cadence instead of accumulating camera callback jitter.
export function advanceCaptureTime(now, next, interval) {
  return next + Math.max(1, Math.floor((now - next) / interval) + 1) * interval;
}
