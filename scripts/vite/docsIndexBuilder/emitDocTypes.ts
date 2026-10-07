import fs from "fs";
import path from "path";

export type DocAnchorMapping = {
  docId: string;
  anchorIds: string[];
};

function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function emitDocTypes(
  outputPath: string,
  allDocIds: string[],
  allLocaleCodes: string[],
  anchorMappings: DocAnchorMapping[]
): void {
  const docIdUnion =
    allDocIds.length === 0
      ? "  never"
      : allDocIds.map((id) => `  | ${quote(id)}`).join("\n");

  const anchorByDocId = new Map<string, string[]>();
  for (const id of allDocIds) anchorByDocId.set(id, []);
  for (const { docId, anchorIds } of anchorMappings) {
    const existing = anchorByDocId.get(docId);
    if (!existing) continue;
    const merged = Array.from(new Set([...existing, ...anchorIds])).sort();
    anchorByDocId.set(docId, merged);
  }

  const anchorMapBody = allDocIds
    .map((id) => {
      const anchors = anchorByDocId.get(id) ?? [];
      const union =
        anchors.length === 0 ? "never" : anchors.map(quote).join(" | ");
      return `  ${quote(id)}: ${union};`;
    })
    .join("\n");

  const localeUnion =
    allLocaleCodes.length === 0
      ? "  never"
      : allLocaleCodes.map((code) => `  | ${quote(code)}`).join("\n");

  const content = `// AUTO-GENERATED. Do not edit by hand.
// Source: scripts/vite/docsIndexBuilder

export type DocId =
${docIdUnion};

type DocAnchorMap = {
${anchorMapBody}
};

export type DocAnchor<T extends DocId> = DocAnchorMap[T];

export type LocaleCode =
${localeUnion};
`;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, "utf8");
}
