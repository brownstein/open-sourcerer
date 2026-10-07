export function isPromise<T = unknown>(value: unknown): value is Promise<T> {
  if (!value) return false;
  if (typeof value === "object" && (value as Promise<T>).then) return true;
  return false;
}
