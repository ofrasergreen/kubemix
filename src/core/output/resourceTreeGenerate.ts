import path from 'node:path'; // Keep for potential future use with nested resources

// Updated tree generation for namespaces and pods.

/**
 * Generates a hierarchical string representation of the cluster resource tree,
 * showing namespaces and pods within each namespace.
 *
 * @param namespaces - An array of namespace names.
 * @param podsByNamespace - A record mapping namespace names to arrays of pod names.
 * @returns A string representing the hierarchical resource tree.
 */
export const generateResourceTreeString = (
  namespaces: string[],
  podsByNamespace?: Record<string, string[]>,
): string => {
  if (!namespaces || namespaces.length === 0) {
    return '(No namespaces found or retrieved)';
  }

  // Sorting alphabetically for consistent output.
  const sortedNamespaces = [...namespaces].sort((a, b) => a.localeCompare(b));

  // If no pods data is provided, fall back to the old behavior
  if (!podsByNamespace) {
    return sortedNamespaces.join('\n');
  }

  // Build the hierarchical tree with pods under namespaces
  const treeLines: string[] = [];

  for (const namespace of sortedNamespaces) {
    // Add the namespace as a top-level item
    treeLines.push(namespace);

    // Add pods section for this namespace
    const pods = podsByNamespace[namespace] || [];
    if (pods.length > 0) {
      // Sort pods alphabetically
      const sortedPods = [...pods].sort((a, b) => a.localeCompare(b));

      // Add pods header
      treeLines.push('  pods:');

      // Add each pod with indentation
      for (const pod of sortedPods) {
        treeLines.push(`    ${pod}`);
      }
    } else {
      // For namespaces with no pods, show empty pods section
      treeLines.push('  pods:  # none');
    }
  }

  return treeLines.join('\n');
};

// Placeholder for potential future tree structure
interface TreeNode {
  name: string;
  kind: string; // e.g., 'Namespace', 'Pod', 'Service'
  children: TreeNode[];
}

const createTreeNode = (name: string, kind: string): TreeNode => ({ name, kind, children: [] });

/**
 * Alternative implementation using a tree data structure.
 * This provides more flexibility for future extensions.
 */
export const generateTreeStructure = (namespaces: string[], podsByNamespace: Record<string, string[]>): TreeNode => {
  const root: TreeNode = createTreeNode('cluster', 'Cluster');
  const sortedNamespaces = [...namespaces].sort((a, b) => a.localeCompare(b));

  for (const namespace of sortedNamespaces) {
    const namespaceNode = createTreeNode(namespace, 'Namespace');

    // Add pods for this namespace
    const pods = podsByNamespace[namespace] || [];
    const sortedPods = [...pods].sort((a, b) => a.localeCompare(b));

    for (const pod of sortedPods) {
      const podNode = createTreeNode(pod, 'Pod');
      namespaceNode.children.push(podNode);
    }

    root.children.push(namespaceNode);
  }

  return root;
};

/**
 * Converts a tree node structure to a string representation.
 * Currently not used, but included for future reference.
 */
const treeToString = (node: TreeNode, prefix = ''): string => {
  let result = '';

  if (node.kind !== 'Cluster') {
    // Skip the root node
    result += `${prefix}${node.name}\n`;
  }

  if (node.children.length > 0) {
    const childPrefix = node.kind === 'Cluster' ? '' : `${prefix}  `;

    if (node.kind === 'Namespace') {
      result += `${childPrefix}pods:\n`;
      for (const child of node.children) {
        result += `${childPrefix}  ${child.name}\n`;
      }
    } else {
      for (const child of node.children) {
        result += treeToString(child, childPrefix);
      }
    }
  } else if (node.kind === 'Namespace') {
    // For namespaces with no pods
    result += `${prefix}  pods:  # none\n`;
  }

  return result;
};
