import { mdxComponents } from "./mdxComponents";

declare global {
  type MDXProvidedComponents = typeof mdxComponents;
}
