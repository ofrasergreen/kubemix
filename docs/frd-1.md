# Implement Basic Namespace Aggregation

**Description:**

This issue covers the initial feature implementation for the `kube-aggregator` tool: fetching all namespaces from the currently configured Kubernetes cluster using `kubectl` and generating a basic Markdown output file (`kubemix-output.md`).

This builds upon the project structure and tooling setup established in Phase 1, adapting patterns from the Repomix project where applicable.

**Acceptance Criteria:**

1.  Running `kube-aggregator` (or a specific command like `kube-aggregator namespaces`) executes successfully.
2.  The tool runs `kubectl get namespaces -o name` to get a list of namespace names.
3.  The tool runs `kubectl get namespaces -o yaml` to get the full YAML output.
4.  A Markdown file (defaulting to `kubemix-output.md` or configurable via `--output`) is generated.
5.  The Markdown file contains the following sections in order:
    *   A preamble section (similar to Repomix's `file_summary`) explaining the file's purpose (aggregating Kubernetes resources).
    *   A "Cluster Resource Tree" section (similar to Repomix's `directory_structure`) containing a simple list of discovered namespace names (one per line).
    *   A "Resources" section containing:
        *   A heading indicating the resource type (e.g., `## Resource: Namespaces`).
        *   The exact `kubectl` command used to fetch the YAML (e.g., `kubectl get namespaces -o yaml`).
        *   The full YAML output from the command within a YAML code block.

**Implementation Steps:**

1.  **CLI (`src/cli/`):**
    *   **`cliRun.ts`:** Define the main command structure using `commander`. For now, a default action might suffice, or a specific `namespaces` command could be added. Add basic options like `--output` and `--style` (defaulting to `markdown`).
    *   **`actions/defaultAction.ts` (or `actions/namespacesAction.ts`):** Create the action function that orchestrates the process by calling the core `packager` function.
    *   **`cliPrint.ts`:** Adapt or create functions to print summaries or status updates (though minimal for this first feature).
    *   **`types.ts`:** Update `CliOptions` with relevant options (`output`, `style`, potentially `kubeconfig`, `context` later).

2.  **Configuration (`src/config/`):**
    *   **`configSchema.ts`:** Define a basic `kubeAggregatorConfigSchema` using Zod. Include `output.filePath` and `output.style` (defaulting to `markdown`). Add placeholders for future Kube-specific configs.
    *   **`configLoad.ts`:** Implement basic loading/merging logic, ensuring the default output file is `kubemix-output.md` and style is `markdown`.

3.  **Core - Kubernetes Interaction (`src/core/kubernetes/`):**
    *   **`kubectlWrapper.ts` (New File):**
        *   Create a function `executeKubectlCommand(args: string[]): Promise<{ stdout: string; stderr: string; command: string }>` that uses `child_process.execFile` to run `kubectl` with the given arguments. It should return the captured stdout, stderr, and the exact command string executed. Handle potential errors (e.g., `kubectl` not found, command failure).
        *   Create `getNamespaceNames(): Promise<string[]>`: Calls `executeKubectlCommand` with `['get', 'namespaces', '-o', 'name']`, parses the stdout into an array of names (e.g., `namespace/mynamespace`), and extracts just the name part.
        *   Create `getNamespacesYaml(): Promise<{ yaml: string; command: string }>`: Calls `executeKubectlCommand` with `['get', 'namespaces', '-o', 'yaml']` and returns the stdout (YAML content) and the command string.

4.  **Core - Output Generation (`src/core/output/`):**
    *   **`resourceTreeGenerate.ts` (New File):**
        *   Create `generateResourceTreeString(namespaces: string[]): string`. For now, this will simply format the list of namespace names, one per line.
    *   **`outputStyles/markdownStyle.ts` (Adapt/Create):**
        *   Define a Handlebars template for the Markdown output structure described in the Acceptance Criteria. Include placeholders for `preamble`, `resourceTree`, `kubectlCommand`, and `commandOutput`.
    *   **`outputStyleDecorate.ts` (Adapt):**
        *   Modify `generateHeader`, `generateSummaryPurpose`, etc., to reflect Kubernetes aggregation instead of file packing.
    *   **`outputGenerate.ts` (Adapt):**
        *   Modify the `generateOutput` function (or a new specific one).
        *   It should accept the namespace names array and the namespace YAML content + command string.
        *   Call `generateResourceTreeString` to get the tree view.
        *   Prepare the render context for the Handlebars template, passing the preamble, tree string, command used, and YAML output.
        *   Compile and render the Markdown template.

5.  **Core - Packager (`src/core/packager.ts`):**
    *   Adapt the main `pack` function (rename if necessary, e.g., `aggregateResources`).
    *   Remove file system logic (`searchFiles`, `collectFiles`, `processFiles`).
    *   Call `kubectlWrapper.getNamespaceNames()` to get data for the resource tree.
    *   Call `kubectlWrapper.getNamespacesYaml()` to get the main resource data and command.
    *   Pass the fetched data and command string to `outputGenerate.generateOutput`.
    *   Call `writeOutputToDisk` (adapt from Repomix) to save the generated Markdown string.

6.  **Shared (`src/shared/`):**
    *   **`logger.ts`:** Use the existing logger for status updates and debugging.
    *   **`errorHandle.ts`:** Adapt or extend error handling for `kubectl` command failures or Kubernetes API errors (if switching later).

**Key Considerations:**

*   **kubectl Dependency:** The tool now explicitly depends on `kubectl` being available in the system's PATH. Error handling should account for `kubectl` not being found.
*   **Error Handling:** Implement robust error handling for `kubectl` command execution (non-zero exit codes, stderr output).
*   **Two kubectl Calls:** This initial implementation uses two separate `kubectl` calls (one for names, one for YAML). This is acceptable for simplicity now, but future iterations might parse the YAML to get names to reduce calls.
*   **Output Formatting:** Focus on getting the basic Markdown structure right. Refinements can come later.
*   **Testing:** Unit tests should heavily mock the `executeKubectlCommand` function in `kubectlWrapper.ts` to avoid actual cluster interaction. Test the parsing of command output and the generation of the Markdown structure.

**Out of Scope for this Issue:**

*   Fetching resources other than Namespaces.
*   Parsing the YAML output for anything other than extracting namespace names (if the simpler `-o name` approach is chosen for the tree).
*   Advanced filtering (labels, fields, specific resource names).
*   Redaction of sensitive data.
*   XML or Plain Text output styles.
*   Configuration options beyond basic output path/style.
*   Handling multiple Kubernetes contexts or kubeconfig files explicitly (relies on default `kubectl` context for now).
