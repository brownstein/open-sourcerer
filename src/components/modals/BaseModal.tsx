import cx from "classnames";
import { ReactNode, forwardRef, useCallback } from "react";

import { useAppDispatch } from "src/redux/hooks";
import { closeCurrentModal } from "src/redux/ui/slice";

import { Icon } from "../ui/icons/Icon";
import "./BaseModal.css";

export type BaseModalProps = {
  allowClose?: boolean;
  title?: string;
  children?: ReactNode;
  className?: string;
  size?: "large" | "medium" | "small";
  /** Keep the size's width but let the height shrink to the content, for
   *  confirms and small forms that would otherwise float in empty space. */
  fitContent?: boolean;
  opening?: boolean;
  closing?: boolean;
};

export const BaseModal = forwardRef<HTMLDivElement, BaseModalProps>(
  function _BaseModal(props: BaseModalProps, ref) {
    const {
      allowClose,
      children,
      className,
      size,
      fitContent,
      title,
      opening,
      closing
    } = props;
    const dispatch = useAppDispatch();

    const attemptCloseModal = useCallback(() => {
      if (allowClose === false) return;
      dispatch(closeCurrentModal());
    }, [dispatch, allowClose]);

    return (
      <div
        className={cx("modal-container", size && `modal-${size}`, className, {
          "modal-fit-content": fitContent,
          opening,
          closing
        })}
        ref={ref}
      >
        <div className="modal-container-border" />
        <div className="modal-container-bg" />
        {allowClose !== false && (
          <div className="modal-close-button" onClick={attemptCloseModal}>
            <Icon icon="closeWindow" size="fill" />
          </div>
        )}
        {title && (
          <div className="modal-title">
            <h2>{title}</h2>
          </div>
        )}
        <div className={cx("modal-content", title && "has-title")}>
          {children}
        </div>
      </div>
    );
  }
);
