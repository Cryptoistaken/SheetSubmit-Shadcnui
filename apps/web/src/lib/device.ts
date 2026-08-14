export function detectTouch(): boolean {
  if (typeof window === "undefined") return false;
  return navigator.maxTouchPoints > 0 || window.matchMedia?.("(pointer: coarse)").matches || "ontouchstart" in window;
}
export const IS_TOUCH = detectTouch();
export const IS_DESKTOP = !IS_TOUCH;
