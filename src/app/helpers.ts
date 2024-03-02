export function uniqueId(prefix?: string): string {
  const dateString = Date.now().toString(36);
  const randomness = Math.random().toString(36).substring(2);
  return (prefix ? `${prefix}-` : "") + dateString + randomness;
}

export function isEqual(x, y) {
  const ok = Object.keys,
    tx = typeof x,
    ty = typeof y;
  return x && y && tx === "object" && tx === ty
    ? ok(x).length === ok(y).length &&
        ok(x).every((key) => isEqual(x[key], y[key]))
    : x === y;
}
