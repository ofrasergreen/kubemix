**Title:** Feature: Implement Namespace and Resource Type Filtering

**Description:**

Enhance `kubemix` to allow users to specify which namespaces and resource types should be included or excluded from the aggregation process. Filtering should be configurable via both command-line options and the `kubemix.config.json` file, with CLI options taking precedence.

**Goals:**

*   Provide users fine-grained control over the scope of the aggregated resources.
*   Reduce the size and complexity of the output file by focusing on relevant data.
*   Handle potentially large clusters more efficiently by skipping unnecessary fetches.
*   Establish a filtering mechanism that can be extended to labels and fields later.

**Acceptance Criteria:**

1.  **Configuration:**
    *   The `kubemix.config.json` file supports `filter.namespaces` (array of strings to include), `filter.excludeNamespaces` (array of strings to exclude), `filter.includeResourceTypes` (array of strings), and `filter.excludeResourceTypes` (array of strings).
    *   Default excluded namespaces (e.g., `kube-system`) and resource types (e.g., `events`) are applied if not overridden.
2.  **CLI Options:**
    *   New CLI options are available:
        *   `--namespace <ns1,ns2,...>` or `-n <ns1,ns2,...>`: Specify namespaces to include (overrides config `filter.namespaces`).
        *   `--exclude-namespace <ns1,ns2,...>`: Specify namespaces to exclude (adds to config `filter.excludeNamespaces`).
        *   `--include-type <type1,type2,...>`: Specify resource types to include (overrides config `filter.includeResourceTypes`).
        *   `--exclude-type <type1,type2,...>`: Specify resource types to exclude (adds to config `filter.excludeResourceTypes`).
3.  **Filtering Logic:**
    *   **Namespaces:**
        *   If `--namespace` (CLI) is provided, *only* those namespaces are considered for fetching resources (subject to `--exclude-namespace`).
        *   If `filter.namespaces` (config) is provided (and no CLI override), *only* those namespaces are considered (subject to exclusions).
        *   If neither include list is provided, *all* namespaces discovered via `kubectl get ns -o name` are considered initially.
        *   Namespaces specified in `--exclude-namespace` (CLI) or `filter.excludeNamespaces` (config, including defaults) are *always* removed from the list of namespaces to process. CLI exclusions are additive to config exclusions.
    *   **Resource Types:**
        *   If `--include-type` (CLI) is provided, *only* those resource types are fetched within the selected namespaces (subject to `--exclude-type`).
        *   If `filter.includeResourceTypes` (config) is provided (and no CLI override), *only* those types are fetched (subject to exclusions).
        *   If neither include list is provided, a default set of common types (e.g., Pods, Services, Deployments, ConfigMaps, Secrets - *excluding* default excluded types like Events) is fetched. (Alternatively, could use `api-resources` if implemented).
        *   Resource types specified in `--exclude-type` (CLI) or `filter.excludeResourceTypes` (config, including defaults) are *always* removed from the list of types to fetch. CLI exclusions are additive to config exclusions.
4.  **Output:**
    *   The "Cluster Resource Overview" tree only shows namespaces and resource types/names that match the final calculated filters.
    *   The main "Resources" section only contains blocks for namespaces and resource types that match the final calculated filters.
    *   The preamble/summary section should reflect that filtering has been applied if applicable (this logic might already exist in `outputStyleDecorate.ts`).
5.  **Efficiency:** The tool should avoid making `kubectl get <type> -n <namespace>` calls for namespaces or types that have been filtered out *before* the fetching stage.

**Implementation Steps:**

1.  **Configuration (`src/config/configSchema.ts`):**
    *   Ensure the Zod schema (`filterSchema`) accurately reflects the `namespaces`, `excludeNamespaces`, `includeResourceTypes`, and `excludeResourceTypes` array fields.
    *   Update `kubeAggregatorConfigCliSchema` to include these filter options as optional arrays of strings.
    *   Update `defaultConfig` to include the default excluded namespaces and resource types (this should already be done from previous steps).

