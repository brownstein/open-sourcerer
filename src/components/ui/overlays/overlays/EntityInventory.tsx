import { Button } from "@mui/material";
import cx from "classnames";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { BaseEntityType } from "src/api/entity";
import { ItemData } from "src/api/item";
import { OverlayComponentProps } from "src/api/overlay";
import { DeferredEmitter } from "src/engine/util/deferredEmitter";

import { ItemRenderer } from "../../item/ItemRenderer";
import "./EntityInventory.less";
import { PositionedOverlay } from "./PositionedOverlay";

export type EntityInventoryOverlayProps = {
  entity: BaseEntityType;
  items: ItemData[];
  deferredPickupEmitter: DeferredEmitter;
};

export type EntityInventoryProps =
  OverlayComponentProps<EntityInventoryOverlayProps>;

export function EntityInventory(props: EntityInventoryProps) {
  const { overlayProps, screenSize } = props;
  const { entity, items = [], deferredPickupEmitter } = overlayProps ?? {};

  const { t } = useTranslation();

  const position = entity.position.clone();
  position.y += entity.size.height * 0.5 + 0.5;

  const [goingAway, setGoingAway] = useState(false);
  const takeAll = useCallback(() => {
    setGoingAway(true);
    deferredPickupEmitter.emit("done");
  }, [deferredPickupEmitter]);

  return (
    <PositionedOverlay
      position={position}
      screenSize={screenSize}
      verticalAlign="bottom"
    >
      <div className={cx("entity-inventory", goingAway && "going-away")}>
        <h3>{t("inventory.inventoryPopover")}</h3>
        <div className="entity-inventory-grid">
          {items.map((item, index) => (
            <ItemRenderer
              item={item}
              key={index}
              className="entity-inventory-item"
            />
          ))}
        </div>
        <div className="actions">
          <Button disabled={goingAway} variant="contained" onClick={takeAll}>
            {t("inventory.takeAll")}
          </Button>
        </div>
      </div>
    </PositionedOverlay>
  );
}
