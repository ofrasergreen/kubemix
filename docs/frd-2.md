# Aggregate Pods per Namespace and Update Resource Tree

**Description:**

This feature extends the initial namespace aggregation functionality by fetching and including Pod resource details for *each* discovered namespace. It also requires updating the "Cluster Resource Overview" section to display a hierarchical view showing pods nested under their respective namespaces.

This builds upon the existing structure for fetching namespaces and generating Markdown output.

**Acceptance Criteria:**

1.  The `kubemix` command executes successfully.
2.  The tool first fetches all namespace names (using the existing `getNamespaceNames` logic).
3.  The tool then *iterates* through the discovered namespaces.
4. For each namespace, the tool executes kubectl get pods -n <namespace> -o name to get pod names within that namespace.
5.  For *each* namespace, the tool executes `kubectl get pods -n <namespace> -o yaml` to get the full YAML output for pods in that namespace.
6.  The Markdown output file (e.g., `kubemix-output.md`) is generated successfully.
7.  The output file contains:
    *   The existing Preamble section.
    *   An updated "Cluster Resource Overview" section displaying namespaces, with the names of the pods within each namespace listed and indented underneath (as shown in the example below).
    *   The "Resources" section now contains:
        *   The original block for `Resource: Namespaces` (including command and full YAML).
        *   *Multiple* subsequent blocks, one for each namespace containing pods, formatted as:
            *   Heading: `## Resource: Pods (Namespace: <namespace-name>)`
            *   Command block showing: `kubectl get pods -n <namespace-name> -o yaml`
            *   YAML code block containing the *full YAML output* for pods in that namespace.
8.  Namespaces with no pods should still appear in the Resource Overview tree but should not generate a "Resource: Pods" block in the main Resources section.
9.  Error handling is implemented: If fetching pods for a *specific* namespace fails, an error/warning should be logged, but the process should continue for other namespaces.

**Example Resource Overview Format:**

```
# Cluster Resource Overview
```
namespace-a
  pods:
    pod-a1
    pod-a2
namespace-b
  pods:
    pod-b1
kube-system
  pods:
    coredns-xyz
    etcd-master
    kube-apiserver-master
    ...
namespace-c
  pods:  # none
