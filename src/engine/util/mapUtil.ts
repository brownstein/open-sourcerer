// Helper to assign map values to an object.
export function assignMapValues<T extends Record<string, boolean>, V>(
  recordIn: T,
  value: V
) {
  const result: Record<string, V> = {};
  for (const key of Object.keys(recordIn)) {
    result[key] = value;
  }
  return result as Partial<Record<keyof T, V>>;
}
