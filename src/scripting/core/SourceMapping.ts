import { File as BabelFile } from "@babel/types";
import * as acorn from "acorn";
import * as vlq from "vlq";

import { buildSourceLocationMap, traverseAST } from "./util";

export type SourceMap = {
  mappings: string;
};

export type ASTPosition = {
  line: number;
  column: number;
};

export type ASTNode = {
  loc?: {
    start: ASTPosition;
    end: ASTPosition;
  } | null;
  type: string;
  start: number;
  end: number;
};

type LineMap = {
  destCol: number;
  sourceCol: number;
  sourceLine: number;
};

type LineColumn = {
  line: number;
  column: number;
};

const zeroLocation = {
  line: 0,
  column: 0
};

// Matches AST nodes by location.
export class ASTLocationMap {
  private nodesByLine: Record<number, ASTNode[]> = {};
  addNode(node: ASTNode) {
    if (!node.loc) return;
    const { start, end } = node.loc;
    for (let line = start.line; line <= end.line; line++) {
      if (this.nodesByLine[line] === undefined) this.nodesByLine[line] = [];
      this.nodesByLine[line].push(node);
    }
  }
  matchNode(node: ASTNode, sourceStartLine: number, sourceStartCol: number) {
    let leastDistance = Infinity;
    let closestNode: ASTNode | null = null;
    const lineNodes = this.nodesByLine[sourceStartLine];
    if (lineNodes === undefined || lineNodes.length === 0) return null;
    for (const lineNode of lineNodes) {
      const nodeDistance = this.getNodeDistance(
        node,
        lineNode,
        sourceStartLine,
        sourceStartCol
      );
      if (nodeDistance <= leastDistance) {
        leastDistance = nodeDistance;
        closestNode = lineNode;
      }
    }
    return closestNode;
  }
  private getNodeDistance(
    destNode: ASTNode,
    srcNode: ASTNode,
    srcStartLine: number,
    srcStartCol: number
  ) {
    const srcNodeStartLine = srcNode.loc?.start.line ?? 0;
    const srcNodeStartCol = srcNode.loc?.start.column ?? 0;
    return (
      Math.abs(srcStartLine - srcNodeStartLine) +
      Math.abs(srcStartCol - srcNodeStartCol) +
      (destNode.type === srcNode.type ? 0 : 10)
    );
  }
  debug() {
    const result = [];
    for (const [line, nodes] of Object.entries(this.nodesByLine)) {
      result.push([line, ...nodes.map((node) => node.type)]);
    }
    return result;
  }
}

// Maps token locations between source transpiled code and source code.
export class TranspilationMap {
  private tokensByDestStartIndex: Record<number, number[][]> = {};
  addToken(
    srcStart: number,
    srcEnd: number,
    destStart: number,
    destEnd: number
  ) {
    let tokensAtIndex = this.tokensByDestStartIndex[destStart];
    if (tokensAtIndex === undefined) {
      tokensAtIndex = [];
      this.tokensByDestStartIndex[destStart] = tokensAtIndex;
    }
    tokensAtIndex.push([destEnd, srcStart, srcEnd]);
  }
  getSourceLocation(
    destStart: number,
    destEnd: number
  ): [number | null, number | null] {
    const tokensAtIndex = this.tokensByDestStartIndex[destStart];
    if (tokensAtIndex === undefined) {
      return [null, null];
    }
    for (let ti = 0; ti < tokensAtIndex.length; ti++) {
      const [tokenDestEnd, tokenSrcStart, tokenSrcEnd] = tokensAtIndex[ti];
      if (tokenDestEnd === destEnd) {
        return [tokenSrcStart, tokenSrcEnd];
      }
    }
    return [null, null];
  }
}

