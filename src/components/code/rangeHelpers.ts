// Range generator to find DOM Ranges based on numeric start and end offsets withen an HTMLElement.
export function findRange(
  el: HTMLElement,
  start: number,
  end: number
): Range | null {
  let rangeStart: [Node, number] | null = null;
  let rangeEnd: [Node, number] | null = null;
  const _traverse = (
    el: Node,
    startOffset: number,
    endOffset: number
  ): number => {
    if (el.nodeType === Node.TEXT_NODE) {
      const text = el as Text;
      if (startOffset > text.textContent.length) return text.textContent.length;
      if (rangeStart === null) {
        rangeStart = [el as HTMLElement, startOffset];
      }
      if (endOffset <= text.textContent.length) {
        rangeEnd = [el as HTMLElement, endOffset];
        return -1;
      }
      return text.textContent.length;
    }
    let nextStartOffset = startOffset;
    let nextEndOffset = endOffset;
    let totalCharacters = 0;
    for (const child of el.childNodes) {
      const childResult = _traverse(child, nextStartOffset, nextEndOffset);
      if (childResult === -1) return -1;
      nextStartOffset -= childResult;
      nextEndOffset -= childResult;
      totalCharacters += childResult;
    }
    return totalCharacters;
  };
  _traverse(el, start, end);
  if (rangeStart && rangeEnd) {
    const range = new Range();
    range.setStart(rangeStart[0], rangeStart[1]);
    range.setEnd(rangeEnd[0], rangeEnd[1]);
    return range;
  }
  return null;
}

export function findNodeLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node as Text;
    return text.textContent.length;
  }
  let totalLength = 0;
  for (const childNode of node.childNodes) {
    totalLength += findNodeLength(childNode);
  }
  return totalLength;
}

export function findOffsetInParentNode(
  rootNode: Node,
  node: Node,
  offset: number
): number {
  if (node === rootNode) return offset;
  if (!node.parentNode) return offset;
  let cumulativeOffset = 0;
  for (const childNode of node.parentNode.childNodes) {
    if (childNode === node) {
      cumulativeOffset += offset;
      break;
    }
    cumulativeOffset += findNodeLength(childNode);
  }
  return findOffsetInParentNode(rootNode, node.parentNode, cumulativeOffset);
}
