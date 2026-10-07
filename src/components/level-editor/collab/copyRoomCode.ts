export async function copyRoomCode(code: string): Promise<boolean> {
  // Insecure origins (http on a LAN) have no clipboard API at all.
  if (!navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(code);
    return true;
  } catch {
    return false;
  }
}
