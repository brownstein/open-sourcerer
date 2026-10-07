import { useLayoutEffect, useState } from "react";
import { Vector2 } from "three";

import { ItemData } from "src/api/item";
import { OverlayComponentProps, OverlayProviderEvents } from "src/api/overlay";

import { ItemRenderer } from "../../item/ItemRenderer";
import "./ItemPickupJuice.less";

// Items go places... like my cat.
export enum ItemGoingPlaces {
  CodeEditor = "CodeEditor",
  HotBar = "HotBar"
}

export type ItemJuiceOverlayProps = {
  viewportPosRelative: Vector2;
  viewportSizeRelative: Vector2;
  item: ItemData;
  wheresItGoing: ItemGoingPlaces;
  andWhenItGetsThere?: () => void;
};

export type ItemJuiceProps = OverlayComponentProps<ItemJuiceOverlayProps>;

export function ItemPickupJuice(props: ItemJuiceProps) {
  const { overlayProps, api, id } = props;
  const { item } = overlayProps ?? {};
  const [pos, setPos] = useState<Vector2 | null>(null);
  const [size, setSize] = useState<number | null>(null);
  const [opacity, setOpacity] = useState(1);

  useLayoutEffect(() => {
    if (!overlayProps) return;
    const {
      viewportPosRelative,
      viewportSizeRelative,
      wheresItGoing,
      andWhenItGetsThere
    } = overlayProps;

    // This is not ideal, as we *might* want to support mini-viewports
    // in the future, but for now it's fine.
    const viewportRendererDiv =
      document.getElementsByClassName("viewport-renderer")[0];
    if (!viewportRendererDiv) return;

    const viewportBounds = viewportRendererDiv.getBoundingClientRect();
    const viewportSize = new Vector2(
      viewportBounds.width,
      viewportBounds.height
    );
    const viewportOffset = new Vector2(viewportBounds.left, viewportBounds.top);
    const pos = viewportPosRelative
      .clone()
      .multiply(viewportSize)
      .add(viewportOffset);

    const size = viewportSizeRelative.clone().multiply(viewportSize);
    setSize(size.x);
    setPos(pos);

    const onCompleteCallbacks: (() => void)[] = [];
    if (andWhenItGetsThere) onCompleteCallbacks.push(andWhenItGetsThere);

    const targetPos = new Vector2();
    switch (wheresItGoing) {
      // TODO: open the code editor automatically if it's not open yet.
      case ItemGoingPlaces.CodeEditor: {
        const codeEditorDiv = document.getElementById("code-editor-wrapper");
        if (!codeEditorDiv) break;
        const codeEditorRect = codeEditorDiv.getBoundingClientRect();
        if (!codeEditorRect.width) break;
        targetPos.x = codeEditorRect.left + codeEditorRect.width * 0.5;
        targetPos.y = codeEditorRect.top + codeEditorRect.height * 0.5;
        break;
      }
      case ItemGoingPlaces.HotBar: {
        const hotBarDiv = document.querySelector(
          ".viewport-renderer .hotkey-row-container .hotkey-row-item-empty"
        );
        if (!hotBarDiv) break;
        const hotBarRect = hotBarDiv.getBoundingClientRect();
        if (!hotBarRect.width) return;
        targetPos.x = hotBarRect.left + hotBarRect.width * 0.5;
        targetPos.y = hotBarRect.top + hotBarRect.height * 0.5;
        break;
      }
      default:
        break;
    }

    const totalDuration = 500;
    let done = false;

    let t = 0;
    let lastRenderT = 0;
    const renderFrame = (ms: number) => {
      t += ms;
      if (t >= totalDuration) {
        if (!done) {
          for (const doTheThing of onCompleteCallbacks) doTheThing();
          api.events.off(OverlayProviderEvents.RenderFrame, renderFrame);
          api.removeOverlay(id);
          done = true;
        }
        return;
      }
      if (lastRenderT + 10 > t) return;
      lastRenderT = t;
      const progress =
        Math.cos(Math.PI + (Math.PI * t) / totalDuration) * 0.5 + 0.5;
      const newPos = pos.clone().lerp(targetPos, progress);
      setPos(newPos);
      setSize(size.x + size.x * 2 * Math.sin((t * Math.PI) / totalDuration));
      setOpacity(Math.min(1, 1 - (progress - 0.8) * 5));
    };
    api.events.on(OverlayProviderEvents.RenderFrame, renderFrame);
    return () => {
      api.events.off(OverlayProviderEvents.RenderFrame, renderFrame);
    };
  }, [overlayProps, api, id]);

  if (!pos || !size || !item) return null;
  return (
    <div
      className="item-pickup-juice"
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        width: size,
        height: size,
        opacity
      }}
    >
      <ItemRenderer item={item} />
    </div>
  );
}
