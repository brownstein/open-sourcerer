export function stringFromError(err: unknown) {
  if (err instanceof Error) {
    return err.message;
  }
  return `${err}`;
}
