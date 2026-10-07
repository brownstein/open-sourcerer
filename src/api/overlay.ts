import { ComponentType } from "react";
import { Vector2 } from "three";

import { TypedEventEmitter } from "src/api/util";

export enum OverlayPosition {
  Screen = "Screen",
  Viewport = "Viewport",
  ViewportBottom = "ViewportBottom"
}

export type OverlayComponentProps<T> = {
  api: OverlayProviderAPI;
  id: string;
  screenSize: Vector2;
  overlayProps: T;
};

export type OverlaySpecAPI<T extends OverlayComponentProps<unknown>> = {
  component: ComponentType<T>;
  position: OverlayPosition;
  overlayProps: T["overlayProps"];
};

export type OverlayAPI<
  T extends unknown,
  PT extends OverlayComponentProps<T> = OverlayComponentProps<T>,
  ST extends OverlaySpecAPI<PT> = OverlaySpecAPI<PT>
> = {
  id: string;
  spec: ST;
  remove: () => void;
};

export enum OverlayProviderEvents {
  UpdateOverlays = "UpdateOverlays",
  RenderFrame = "RenderFrame"
}

export type OverlayProviderEventTypes = {
  [OverlayProviderEvents.UpdateOverlays]: OverlayAPI<any>[];
  [OverlayProviderEvents.RenderFrame]: number;
};

export type OverlayProviderAPI = {
  readonly events: TypedEventEmitter<OverlayProviderEventTypes>;
  readonly overlays: OverlayAPI<unknown>[];
  addOverlay: <
    T extends unknown,
    PT extends OverlayComponentProps<T> = OverlayComponentProps<T>,
    ST extends OverlaySpecAPI<PT> = OverlaySpecAPI<PT>
  >(
    overlaySpec: ST
  ) => OverlayAPI<T, PT, ST>;
  removeOverlay: (overlayId: string) => void;
};
