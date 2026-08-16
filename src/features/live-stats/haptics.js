function vibrate(pattern) {
  try {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
      return false;
    }
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

export function hapticTap() {
  return vibrate(12);
}

export function hapticDrop() {
  return vibrate([10, 20, 14]);
}

export function hapticConfirm() {
  return vibrate([16, 28, 20]);
}
