import {
  Children,
  PropsWithChildren,
  ReactElement,
  ReactNode,
  useMemo
} from "react";

export const DocThen = ({ children }: PropsWithChildren) => <>{children}</>;
export const DocElse = ({ children }: PropsWithChildren) => <>{children}</>;

export type DocIfProps = {
  condition: boolean;
  children: ReactNode;
};

export function DocIf(props: DocIfProps) {
  const childrenArray = useMemo(
    () => Children.toArray(props.children),
    [props.children]
  );

  const thenBranch = useMemo(
    () =>
      childrenArray.find((child) => (child as ReactElement)?.type === DocThen),
    [childrenArray]
  );

  const elseBranch = useMemo(
    () =>
      childrenArray.find((child) => (child as ReactElement)?.type === DocElse),
    [childrenArray]
  );

  return props.condition ? <>{thenBranch}</> : <>{elseBranch}</>;
}
