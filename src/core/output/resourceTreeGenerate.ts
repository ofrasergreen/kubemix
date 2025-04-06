import path from 'node:path'; // Keep for potential future use with nested resources

/**
 * Generates a hierarchical string representation of the cluster resource tree,
 * showing namespaces and multiple resource types within each namespace.
 *
 * @param namespaces - An array of namespace names.
 * @param resourcesByNamespace - A record mapping namespace names to records of resource kinds and their names.
 * @returns A string representing the hierarchical resource tree.
 */
export const generateResourceTreeString = (
  namespaces: string[],
  resourcesByNamespace?: Record<string, Record<string, string[]>> | Record<string, string[]>,
): string => {
  if (!namespaces || namespaces.length === 0) {
    return '(No namespaces found or retrieved)';
  }

  // Sorting alphabetically for consistent output.
  const sortedNamespaces = [...namespaces].sort((a, b) => a.localeCompare(b));

  // If no resources data is provided, fall back to a simple namespace list
  if (!resourcesByNamespace) {
    return sortedNamespaces.join('\n');
  }

  // Handle legacy podsByNamespace format for backward compatibility
  // If the first value for the first namespace is an array, it's the old format
  const isLegacyFormat =
    Object.keys(resourcesByNamespace).length > 0 && Array.isArray(Object.values(resourcesByNamespace)[0]);

  if (isLegacyFormat) {
    // Convert legacy format to new format (assuming it's all pods)
    const podsByNamespace = resourcesByNamespace as Record<string, string[]>;
    const newFormat: Record<string, Record<string, string[]>> = {};

    for (const [namespace, pods] of Object.entries(podsByNamespace)) {
      newFormat[namespace] = { pods };
    }

    resourcesByNamespace = newFormat;
  }

  // Now resourcesByNamespace is in the new format
  const typedResourcesByNamespace = resourcesByNamespace as Record<string, Record<string, string[]>>;

  // Build the hierarchical tree with resources under namespaces
  const treeLines: string[] = [];

  // Define a consistent order for resource kinds for improved readability
  const resourceKindDisplayOrder = [
    'configmaps',
    'deployments',
    'pods',
    'secrets',
    'services',
    // Add more kinds here as needed in the desired order
  ];

  for (const namespace of sortedNamespaces) {
    // Add the namespace as a top-level item
    treeLines.push(namespace);

    // Get resources for this namespace
    const namespaceResources = typedResourcesByNamespace[namespace] || {};

    // Determine which resource kinds exist in this namespace
    const existingKinds = Object.keys(namespaceResources).filter(
      (kind) => Array.isArray(namespaceResources[kind]) && namespaceResources[kind].length > 0,
    );

    if (existingKinds.length === 0) {
      // If no resources found for this namespace, add an empty entry
      continue;
    }

    // Sort resource kinds based on the predefined order and then alphabetically for any not in the predefined list
    const sortedKinds = existingKinds.sort((a, b) => {
      const indexA = resourceKindDisplayOrder.indexOf(a);
      const indexB = resourceKindDisplayOrder.indexOf(b);

      // If both are in the order list, use that order
      if (indexA >= 0 && indexB >= 0) {
        return indexA - indexB;
      }

      // If only one is in the order list, prioritize it
      if (indexA >= 0) return -1;
      if (indexB >= 0) return 1;

      // Otherwise, sort alphabetically
      return a.localeCompare(b);
    });

    // Add each resource kind and its resources
    for (const kind of sortedKinds) {
      const resources = namespaceResources[kind] || [];

      if (resources.length > 0) {
        // Sort resources alphabetically
        const sortedResources = [...resources].sort((a, b) => a.localeCompare(b));

        // Add kind header with proper indentation
        treeLines.push(`  ${kind}:`);

        // Add each resource with indentation
        for (const resource of sortedResources) {
          treeLines.push(`    ${resource}`);
        }
      } else {
        // For kinds with no resources (shouldn't happen given our filter above)
        treeLines.push(`  ${kind}:  # none`);
      }
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
 *
 * @param namespaces - An array of namespace names.
 * @param resourcesByNamespace - A record mapping namespace names to records of resource kinds and their names.
 * @returns A TreeNode representing the hierarchical structure.
 */
export const generateTreeStructure = (
  namespaces: string[],
  resourcesByNamespace: Record<string, Record<string, string[]>>,
): TreeNode => {
  const root: TreeNode = createTreeNode('cluster', 'Cluster');
  const sortedNamespaces = [...namespaces].sort((a, b) => a.localeCompare(b));

  for (const namespace of sortedNamespaces) {
    const namespaceNode = createTreeNode(namespace, 'Namespace');
    const resources = resourcesByNamespace[namespace] || {};

    // Sort the resource kinds alphabetically
    const resourceKinds = Object.keys(resources).sort();

    for (const kind of resourceKinds) {
      // Skip empty resource arrays
      if (!resources[kind] || resources[kind].length === 0) {
        continue;
      }

      // Create a container node for this resource kind
      const kindNode = createTreeNode(kind, 'ResourceKind');

      // Sort resources alphabetically
      const sortedResources = [...resources[kind]].sort((a, b) => a.localeCompare(b));

      // Add each resource as a child of the kind node
      for (const resource of sortedResources) {
        const resourceNode = createTreeNode(resource, kind);
        kindNode.children.push(resourceNode);
      }

      // Add the kind node to the namespace
      namespaceNode.children.push(kindNode);
    }

    // Add the namespace to the root
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
      // Handle namespace children (resource kinds)
      for (const kindNode of node.children) {
        result += `${childPrefix}${kindNode.name}:\n`;

        // Add resources under this kind
        for (const resourceNode of kindNode.children) {
          result += `${childPrefix}  ${resourceNode.name}\n`;
        }
      }
    } else if (node.kind === 'ResourceKind') {
      // This case should not be directly encountered in treeToString calls
      // But include it for completeness
      for (const resourceNode of node.children) {
        result += `${childPrefix}  ${resourceNode.name}\n`;
      }
    } else {
      // Handle other node types recursively
      for (const child of node.children) {
        result += treeToString(child, childPrefix);
      }
    }
  } else if (node.kind === 'Namespace') {
    // For namespaces with no resources, don't add anything extra
  } else if (node.kind === 'ResourceKind') {
    // For resource kinds with no resources
    result += `${prefix}  # none\n`;
  }

  return result;
};
