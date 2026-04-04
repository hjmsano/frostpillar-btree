import {
  isLeafNode,
  type BTreeNode,
  type BTreeState,
  type BTreeStats,
} from './types.js';

interface NodeStats {
  height: number;
  leafCount: number;
  branchCount: number;
}

const collectStats = <TKey, TValue>(
  node: BTreeNode<TKey, TValue>,
): NodeStats => {
  if (isLeafNode(node)) {
    return {
      height: 1,
      leafCount: 1,
      branchCount: 0,
    };
  }

  let maxChildHeight = 0;
  let leafCount = 0;
  let branchCount = 1;

  for (let ci = node.childOffset; ci < node.children.length; ci += 1) {
    const child = node.children[ci];
    const childStats = collectStats(child);
    if (childStats.height > maxChildHeight) {
      maxChildHeight = childStats.height;
    }
    leafCount += childStats.leafCount;
    branchCount += childStats.branchCount;
  }

  return {
    height: maxChildHeight + 1,
    leafCount,
    branchCount,
  };
};

export const getStats = <TKey, TValue>(
  state: BTreeState<TKey, TValue>,
): BTreeStats => {
  const stats = collectStats(state.root);
  return {
    height: stats.height,
    leafCount: stats.leafCount,
    branchCount: stats.branchCount,
    entryCount: state.entryCount,
  };
};
