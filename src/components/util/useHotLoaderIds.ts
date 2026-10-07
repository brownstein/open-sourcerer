import { useEffect, useState } from "react";

import { GenericHotLoaderAPI, HotLoaderEvents } from "src/api/hotLoader";

/** Live list of ids in a hot loader. Re-derives the full id list on add AND
 *  remove, so deletes and renames propagate (rather than the append-only
 *  cache pattern that goes stale on removal). */
export function useHotLoaderIds<T>(loader: GenericHotLoaderAPI<T>): string[] {
  const [ids, setIds] = useState(() => loader.getIds());

  useEffect(() => {
    const reread = () => setIds(loader.getIds());
    // Catch any change between the initial render and listener attachment.
    reread();
    loader.events.on(HotLoaderEvents.IdsAdded, reread);
    loader.events.on(HotLoaderEvents.IdsRemoved, reread);
    return () => {
      loader.events.off(HotLoaderEvents.IdsAdded, reread);
      loader.events.off(HotLoaderEvents.IdsRemoved, reread);
    };
  }, [loader]);

  return ids;
}
