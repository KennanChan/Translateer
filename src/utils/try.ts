export function retry<T>(fn: () => T, times = 3): T {
  try {
    return fn();
  } catch (e) {
    if (times <= 1) {
      throw e;
    }
    return retry(fn, times - 1);
  }
}
