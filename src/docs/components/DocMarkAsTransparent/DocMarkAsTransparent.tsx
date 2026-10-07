import { cloneElement } from "react";

export type DocMarkAsTransparentProps = {
  children: JSX.Element;
};

/*
 * This is a utility made since only headings at top level DOM gets considered
 * during search indexing, but this is not desirable for cases where we want to wrap
 * headings in something like DocAlign. So, we wrap DocAlign in this to mark it as
 * transparent to basically say "I am just a wrapper, I do nothing." This is good
 * semantics for possibly other things that need to work on top level stuff only.
 */
export function DocMarkAsTransparent(props: DocMarkAsTransparentProps) {
  return cloneElement(props.children, { "data-doc-transparent": true });
}
