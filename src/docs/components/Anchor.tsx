import { ReactNode } from "react";

import { DocMarkAsTransparent } from "./DocMarkAsTransparent/DocMarkAsTransparent";

export type AnchorProps = {
  id: string;
  children?: ReactNode;
};

export function Anchor(props: AnchorProps) {
  return (
    <DocMarkAsTransparent>
      <span id={props.id}>{props.children}</span>
    </DocMarkAsTransparent>
  );
}
