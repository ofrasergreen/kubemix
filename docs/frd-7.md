**Title:** Feature: Implement Token Counting and Enhanced Summary Output

**Description:**

Integrate token counting for the generated output file using a library like `tiktoken`. Display a final summary in the console (stdout) similar to Repomix, reporting the total number of aggregated resources, total characters, estimated total tokens, output file path, and the status of secret redaction.

**Goals:**

*   Provide users with an estimate of the "cost" or size of the aggregated output in terms of tokens, crucial for LLM context limits.
*   Offer a concise summary of the aggregation process upon completion.
*   Inform the user about whether sensitive Secret data was redacted in the output.
*   Maintain a user experience consistent with tools like Repomix.

**Acceptance Criteria:**

1.  **Token Counting Integration:**
    *   The `tiktoken` library (or a similar tokenizer compatible with common LLMs) is added as a dependency.
    *   A mechanism (e.g., a `TokenCounter` class or utility function) is created to calculate the token count for a given string using a specified encoding (configurable, defaulting to a common one like `cl100k_base` or `o200k_base`).
2.  **Calculation:** After the final output string (e.g., the full Markdown content) is generated but *before* writing to the file, its total token count is calculated using the configured encoding.
3.  **Summary Output:** Upon successful completion, a summary is printed to stdout resembling the following format:

    ```
    📊 Aggregation Summary:
    ──────────────────────
      Total Resources: 15 resources  # Count of all aggregated K8s objects
      Total Characters: 85,320 chars # Character count of the final output string
      Total Tokens: 21,050 tokens    # Estimated token count of the final output string
           Output File: kubemix-output.md
       Secret Redaction: Enabled (data fields redacted) # Or "Disabled" or "N/A (No Secrets Found)"
    ```
4.  **Metrics:** The final `AggregationResult` returned by the core `aggregateResources` function includes `totalCharacters` and `totalTokens`. The `totalResources` count should also be included (replacing `namespaceCount` or adding to it).
5.  **Configuration:**
    *   A new configuration option `tokenCount.encoding` (string, defaulting to e.g., `o200k_base`) is added to `configSchema.ts` to allow users to specify the tokenizer encoding.
    *   The token calculation uses the encoding specified in the merged configuration.
6.  **Error Handling:** If token counting fails (e.g., `tiktoken` error), it should be logged as a warning, and the summary should display "N/A" or a similar indicator for the token count, but the overall process should not fail.

**Implementation Steps:**

1.  **Dependencies:**
    *   Add `tiktoken` as a project dependency: `npm install tiktoken` (or `pnpm add`/`yarn add`).

2.  **Token Counting Logic (`src/core/tokenCount/tokenCount.ts` - New File or Adapt Repomix):**
    *   Create a `TokenCounter` class or utility function similar to Repomix's.
    *   It should initialize the `tiktoken` encoder based on the encoding name passed from the config.
    *   Include error handling within the `countTokens` method to catch potential `tiktoken` errors and return 0 or log a warning.
    *   Include a method to free the encoder resources (`free()`) if using the class approach.

3.  **Configuration (`src/config/configSchema.ts`):**
    *   Add the `tokenCount` section to `kubeAggregatorConfigBaseSchema` and `kubeAggregatorConfigDefaultSchema`.
    *   Define `encoding: z.string().default('o200k_base')` (or `cl100k_base`). Ensure the merged schema includes this.

4.  **Core - Packager (`src/core/packager.ts` - `aggregateResources` function):**
    *   **Instantiate Counter:** Potentially create an instance of `TokenCounter` early in the function using `config.tokenCount.encoding`.
    *   **Calculate Metrics:** *After* `outputGenerator.generateOutput` produces the final `outputString`:
        *   Calculate `totalCharacters = outputString.length`.
        *   Call the token counter: `totalTokens = tokenCounter.countTokens(outputString)`.
    *   **Update Result:** Modify the `AggregationResult` object returned by the function to include `totalCharacters` and `totalTokens`. Also, ensure it includes `totalResources` (this requires counting the number of resources fetched/processed earlier in the function).
    *   **Cleanup:** If using a `TokenCounter` class, call its `free()` method in a `finally` block.

5.  **CLI (`src/cli/actions/namespaceAction.ts` - Adapt name if needed):**
    *   **Update `AggregationResult` Type:** Ensure the interface includes `totalResources`, `totalCharacters`, and `totalTokens`.
    *   **Pass Data to Print:** Pass the complete `aggregationResult` (including the new metrics) and the `config` to `cliPrint.printSummary`.

6.  **CLI (`src/cli/cliPrint.ts` - `printSummary`):**
    *   Modify the `printSummary` function signature to accept the updated `AggregationResult` and the `config`.
    *   Update the logging calls to display:
        *   `Total Resources` using `aggregationResult.totalResources`.
        *   `Total Characters` using `aggregationResult.totalCharacters`.
        *   `Total Tokens` using `aggregationResult.totalTokens`.
        *   `Output File` using `config.output.filePath`.
        *   `Secret Redaction` status: Check `config.security.redactSecrets`. Determine if any Secrets were actually processed (might need this info passed back in `AggregationResult`) to potentially show "N/A (No Secrets Found)" vs "Enabled" vs "Disabled". Start with just "Enabled" / "Disabled" based on the config flag.

7.  **Testing (`tests/`):**
    *   Add unit tests for the `TokenCounter` logic.
    *   Update tests for `packager.ts` (`aggregateResources`) to:
        *   Mock the `TokenCounter`.
        *   Verify the token counter is called with the final output string.
        *   Verify the returned `AggregationResult` includes the correct character and token counts.
    *   Update tests for `cliPrint.ts` (`printSummary`) to verify the new summary format is printed correctly based on mock data, including the redaction status.

**Key Considerations:**

*   **Tokenizer Choice:** `tiktoken` is a good choice as it's used by OpenAI models. Ensure the default encoding matches common models like GPT-4 (`cl100k_base`) or GPT-4o (`o200k_base`).
*   **Performance:** Token counting on potentially large output strings can take a moment. Ensure it doesn't significantly slow down the user experience after generation finishes.
*   **Accuracy:** Token counts are estimates specific to the chosen tokenizer/encoding. The summary should reflect this implicitly ("Total Tokens" rather than "Exact LLM Cost").
*   **Redaction Status:** Determining if secrets were *actually found and redacted* vs. just *enabled* requires tracking whether any Secret resources were processed. The initial implementation can just report the status based on the `config.security.redactSecrets` flag.

**Out of Scope for this Issue:**

*   Calculating token counts *per resource* (only the total for the final output file).
*   Providing cost estimates based on tokens.
*   Supporting tokenizers other than the one chosen (e.g., `tiktoken`).