```

**Implementation Steps:**

1.  **Core - Kubernetes Interaction (`src/core/kubernetes/kubectlWrapper.ts`):**
    *   Add a new function `getPodNames(namespace: string, kubeconfigPath?: string, context?: string): Promise<string[]>`:
        *   Executes `kubectl get pods -n <namespace> -o name --no-headers=true`.
        *   Parses the output (e.g., `pod/pod-a1`) to extract just the pod names.
        *   Handles cases where no pods are found in the namespace (returns empty array).
    *   Add a new function `getPodsYaml(namespace: string, kubeconfigPath?: string, context?: string): Promise<{ yaml: string; command: string }>`:
        *   Executes `kubectl get pods -n <namespace> -o yaml`.
        *   Returns the raw YAML stdout and the command string.
        *   Handles cases where no pods are found gracefully (e.g., returns empty YAML string or specific indicator).

2.  **Core - Packager (`src/core/packager.ts` - `aggregateResources` function):**
    *   **Fetch Namespaces:** Reuse the existing call to `deps.getNamespaceNames`.
    *   **Initialize Data Structures:** Prepare arrays or maps to store results for both namespaces and pods per namespace (e.g., `podsByNamespace: Record<string, string[]>`, `fetchedResources: Array<{ kind: string, namespace?: string, command: string, yaml: string }>`).
    *   **Store Namespace YAML:** Add the result from `deps.getNamespacesYaml` to `fetchedResources`.
    *   **Iterate Namespaces:** Loop through the `namespaceNames`.
    *   **Fetch Pod Data (Inside Loop):**
        *   Call `kubectlWrapper.getPodNames` for the current namespace. Store results in `podsByNamespace`.
        *   Call `deps.getPodsYaml` for the current namespace.
        *   If pods YAML is not empty, add an entry to `fetchedResources` containing the kind (`Pods`), namespace, command, and YAML output. Handle potential errors for individual namespaces gracefully (log and continue).
    *   **Concurrency (Optional but Recommended):** Use `Promise.all` to fetch pod names and YAML for all namespaces concurrently after getting the namespace list.
    *   **Pass Data to Output:** Pass the `namespaceNames`, `podsByNamespace` (for the tree), and the full `fetchedResources` array (for the main content) to `outputGenerator.generateOutput`.

3.  **Core - Output Generation (`src/core/output/`):**
    *   **`resourceTreeGenerate.ts` (`generateResourceTreeString`):**
        *   Modify the function signature to accept `namespaces: string[]` and `podsByNamespace: Record<string, string[]>`.
        *   Implement logic to iterate through namespaces, sort them, and for each namespace, iterate through its pods (sorted), printing them with appropriate indentation under a "pods:" indicator. Handle namespaces with no pods.
    *   **`outputGeneratorTypes.ts`:**
        *   Update `OutputGeneratorContext` and `RenderContext`: Remove the single `resourceKind`, `kubectlCommand`, `resourceYamlOutput` fields. Add a `resources: Array<{ kind: string; namespace?: string; command: string; yaml: string }>` field. Ensure `resourceTreeString` is still present.
    *   **`outputStyles/markdownStyle.ts` (and potentially others later):**
        *   Modify the Handlebars template: Remove the single resource block. Add an `{{#each resources}} ... {{/each}}` block. Inside the loop, use `{{this.kind}}`, `{{this.namespace}}` (conditionally), `{{this.command}}`, and `{{this.yaml}}` to render each resource block dynamically.
    *   **`outputGenerate.ts`:**
        *   Update `buildOutputGeneratorContext`: Accept the full `fetchedResources` array and the `podsByNamespace` map. Populate `outputGeneratorContext.resources` and call the updated `generateResourceTreeString`.
        *   Update `createRenderContext`: Map the data correctly from `OutputGeneratorContext` to `RenderContext`, especially the `resources` array.
        *   Ensure `generateOutput` accepts the new data structure from the `packager`.

4.  **CLI (`src/cli/`):**
    *   **`actions/namespaceAction.ts` (`AggregationResult`):** Consider adding `totalPods` or similar metrics to the result type (optional).
    *   **`cliPrint.ts` (`printSummary`):** Update to display any new metrics added to `AggregationResult`.

5.  **Testing (`tests/`):**
    *   Add tests for `kubectlWrapper.getPodNames` and `kubectlWrapper.getPodsYaml`, mocking `executeKubectlCommand`.
    *   Update tests for `packager.ts` (`aggregateResources`) to mock the new `kubectlWrapper` calls and verify the iteration and data aggregation logic.
    *   Add/Update tests for `resourceTreeGenerate.ts` to verify the nested tree output format.
    *   Update tests for `outputGenerate.ts` and the Markdown template to ensure the `{{#each resources}}` loop works correctly.

**Key Considerations:**

*   **Efficiency:** Fetching pod *names* separately (`-o name`) for the tree is more efficient than fetching full YAML twice.
*   **Error Handling:** Decide how to represent errors for specific namespaces in the output (e.g., a note in the resource block or skipped block with a log message). The current plan is to log and continue.
*   **Data Structure:** Passing an array of `fetchedResources` (each with kind, ns, command, yaml) to the output generator seems flexible for future expansion.
*   **kubectl Output Parsing:** Be mindful that the exact output format of `kubectl get ... -o name` might vary slightly; make parsing robust.
*   **Concurrency:** Implement `Promise.all` in the `packager` when fetching pod details for multiple namespaces to improve performance.

**Out of Scope for this Issue:**

*   Fetching resource types other than Namespaces and Pods.
*   Filtering pods by labels or fields.
*   Redacting sensitive information within Pod YAML (e.g., environment variables).
*   Updating XML or Plain Text output formats.
*   Adding advanced configuration options for pod filtering.
```