// Decodes source maps in their standardd VLQ-based encoding.
export class SourceMapDecoder {
  private mapsByLine: Record<number, LineMap[]> = {};
  constructor(sourceMap: SourceMap) {
    let sourceLine = 1;
    let sourceCol = 0;
    let destLine = 1;
    for (const encodedLine of sourceMap.mappings.split(";")) {
      this.mapsByLine[destLine] = [];
      let destCol = 0;
      for (const part of encodedLine.split(",")) {
        // Empty parts should have zeroed cols but matched lines.
        if (part === "") {
          this.mapsByLine[destLine].push({
            destCol: 0,
            sourceCol: 0,
            sourceLine
          });
          continue;
        }
        const [destColIncr, _sourceFile, sourceLineIncr, sourceColIncr] =
          vlq.decode(part);
        destCol += destColIncr ?? 0;
        sourceLine += sourceLineIncr ?? 0;
        sourceCol += sourceColIncr ?? 0;
        this.mapsByLine[destLine].push({
          destCol,
          sourceLine,
          sourceCol
        });
      }
      destLine++;
    }
  }
  getSourceLocation({ line, column }: LineColumn): LineColumn {
    const lineMap = this.mapsByLine[line];
    if (lineMap === undefined) return zeroLocation;
    let lastSourceLine = 0;
    let lastSourceCol = 0;
    for (const map of lineMap) {
      const { destCol, sourceLine, sourceCol } = map;
      if (destCol >= column)
        return {
          line: sourceLine ?? 0,
          column: sourceCol ?? 0
        };
      lastSourceLine = sourceLine ?? 0;
      lastSourceCol = sourceCol ?? 0;
    }
    return {
      line: lastSourceLine,
      column: lastSourceCol
    };
  }
}

// This encapsulating class handles all mapping between transpiled code locations and
// source lines / locs.
export class SourceMapping {
  private sourceLocationMap: number[];
  private sourceMapDecoder: SourceMapDecoder;
  private transpilationMap: TranspilationMap;
  constructor(
    sourceCode: string,
    babelAST: BabelFile,
    babelSourceMap: SourceMap,
    transpiledAST: acorn.Program
  ) {
    this.sourceLocationMap = buildSourceLocationMap(sourceCode);
    this.transpilationMap = new TranspilationMap();

    // Decode source map.
    const sourceMapper = new SourceMapDecoder(babelSourceMap);
    this.sourceMapDecoder = sourceMapper;

    // Map the source code's AST.
    const rawASTMap = new ASTLocationMap();
    traverseAST(babelAST, (node) => {
      rawASTMap.addNode(node as ASTNode);
    });

    // Configure transpilation map based on transpiled AST node matching.
    traverseAST(transpiledAST, (node) => {
      const nodeAsASTNode = node as ASTNode;
      if (nodeAsASTNode.loc?.start === undefined) return;
      const rawASTLoc = sourceMapper.getSourceLocation(nodeAsASTNode.loc.start);
      const matchedSourceNode = rawASTMap.matchNode(
        nodeAsASTNode,
        rawASTLoc.line,
        rawASTLoc.column
      );
      if (!matchedSourceNode) return;
      this.transpilationMap.addToken(
        matchedSourceNode.start,
        matchedSourceNode.end,
        nodeAsASTNode.start,
        nodeAsASTNode.end
      );
    });
  }
  getLocation(
    transpiledCodeStart: number,
    transpiledCodeEnd: number
  ): [number | null, number | null] {
    const sourceLocation = this.transpilationMap.getSourceLocation(
      transpiledCodeStart,
      transpiledCodeEnd
    );
    return sourceLocation;
  }
  getLine(
    transpiledCodeStart: number,
    transpiledCodeEnd: number
  ): number | null {
    const sourceLocation = this.transpilationMap.getSourceLocation(
      transpiledCodeStart,
      transpiledCodeEnd
    );
    const sourceStart = sourceLocation[0];
    if (sourceStart === null) return null;
    return this.sourceLocationMap[sourceStart];
  }
  getSourceLocation(line: number, column: number) {
    return this.sourceMapDecoder.getSourceLocation({ line, column });
  }
}
