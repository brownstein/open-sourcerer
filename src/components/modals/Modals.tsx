import cx from "classnames";
import { useCallback, useEffect, useState } from "react";

import { ModalInstanceType } from "src/api/modal";
import { useAppDispatch, useAppSelector } from "src/redux/hooks";
import { selectModalStack } from "src/redux/ui/selectors";
import { closeCurrentModal } from "src/redux/ui/slice";

import { useModalDefs } from "../context/UIRenderingContext";
import "./Modals.css";

type ModalStateSnapshot = {
  modalInstance: ModalInstanceType;
  opening?: boolean;
  openedAt?: number;
  closing?: boolean;
  closedAt?: number;
};

export function Modals() {
  const dispatch = useAppDispatch();
  const modalComponents = useModalDefs();
  const modalStack = useAppSelector(selectModalStack);
  const [currentModalSnapshots, setCurrentModalSnapshots] = useState<
    ModalStateSnapshot[]
  >(
    () =>
      modalStack?.map((modalInstance, zIndex) => ({ modalInstance, zIndex })) ??
      []
  );

  useEffect(() => {
    const now = Date.now();
    let hasDelta = false;
    const replacementModalSnapshots: ModalStateSnapshot[] = [];
    const largerStackLength = Math.max(
      modalStack.length,
      currentModalSnapshots.length
    );
    for (let i = 0; i < largerStackLength; i++) {
      const modalInstance = modalStack.at(i);
      const modalSnapshot = currentModalSnapshots.at(i);
      if (!modalInstance) {
        if (modalSnapshot) {
          if (modalSnapshot.closing) continue;
          hasDelta = true;
          replacementModalSnapshots.push({
            ...modalSnapshot,
            opening: false,
            closing: true,
            closedAt: now
          });
        }
        continue;
      }
      if (!modalSnapshot) {
        hasDelta = true;
        replacementModalSnapshots.push({
          modalInstance,
          opening: true,
          openedAt: now
        });
        continue;
      }
      if (modalInstance !== modalSnapshot.modalInstance) {
        hasDelta = true;
        replacementModalSnapshots.push({
          ...modalSnapshot,
          modalInstance
        });
        continue;
      }
      replacementModalSnapshots.push(modalSnapshot);
    }
    if (hasDelta) setCurrentModalSnapshots(replacementModalSnapshots);
  }, [modalStack, currentModalSnapshots]);

  useEffect(() => {
    const cleanup = () => {
      const now = Date.now();
      setCurrentModalSnapshots((snapshots) => {
        let anyUpdates = false;
        const newSnapshots: typeof snapshots = [];
        for (const snapshot of snapshots) {
          if (snapshot.closing && (snapshot.closedAt ?? 0) <= now - 500) {
            anyUpdates = true;
            continue;
          }
          if (snapshot.opening && (snapshot.openedAt ?? 0) < now - 500) {
            anyUpdates = true;
            newSnapshots.push({
              ...snapshot,
              opening: false,
              openedAt: undefined
            });
            continue;
          }
          newSnapshots.push(snapshot);
        }
        if (anyUpdates) return newSnapshots;
        return snapshots;
      });
    };
    const timeout = setTimeout(cleanup, 600);
    return () => clearTimeout(timeout);
  }, [currentModalSnapshots]);

  const captureClick = useCallback<React.MouseEventHandler>(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      const lastModalConfig = currentModalSnapshots.at(-1);
      if (!lastModalConfig) return;
      if (lastModalConfig.modalInstance.disallowClose) return;
      dispatch(closeCurrentModal());
    },
    [dispatch, currentModalSnapshots]
  );

  if (!currentModalSnapshots?.length) return null;

  return (
    <div className="modal-overlays">
      {currentModalSnapshots.map((s, i) => {
        const ModalComponent = modalComponents[s.modalInstance.modalName]?.component;
        if (!ModalComponent) throw new Error("Missing modal component!");
        return (
          <div
            key={s.modalInstance.id}
            className={cx("modal-overlay", {
              opening: s.opening,
              closing: s.closing
            })}
            style={{ zIndex: i + 1 }}
          >
            <div className="modal-overlay-bg" onClick={captureClick} />
            <ModalComponent
              id={s.modalInstance.id}
              modalName={s.modalInstance.modalName}
              modalArg={s.modalInstance.modalArg}
              opening={s.opening}
              closing={s.closing}
              zIndex={i + 1}
            />
          </div>
        );
      })}
    </div>
  );
}
