**Title:** Feature: Include Diagnostics for Failing Pods

**Description:**

Enhance `kubemix` to identify Pods in non-running/completed states within the processed namespaces and include relevant diagnostic information (logs, describe output, events) alongside their standard YAML manifests in the output file. This will provide crucial context for troubleshooting and AI analysis of Pod failures.

**Goals:**

*   Improve the utility of `kubemix` for diagnosing cluster issues.
*   Provide context-rich information about failing Pods directly within the aggregated output.
*   Make it easier for users and AI assistants to understand *why* certain Pods are not healthy.
*   Implement this diagnostic gathering efficiently within the existing fetching workflow.

**Definitions:**

*   **Failing Pod:** For this feature, a Pod is considered "failing" if its `status.phase` is *not* `Running` or `Succeeded`. This primarily targets Pods in `Pending`, `Failed`, or `Unknown` states, as well as those stuck in initialization or crash loops (which might briefly show `Running` but have high restart counts or problematic container statuses).

**Acceptance Criteria:**

1.  **Pod Status Check:** After fetching the list of pod names for a namespace (or during the multi-resource fetch if using `-o name`), the tool identifies Pods matching the "Failing Pod" definition. *(Initial implementation might rely on checking status after fetching YAML, future optimization could fetch status first)*.
2.  **Diagnostic Commands:** For each identified "Failing Pod", the tool executes the following additional `kubectl` commands:
    *   `kubectl logs <pod-name> -n <namespace> --tail=50` (Fetch last 50 lines of current logs for all containers).
    *   `kubectl logs <pod-name> -n <namespace> --previous --tail=50` (Fetch last 50 lines of previous container logs, if available).
    *   `kubectl describe pod <pod-name> -n <namespace>` (Fetch detailed description and events).
    *   *(Optional: Dedicated event fetch `kubectl get events -n <namespace> --field-selector involvedObject.kind=Pod,involvedObject.name=<pod-name> --sort-by=lastTimestamp`) - `describe` often includes recent events.*
3.  **Output Integration:**
    *   The main YAML manifest for the failing Pod is still included in the standard "Resources" section (or per-namespace block).
    *   A *new* dedicated section or sub-section is added to the output file, specifically for diagnostics of failing resources.
    *   Within this diagnostics section, for each failing Pod, the output includes:
        *   Clear identification of the Pod (Namespace/Name).
        *   The output of the `describe pod` command.
        *   The output of the `logs` command (current logs), clearly labeled.
        *   The output of the `logs --previous` command (if available), clearly labeled.
        *   The exact `kubectl` commands used to fetch the diagnostic info should be included for context.
4.  **Configuration:**
    *   A new configuration option, e.g., `diagnostics.includeFailingPods` (boolean, default `true`), controls whether this diagnostic gathering is enabled.
    *   A configuration option, e.g., `diagnostics.podLogTailLines` (number, default `50`), controls the number of log lines fetched.
5.  **Efficiency:** Diagnostic commands are *only* run for Pods identified as failing, not for all Pods.
6.  **Error Handling:** Failures in fetching diagnostics for a specific Pod (e.g., logs not available, describe fails) should be handled gracefully (logged, potentially noted in the output) without stopping the entire aggregation process.
7.  **Redaction:** Secret redaction logic (if implemented) should *not* apply to log output or describe output, as these might contain necessary troubleshooting information (though users should still be cautious).

**Example Output Snippet (Markdown Style):**

```markdown
# ... (Previous sections: Summary, Overview, Resource YAMLs) ...

# Diagnostics for Failing Resources

---

### Pod: my-namespace/failing-pod-xyz

**Describe Output:**
```bash
# Command used:
kubectl describe pod failing-pod-xyz -n my-namespace
```
```text
Name:         failing-pod-xyz
Namespace:    my-namespace
Priority:     0
Node:         worker-node-1/10.0.1.5
Start Time:   Wed, 31 Jul 2024 10:00:00 +0100
Labels:       app=my-app
Annotations:  <none>
Status:       Pending
IP:
IPs:          <none>
Containers:
  my-container:
    Container ID:
    Image:          my-image:latest
    Image ID:
    Port:           <none>
    Host Port:      <none>
    State:          Waiting
      Reason:       ImagePullBackOff
    Ready:          False
    Restart Count:  5
    Environment:    <none>
    Mounts:         <none>
... (rest of describe output) ...
Events:
  Type     Reason          Age    From               Message
  ----     ------          ----   ----               -------
  Normal   Scheduled       5m     default-scheduler  Successfully assigned my-namespace/failing-pod-xyz to worker-node-1
  Normal   Pulling         4m     kubelet            Pulling image "my-image:latest"
  Warning  Failed          3m     kubelet            Failed to pull image "my-image:latest": rpc error: code = Unknown desc = Error response from daemon: manifest for my-image:latest not found
  Warning  Failed          3m     kubelet            Error: ErrImagePull
  Normal   BackOff         2m     kubelet            Back-off pulling image "my-image:latest"
  Warning  Failed          1m     kubelet            Error: ImagePullBackOff
```

**Current Logs:**
```bash
# Command used:
kubectl logs failing-pod-xyz -n my-namespace --tail=50
```
```text
(No logs available - container never started or logs rotated)
```

**Previous Logs:**
```bash
# Command used:
kubectl logs failing-pod-xyz -n my-namespace --previous --tail=50
```
```text
(No previous container logs available)
```

---
```

