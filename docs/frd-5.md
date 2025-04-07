**Title:** Feature: Redact Opaque Data in Secret Manifests

**Description:**

Implement functionality to automatically redact the base64-encoded values within the `data` field of Kubernetes `Secret` resources in the generated output file. Replace the actual encoded value with a placeholder string (e.g., `*****`) to prevent accidental exposure of sensitive information while still indicating the presence and keys of the secret data.

This enhancement improves the security posture of the `kubemix` output, making it safer to share or analyze with AI tools without leaking sensitive credentials, tokens, or other confidential data stored in Secrets.

**Acceptance Criteria:**

1.  When `kubemix` fetches `Secret` resources (either explicitly requested or as part of a broader fetch like the multi-type command).
2.  The tool identifies the `data` field within the YAML or JSON representation of each `Secret` resource.
3.  For *each key* within the `data` field, the corresponding base64-encoded string value is replaced with a fixed placeholder string (e.g., `*****`).
4.  The *keys* within the `data` field remain unchanged.
5.  The structure of the `Secret` manifest (apiVersion, kind, metadata, type, etc.) remains otherwise unchanged.
6.  The modified YAML/JSON manifest with redacted data values is included in the final `kubemix` output file.
7.  This redaction applies regardless of the output format (`markdown`, `xml`, `plain`).
8.  A configuration option (`security.redactSecrets`, defaulting to `true`) allows users to disable this redaction if absolutely necessary (though strongly discouraged).
9.  The `kubectl` command included in the output *remains unchanged* (it still shows the command that *would* fetch the unredacted data).

**Example Output Change:**

**Before Redaction (Partial Secret YAML):**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: my-db-secret
  namespace: my-app
type: Opaque
data:
  DATABASE_USER: dXNlcg== # "user"
  DATABASE_PASSWORD: cGFzc3dvcmQ= # "password"
  DATABASE_URL: cG9zdGdyZXM6Ly91c2VyOnBhc3N3b3JkQGโฮสต์L2Ri== # postgres://user:password@host/db
```

**After Redaction (Partial Secret YAML in `kubemix` output):**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: my-db-secret
  namespace: my-app
type: Opaque
data:
  DATABASE_USER: *****
  DATABASE_PASSWORD: *****
  DATABASE_URL: *****
```

**Implementation Steps:**

1.  **Configuration (`src/config/configSchema.ts`):**
    *   Ensure the `security.redactSecrets` boolean option exists in `securityConfigSchema` and `kubeAggregatorConfigDefaultSchema` (defaulting to `true`).

2.  **Core - Resource Processing (`src/core/processing/resourceProcessor.ts` - New or Existing File):**
    *   Create a new function, e.g., `processResourceManifest(yamlString: string, config: KubeAggregatorConfigMerged): string`.
    *   **YAML Parsing:** Inside `processResourceManifest`, use a YAML parsing library that supports multi-document streams (like `yaml`). Use `yaml.parseAllDocuments` to handle the potential multi-document output from `kubectl get type1,type2,... -o yaml`.
    *   **Iterate Documents:** Loop through each parsed document (representing a single resource).
    *   **Identify Secrets:** Check if `doc.get('kind') === 'Secret'` and `doc.has('data')`.
    *   **Redact Data:** If it's a Secret with a `data` field:
        *   Get the `data` node/map.
        *   Iterate through the keys of the `data` map.
        *   For each key, *replace* its value with the placeholder string (e.g., `*****`). Use the YAML library's methods for modifying the parsed structure (e.g., `dataMap.set(key, '*****')`).
    *   **Re-serialize YAML:** Convert the (potentially modified) documents back into a multi-document YAML string using the YAML library (e.g., `documents.map(doc => doc.toString()).join('---\n')`).
    *   **Handle Config Option:** Check `config.security.redactSecrets`. Only perform the redaction steps if this is `true`.
    *   **Error Handling:** Include try/catch blocks around YAML parsing and manipulation to handle malformed YAML gracefully.

3.  **Core - Packager (`src/core/packager.ts` - `aggregateResources` function):**
    *   **Integrate Processing:** After fetching the YAML for resources in a namespace (using `kubectlWrapper.getResourcesYaml`), pass the resulting `yaml` string to the new `processResourceManifest` function *before* adding it to the `fetchedYamlBlocks` (or similar) array.
    *   Store the *processed* (potentially redacted) YAML string in `fetchedYamlBlocks`.

4.  **Testing (`tests/`):**
    *   Add unit tests for `src/core/processing/resourceProcessor.ts` (`processResourceManifest`):
        *   Test with single and multi-document YAML strings.
        *   Test with YAML containing Secrets (both `Opaque` and other types like `kubernetes.io/dockerconfigjson`) and verify `data` values are redacted.
        *   Test with YAML containing other resource types (Pods, ConfigMaps) and verify they are *not* modified.
        *   Test the behavior when `config.security.redactSecrets` is `false`.
        *   Test with edge cases (empty `data` field, non-string values in `data` - although typically base64 strings, malformed YAML).
    *   Update integration tests for the `packager` to ensure that Secret `data` is correctly redacted in the final output file when the feature is enabled.

**Key Considerations:**

*   **YAML Library:** Choose a robust YAML library like `yaml` (available on npm) that handles multi-document streams and allows in-place modification of the parsed structure before re-serializing. Avoid simple string replacement which can be error-prone.
*   **JSON Handling:** While the primary output from `kubectl -o yaml` is YAML, if you were to fetch JSON (`-o json`), similar logic would be needed to parse the JSON, identify Secrets, navigate to `.data`, and replace values. The current FRD focuses on the YAML output specified.
*   **`stringData` Field:** Secrets can also have a `stringData` field for convenience. While `kubectl get -o yaml` usually only shows the `data` field (base64 encoded), a robust implementation might *also* check for and redact `stringData` if it were somehow present in the input YAML being processed (though less likely with direct `kubectl` output). For this FRD, focusing only on the `data` field is sufficient.
*   **Performance:** Parsing and re-serializing YAML for every fetched resource block adds overhead. For very large clusters/outputs, this impact should be considered, but security generally outweighs minor performance concerns here.

**Out of Scope for this Issue:**

*   Redacting other potentially sensitive fields (e.g., specific annotations, environment variables in Pods/Deployments).
*   Providing more granular redaction rules (e.g., only redacting specific keys).
*   Implementing redaction for JSON output format if fetched directly (`kubectl get ... -o json`).