2.  **CLI (`src/cli/`):**
    *   **`types.ts`:** Add the new filter options (`namespace`, `excludeNamespace`, `includeType`, `excludeType`) to the `CliOptions` interface, likely as optional strings (since they'll be comma-separated).
    *   **`cliRun.ts`:** Add the new Commander options (`-n, --namespace`, `--exclude-namespace`, `--include-type`, `--exclude-type`), ensuring they accept comma-separated values.
    *   **`actions/namespaceAction.ts` (`buildCliConfig`):**
        *   Parse the comma-separated string values from the new CLI options into arrays of strings.
        *   Populate the `filter` section of the `KubeAggregatorConfigCli` object based on these parsed arrays.

3.  **Configuration (`src/config/configLoad.ts` - `mergeConfigs`):**
    *   Update the merge logic to handle the filter arrays correctly:
        *   CLI `namespaces` array *replaces* config `namespaces` array if present.
        *   CLI `includeResourceTypes` array *replaces* config `includeResourceTypes` array if present.
        *   CLI `excludeNamespaces` array *adds* to the config `excludeNamespaces` array (use `Set` for deduplication).
        *   CLI `excludeResourceTypes` array *adds* to the config `excludeResourceTypes` array (use `Set` for deduplication).
    *   Ensure the final merged config has correctly combined/overridden filter settings.

4.  **Core - Filtering Logic (`src/core/kubernetes/resourceFilter.ts`):**
    *   **`getResourceTypesToFetch`:**
        *   Refine this function to fully implement the resource type filtering logic described in Acceptance Criteria #3 (Resource Types). It should take the `mergedConfig` as input.
        *   It might need the list of *all* discoverable types (`kubectl api-resources`) if no `includeResourceTypes` are specified (decide if dynamic discovery is in scope *now* or if a hardcoded default list is used when includes are empty). For now, assume a hardcoded default list if includes are empty.
    *   **`getNamespacesToQuery`:**
        *   Refine this function to fully implement the namespace filtering logic described in Acceptance Criteria #3 (Namespaces). It should take the `mergedConfig` and the list of *all* discovered namespace names (`string[]`) as input.
        *   It should return the final list of namespace names (`string[]`) to iterate over for resource fetching.

5.  **Core - Packager (`src/core/packager.ts` - `aggregateResources` function):**
    *   **Filtering:**
        *   After fetching the initial list of *all* namespace names (`kubectlWrapper.getNamespaceNames`), call `resourceFilter.getNamespacesToQuery`, passing the config and the full namespace list. Use the *returned filtered list* for the main iteration loop.
        *   Before fetching resources *within* the namespace loop, call `resourceFilter.getResourceTypesToFetch`, passing the config. Use this *filtered list of types* when calling `kubectlWrapper.getResourcesByName` and `kubectlWrapper.getResourcesYaml`.
    *   **Data Structures:** Ensure the data passed to the output generator (`resourcesByNamePerNamespace`, `fetchedYamlBlocks`) only contains data for the namespaces and resource types that passed the filters.

6.  **Core - Output Generation (`src/core/output/`):**
    *   **`resourceTreeGenerate.ts`:** Ensure it correctly handles potentially filtered `namespaces` and `resourcesByName` data passed from the packager. It should only display what was actually fetched.
    *   **`outputStyleDecorate.ts`:** Update `analyzeContent` and `generateSummaryNotes` to accurately reflect which filters were applied based on the final merged config.
    *   **Templates (`markdownStyle.ts`, etc.):** No changes should be needed here if the `resources` array passed to them only contains the filtered data.

7.  **Testing (`tests/`):**
    *   Add tests for `resourceFilter.ts` functions (`getResourceTypesToFetch`, `getNamespacesToQuery`) with various config/CLI combinations.
    *   Update tests for `configLoad.ts` (`mergeConfigs`) to verify filter array merging/overriding logic.
    *   Update tests for `packager.ts` (`aggregateResources`) to ensure it calls the filter functions correctly and only fetches/processes filtered resources. Mock `kubectlWrapper` calls and verify they are only made for expected namespaces/types.
    *   Update tests for `outputGenerate.ts` and `resourceTreeGenerate.ts` to ensure the output reflects the filtered results correctly.

**Key Considerations:**

*   **Default Resource List:** Decide on the default list of resource types to fetch if `includeResourceTypes` is not specified (e.g., `['pods', 'services', 'deployments', 'configmaps', 'secrets']` minus default excludes).
*   **Case Sensitivity:** Decide if namespace and resource type names are case-sensitive for filtering (Kubernetes generally is, so likely yes).
*   **Performance:** Applying filters *before* making `kubectl` calls is crucial for performance on large clusters.
*   **User Feedback:** Ensure clear log messages indicate which filters are being applied.

**Out of Scope for this Issue:**

*   Filtering by labels or fields (covered by `--label-selector`, `--field-selector` options).
*   Dynamic resource discovery using `kubectl api-resources` (unless chosen as the way to get the default list).
*   Filtering specific resource *names* (e.g., only get pod `my-pod-123`).
*   Wildcard support in filter patterns (stick to exact names for now).

