# Feature: Fetch Multiple Resource Types per Namespace

**Description:**

Modify the core fetching logic to retrieve a predefined set of common resource types (Pods, Services, Deployments, ConfigMaps, Secrets) for *each* namespace using fewer `kubectl` calls per namespace. Update the "Cluster Resource Overview" tree and the main "Resources" section to reflect these newly fetched types.

This replaces the previous approach of fetching *only* Pods individually per namespace and aims for slightly better efficiency per namespace while gathering more comprehensive data. The initial fetch of all namespaces remains.

**Target Resource Types:**

*   Namespaces (already fetched globally)
*   Pods
*   Services
*   Deployments
*   ConfigMaps
*   Secrets

**Acceptance Criteria:**

1.  The `kubemix` command executes successfully.
2.  The tool first fetches all namespace names (using `getNamespaceNames`).
3.  The tool then iterates through the discovered namespaces (respecting any configured exclusions).
4.  For *each* relevant namespace, the tool executes `kubectl get pods,services,deployments,configmaps,secrets -n <namespace> -o name` to get resource names for the tree.
5.  For *each* relevant namespace, the tool executes `kubectl get pods,services,deployments,configmaps,secrets -n <namespace> -o yaml` to get the combined YAML output.
6.  The Markdown output file (e.g., `kubemix-output.md`) is generated.
7.  The "Cluster Resource Overview" section is updated to show namespaces, with discovered pods, services, deployments, configmaps, and secrets listed and indented underneath, grouped by kind (see example below).
8.  The "Resources" section contains:
    *   The original block for `Resource: Namespaces`.
    *   *One* subsequent block *per namespace* that contains fetched resources, formatted as:
        *   Heading: `## Resources in Namespace: <namespace-name>`
        *   Command block showing: `kubectl get pods,services,deployments,configmaps,secrets -n <namespace-name> -o yaml`
        *   YAML code block containing the *full multi-document YAML output* from that command.
9.  Namespaces without any of the target resource types should still appear in the Resource Overview tree but might not generate a "Resources in Namespace" block (or generate one with empty YAML).
10. Error handling: Failures fetching resources for one namespace should be logged but should not stop the processing of other namespaces.

**Example Updated Resource Overview Format:**

```
# Cluster Resource Overview
```
default
  configmaps:
    kube-root-ca.crt
  pods:
    app-pod-xyz
  secrets:
    default-token-abc
  services:
    kubernetes
kube-system
  configmaps:
    coredns
    extension-apiserver-authentication
    ...
  deployments:
    coredns
  pods:
    coredns-123
    etcd-master
    ...
  secrets:
    coredns-token-456
    ...
  services:
    kube-dns
my-app-ns
  deployments:
    my-app-deployment
  pods:
    my-app-deployment-789
  services:
    my-app-service
  secrets:
    my-app-secret
