import {
  OverlayAPI,
  OverlayComponentProps,
  OverlayProviderAPI,
  OverlayProviderEventTypes,
  OverlayProviderEvents,
  OverlaySpecAPI
} from "src/api/overlay";
import { createTypedEventEmitter } from "src/api/util";

import { Overlay } from "./Overlay";

export class OverlayProvider implements OverlayProviderAPI {
  public overlays: OverlayAPI<unknown>[] = [];
  public events = createTypedEventEmitter<OverlayProviderEventTypes>();
  constructor() {
    this.events.setMaxListeners(60);
  }
  renderFrame(ms: number) {
    this.events.emit(OverlayProviderEvents.RenderFrame, ms);
  }
  addOverlay<
    T extends unknown = unknown,
    PT extends OverlayComponentProps<T> = OverlayComponentProps<T>,
    ST extends OverlaySpecAPI<PT> = OverlaySpecAPI<PT>
  >(overlaySpec: ST): OverlayAPI<T, PT, ST> {
    const overlay = new Overlay<T, PT, ST>(overlaySpec, this);
    this.overlays = [...this.overlays];
    this.overlays.push(overlay as unknown as (typeof this.overlays)[number]);
    this.events.emit(OverlayProviderEvents.UpdateOverlays, this.overlays);
    return overlay;
  }
  removeOverlay(overlayId: string) {
    this.overlays = this.overlays.filter((o) => o.id !== overlayId);
    this.events.emit(OverlayProviderEvents.UpdateOverlays, this.overlays);
  }
}
