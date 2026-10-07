import { ReactNode } from "react";

export type DocConditionalWrapperProps = {
  children: ReactNode;
  condition: boolean;
  thenWrapper?: (children: ReactNode) => ReactNode;
  elseWrapper?: (children: ReactNode) => ReactNode;
};

export function DocConditionalWrapper(props: DocConditionalWrapperProps) {
  const thenContent = props.thenWrapper ? (
    <>{props.thenWrapper(props.children)}</>
  ) : (
    <>{props.children}</>
  );

  const elseContent = props.elseWrapper ? (
    <>{props.elseWrapper(props.children)}</>
  ) : (
    <>{props.children}</>
  );

  return props.condition ? thenContent : elseContent;
}