```

**Implementation Steps:**

1.  **Core - Kubernetes Interaction (`src/core/kubernetes/kubectlWrapper.ts`):**
    *   **Modify/Create `getResourcesByName(namespace: string, types: string[], ...)`:**
        *   Accepts a namespace and an array of resource types.
        *   Executes `kubectl get <type1>,<type2>,... -n <namespace> -o name --no-headers=true`.
        *   **Crucially, parse the output**, which looks like `pod/pod-a1\nservice/service-b1\ndeployment.apps/dep-c1`. Extract both the `kind` (normalized if needed, e.g., `deployment.apps` -> `deployments`) and the `name` for each line.
        *   Return a structured object, e.g., `Promise<Record<string, string[]>>` mapping normalized kind to an array of names for that namespace. Handle empty results.
    *   **Modify/Create `getResourcesYaml(namespace: string, types: string[], ...)`:**
        *   Accepts a namespace and an array of resource types.
        *   Executes `kubectl get <type1>,<type2>,... -n <namespace> -o yaml`.
        *   Returns the *raw multi-document YAML string* as stdout and the command string. Handle empty results.
    *   Remove the now redundant `getPodNames` and `getPodsYaml` functions.

2.  **Core - Packager (`src/core/packager.ts` - `aggregateResources` function):**
    *   **Define Target Types:** Define the constant array `const resourceTypesToFetch = ['pods', 'services', 'deployments', 'configmaps', 'secrets'];` (consider making this configurable later).
    *   **Fetch Namespaces:** Keep the initial `deps.getNamespaceNames` call.
    *   **Initialize Data Structures:**
        *   `resourcesByNamePerNamespace: Record<string, Record<string, string[]>> = {};` (To store names for the tree).
        *   `fetchedYamlBlocks: Array<{ namespace: string, command: string, yaml: string }> = [];` (To store YAML blocks for the main content).
    *   **Store Namespace YAML:** Keep adding the global namespace YAML fetch result to `fetchedYamlBlocks` (or a similar structure).
    *   **Iterate Namespaces:** Loop through the `namespaceNames` (apply configured namespace filters here if implemented).
    *   **Fetch Resource Data (Inside Loop):**
        *   Call `kubectlWrapper.getResourcesByName` for the `resourceTypesToFetch` array in the current namespace. Store the result in `resourcesByNamePerNamespace[namespace]`.
        *   Call `kubectlWrapper.getResourcesYaml` for the `resourceTypesToFetch` array in the current namespace.
        *   If the YAML result is not empty, add an object `{ namespace: namespace, command: result.command, yaml: result.yaml }` to `fetchedYamlBlocks`.
        *   Implement try/catch around these calls to handle errors for individual namespaces gracefully (log error, continue loop).
    *   **Concurrency:** Use `Promise.all` to map over `namespaceNames` and fetch names and YAML concurrently for each namespace.
    *   **Pass Data to Output:** Pass `namespaceNames`, `resourcesByNamePerNamespace` (for the tree), and `fetchedYamlBlocks` (for the main content) to `outputGenerator.generateOutput`.

3.  **Core - Output Generation (`src/core/output/`):**
    *   **`resourceTreeGenerate.ts` (`generateResourceTreeString`):**
        *   Modify signature to accept `namespaces: string[]` and `resourcesByName: Record<string, Record<string, string[]>>`.
        *   Implement logic: Iterate namespaces (sorted), then iterate kinds found within that namespace (sorted), then iterate resource names (sorted), printing with indentation (e.g., `namespace\n  kind:\n    name1\n    name2`). Handle namespaces or kinds with no resources gracefully.
    *   **`outputGeneratorTypes.ts`:**
        *   Update `OutputGeneratorContext` and `RenderContext`: Replace single resource fields with `resources: Array<{ namespace: string; command: string; yaml: string }>`. Ensure `resourceTreeString` remains.
    *   **`outputStyles/markdownStyle.ts` (and others):**
        *   Update the Handlebars template's `{{#each resources}}` loop. The loop variable (`this`) will now represent a *per-namespace block*.
        *   Use `{{this.namespace}}` in the section heading.
        *   Use `{{this.command}}` for the command block.
        *   Use `{{this.yaml}}` for the multi-document YAML block.
    *   **`outputGenerate.ts`:**
        *   Update `buildOutputGeneratorContext`: Accept `resourcesByNamePerNamespace` and `fetchedYamlBlocks`. Call the updated `generateResourceTreeString`. Populate `outputGeneratorContext.resources` with the `fetchedYamlBlocks`.
        *   Update `createRenderContext` to map the new structure.
        *   Update `generateOutput` signature to accept the new data structure from the `packager`.

4.  **CLI (`src/cli/`):**
    *   Update `AggregationResult` type and `printSummary` if you want to report counts for the new resource types.

5.  **Testing (`tests/`):**
    *   Update/add tests for `kubectlWrapper.getResourcesByName` and `kubectlWrapper.getResourcesYaml`, mocking `executeKubectlCommand` with sample multi-type outputs (`-o name` and `-o yaml`).
    *   Update tests for `packager.ts` (`aggregateResources`) to reflect the new fetching strategy and data aggregation.
    *   Update tests for `resourceTreeGenerate.ts` for the new nested structure.
    *   Update tests for `outputGenerate.ts` and templates to verify the loop over namespace blocks.

**Key Considerations:**

*   **Multi-Document YAML:** The primary challenge is handling the multi-document YAML string returned by `kubectl get type1,type2,... -o yaml`. For this iteration, the FRD specifies simply outputting this raw block per namespace. Future improvements could involve parsing this YAML (e.g., using the `yaml` library's `parseAllDocuments`) to potentially structure the output further or apply redaction *per resource* within the block.
*   **`-o name` Parsing:** The output `kind/name` needs careful parsing, including handling kinds with dots (like `deployment.apps`). Normalizing these kinds (e.g., `deployment.apps` -> `deployments`) for the tree view might be desirable.
*   **Resource List:** The list `['pods', 'services', 'deployments', 'configmaps', 'secrets']` is hardcoded for now. This should eventually become configurable.
*   **Permissions:** The multi-get command (`kubectl get pods,svc,...`) will fail entirely for a namespace if the user lacks `get` permission for *any* of the listed types in that namespace. The error handling in the packager's loop needs to catch this.

**Out of Scope for this Issue:**

*   Fetching resource types *not* in the predefined list (pods, services, deployments, configmaps, secrets).
*   Dynamically discovering resource types using `kubectl api-resources`.
*   Parsing the multi-document YAML output *before* rendering it in the final file.
*   Implementing advanced filtering (labels, fields) within the multi-type fetch.
*   Redaction of sensitive data within the fetched YAML.
*   Updating XML or Plain Text output formats (focus on Markdown first).
*   Making the list of resource types configurable.
