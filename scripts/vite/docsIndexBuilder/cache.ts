import type { DocIndexChunk } from "../../../src/api/docs";

export type CachedDocBuild = {
  anchorIds: string[];
  chunks: DocIndexChunk[];
};

export class DocBuildCache {
  private byKey = new Map<string, CachedDocBuild>();

  private keyFor(locale: string, docId: string): string {
    return `${locale}:${docId}`;
  }

  get(locale: string, docId: string): CachedDocBuild | undefined {
    return this.byKey.get(this.keyFor(locale, docId));
  }

  set(locale: string, docId: string, value: CachedDocBuild): void {
    this.byKey.set(this.keyFor(locale, docId), value);
  }

  invalidate(locale: string, docId: string): void {
    this.byKey.delete(this.keyFor(locale, docId));
  }

  clear(): void {
    this.byKey.clear();
  }

  keys(): IterableIterator<string> {
    return this.byKey.keys();
  }

  deleteByKey(key: string): void {
    this.byKey.delete(key);
  }
}
