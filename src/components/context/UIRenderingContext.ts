import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { ModalDefinitionType } from "src/api/modal";
import { TypedEventEmitter, createTypedEventEmitter } from "src/api/util";
import { modalsRegistry } from "src/components/modals/allModals";
import { UIComponentType, UIEventTypes } from "src/components/ui/config/types";
import { tabComponentRegistry } from "src/components/ui/root/componentRegistry";

export type UIRenderContext = {
  events: TypedEventEmitter<UIEventTypes>;
  components: typeof tabComponentRegistry;
  modals: typeof modalsRegistry;
};

const uiRenderContextDefault: UIRenderContext = {
  events: createTypedEventEmitter<UIEventTypes>(),
  components: tabComponentRegistry,
  modals: modalsRegistry
};
uiRenderContextDefault.events.setMaxListeners(999);

export const UIRenderingContext = createContext<UIRenderContext>(
  uiRenderContextDefault
);

export function useTabComponenents() {
  const [version, setVersion] = useState(1);
  const ctx = useContext(UIRenderingContext);
  useEffect(() => {
    const onComponentsUpdated = () => setVersion((v) => v + 1);
    ctx.events.on("componentsUpdated", onComponentsUpdated);
    return () => {
      ctx.events.off("componentsUpdated", onComponentsUpdated);
    };
  }, [ctx]);
  return useMemo<Record<string, UIComponentType>>(() => {
    return Object.fromEntries(
      ctx.components
        .keys()
        .map((k) => [k, ctx.components.get(k) as UIComponentType])
    );
  }, [ctx, version]);
}

export function useModalDefs() {
  const [version, setVersion] = useState(1);
  const ctx = useContext(UIRenderingContext);
  useEffect(() => {
    const onComponentsUpdated = () => setVersion((v) => v + 1);
    ctx.events.on("componentsUpdated", onComponentsUpdated);
    modalsRegistry.events.on("reload", onComponentsUpdated);
    return () => {
      ctx.events.off("componentsUpdated", onComponentsUpdated);
      modalsRegistry.events.off("reload", onComponentsUpdated);
    };
  }, [ctx]);
  return useMemo<Record<string, ModalDefinitionType>>(() => {
    return Object.fromEntries(
      ctx.modals
        .keys()
        .map((k) => [k, ctx.modals.get(k) as ModalDefinitionType])
    );
  }, [ctx, version]);
}

// Force components update event to be emitted on hot reload.
import.meta.hot?.accept(
  [
    "src/components/ui/root/componentRegistry",
    "src/components/modals/allModals"
  ],
  ([componentsMod, modalsMod]) => {
    if (componentsMod)
      uiRenderContextDefault.components = componentsMod.tabComponentRegistry;
    if (modalsMod) uiRenderContextDefault.modals = modalsMod.modalsRegistry;
    uiRenderContextDefault.events.emit("componentsUpdated");
  }
);
