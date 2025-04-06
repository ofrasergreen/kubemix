// Default namespaces and resource types to ignore during aggregation.
// Users can override these via configuration file or CLI options.

export const defaultIgnoredNamespaces = [
  'kube-system',
  'kube-public',
  'kube-node-lease',
  // Add other common system/operator namespaces if desired
  // 'cert-manager',
  // 'istio-system',
];

export const defaultIgnoredResourceTypes = [
  // Often very numerous and less relevant for general overview
  'events',
  'events.k8s.io',
  // Potentially secrets, depending on the tool's purpose and redaction capabilities
  // 'secrets', // Consider adding if redaction isn't robust initially
  // ControllerRevisions often clutter the output
  'controllerrevisions.apps',
  // EndpointSlices can be very verbose
  'endpointslices.discovery.k8s.io',
];

// Combine into a structure usable by the filter logic
export const defaultFilters = {
  excludeNamespaces: defaultIgnoredNamespaces,
  excludeResourceTypes: defaultIgnoredResourceTypes,
};
