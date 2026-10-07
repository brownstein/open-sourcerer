// Keyboard ownership for the level editor. The editor and the game viewport
// can be visible side by side, and both listen for keys globally — this module
// decides which of them the user is currently "in". The editor owns the
// keyboard from the moment it mounts until the user clicks outside it (e.g.
// into the game viewport), and reclaims it on any click back inside.

const trackedRoots = new Set<HTMLElement>();
let ownsKeyboard = false;

function onWindowMouseDown(e: MouseEvent) {
  if (!(e.target instanceof Node)) return;
  let inEditor = false;
  for (const root of trackedRoots) {
    if (root.contains(e.target)) {
      inEditor = true;
      break;
    }
  }
  ownsKeyboard = inEditor;
}

/** Register a mounted editor root. Returns an unsubscribe for unmount. */
export function trackEditorKeyboardRoot(root: HTMLElement): () => void {
  if (trackedRoots.size === 0) {
    window.addEventListener("mousedown", onWindowMouseDown, true);
  }
  trackedRoots.add(root);
  ownsKeyboard = true;
  return () => {
    trackedRoots.delete(root);
    if (trackedRoots.size === 0) {
      window.removeEventListener("mousedown", onWindowMouseDown, true);
      ownsKeyboard = false;
    }
  };
}

/** Hand the keyboard to the game (used when Play launches a level). */
export function releaseEditorKeyboard(): void {
  ownsKeyboard = false;
}

/** True when editor shortcuts should respond: the editor was the last thing
 *  clicked and the probe element is actually visible (flexlayout keeps hidden
 *  tabs mounted with display:none, so a window-level listener outlives tab
 *  visibility). */
export function editorOwnsKeyboard(
  visibilityProbe: HTMLElement | null
): boolean {
  return (
    ownsKeyboard && !!visibilityProbe && visibilityProbe.offsetParent !== null
  );
}