**Implementation Steps:**

1.  **Configuration (`src/config/configSchema.ts`):**
    *   Add a `diagnostics` object to the main schema (`kubeAggregatorConfigBaseSchema` and `kubeAggregatorConfigDefaultSchema`).
    *   Include `includeFailingPods: z.boolean().default(true)` and `podLogTailLines: z.number().int().positive().default(50)` within the `diagnostics` schema.
    *   Update the merged schema accordingly.

2.  **CLI (`src/cli/`):**
    *   Add CLI options corresponding to the new config settings (e.g., `--no-diagnostics`, `--pod-log-lines <number>`).
    *   Update `types.ts` and `actions/.../buildCliConfig` to handle these new options.

3.  **Core - Kubernetes Interaction (`src/core/kubernetes/kubectlWrapper.ts`):**
    *   Add new functions:
        *   `getPodLogs(namespace: string, podName: string, tailLines: number, previous: boolean, ...): Promise<{ logs: string; command: string }>`
        *   `describePod(namespace: string, podName: string, ...): Promise<{ description: string; command: string }>`
    *   These functions will use `executeKubectlCommand` with the appropriate arguments (`logs`, `describe pod`). Handle errors gracefully, especially for `logs --previous` which often fails if there's no previous container.

4.  **Core - Packager (`src/core/packager.ts` - `aggregateResources` function):**
    *   **Identify Failing Pods:** After fetching Pod YAML (or ideally, Pod status summary if optimizing), iterate through the fetched Pods. Use the definition of "Failing Pod" to create a list of ` { name: string, namespace: string }` for those needing diagnostics.
    *   **Check Config:** If `config.diagnostics.includeFailingPods` is `false`, skip the diagnostic fetching step.
    *   **Fetch Diagnostics (Conditionally):**
        *   Create a new array/map to store diagnostic results: `podDiagnostics: Array<{ namespace: string; podName: string; describe?: string; describeCommand?: string; logs?: string; logsCommand?: string; prevLogs?: string; prevLogsCommand?: string; error?: string }>`.
        *   Iterate through the list of failing pods (potentially using `Promise.all` for concurrency).
        *   Inside the loop/Promise.all, call `kubectlWrapper.describePod` and `kubectlWrapper.getPodLogs` (both current and previous). Use the `config.diagnostics.podLogTailLines` value.
        *   Use `try...catch` around *each diagnostic call* for a pod. If a call fails, store an error message in the `podDiagnostics` entry for that pod instead of failing the whole process.
    *   **Pass Data to Output:** Pass the `podDiagnostics` array to `outputGenerator.generateOutput`.

5.  **Core - Output Generation (`src/core/output/`):**
    *   **`outputGeneratorTypes.ts`:** Add `podDiagnostics` (or a more generic `diagnostics` array) to `OutputGeneratorContext` and `RenderContext`.
    *   **Templates (`markdownStyle.ts`, etc.):**
        *   Add a new top-level section (e.g., `# Diagnostics for Failing Resources`).
        *   Add an `{{#each podDiagnostics}} ... {{/each}}` loop.
        *   Inside the loop, display the namespace/pod name.
        *   Conditionally display the `describeCommand` and `describe` output (within appropriate code blocks).
        *   Conditionally display `logsCommand` / `logs` and `prevLogsCommand` / `prevLogs`.
        *   If an `error` field exists for a diagnostic step, display that error message instead of the output.
    *   **`outputGenerate.ts`:**
        *   Update `buildOutputGeneratorContext` and `createRenderContext` to handle the new `podDiagnostics` data.

6.  **Testing (`tests/`):**
    *   Add tests for the new `kubectlWrapper` diagnostic functions.
    *   Update tests for the `packager` to verify:
        *   Failing pods are correctly identified (mock the necessary status/reason fields).
        *   Diagnostic commands are called *only* for failing pods and only if the feature is enabled.
        *   Graceful handling of errors during diagnostic fetching.
        *   Correct data structure (`podDiagnostics`) is passed to the output generator.
    *   Update tests for the output generator and templates to verify the new Diagnostics section is rendered correctly, including conditional display and error messages.

**Key Considerations:**

*   **Performance:** Fetching diagnostics adds extra `kubectl` calls. Doing this only for *failing* pods limits the impact, but concurrency (`Promise.all`) is recommended.
*   **Determining Failure:** The initial definition (`status.phase != Running | Succeeded`) is simple. More sophisticated checks (e.g., checking `restartCount`, container `reason`, readiness probes) could be added later for more accuracy but increase complexity. Fetching a status summary first (`kubectl get pods -o jsonpath='...'`) before deciding whether to fetch full YAML and diagnostics would be a further optimization.
*   **Log Volume:** Limiting log lines (`--tail`) is essential. The default `50` is a starting point.
*   **Output Structure:** Decide on the best place and format for the diagnostics section (e.g., separate top-level section vs. embedding within the main resource blocks). A separate section is proposed here for clarity.
*   **Extensibility:** Design the data structures (`podDiagnostics`) and template logic with the expectation that diagnostics for *other* resource types (Deployments, Services) might be added later.

**Out of Scope for this Issue:**

*   Implementing diagnostics for resource types other than Pods.
*   Advanced failure detection logic beyond basic `status.phase`.
*   Fetching status summaries separately before deciding to fetch full diagnostics (optimization).
*   Redaction within diagnostic output.
*   Updating XML/Plain text formats (focus on Markdown first).

