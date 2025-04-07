// src/core/output/outputStyles/markdownStyle.ts
import Handlebars from 'handlebars';

export const getMarkdownTemplate = () => {
  // Note: Adapt placeholders (e.g., generationHeader, summary*) from outputStyleDecorate.ts
  return /* md */ `
{{{generationHeader}}}

{{#if preambleEnabled}}
# Cluster Summary

## Purpose
{{{summaryPurpose}}}

## File Format
{{{summaryFileFormat}}}
4. Resource details, each consisting of:
  a. A header indicating the resource type (e.g., ## Resource: Namespaces)
  b. The exact kubectl command used to fetch the resource.
  c. The full output of the command in a code block.
{{#if diagnosticsEnabled}}
5. Diagnostics section for failing pods (if any were found), including:
  a. Detailed description output with status and events.
  b. Container logs for troubleshooting.
  c. Previous container logs if available (for crash investigation).
{{/if}}

## Usage Guidelines
{{{summaryUsageGuidelines}}}

## Notes
{{{summaryNotes}}}

{{#if headerText}}
## Additional Info
<user_provided_header>
{{{headerText}}}
</user_provided_header>
{{/if}}

{{/if}}
{{#if resourceTreeEnabled}}
# Cluster Resource Overview
\`\`\`
{{{resourceTreeString}}}
\`\`\`
{{/if}}

# Resources

{{#each resources}}
{{#if this.kind}}
  {{!-- This is a single resource type (e.g., Namespaces) --}}
  {{#if this.namespace}}
  ## Resource: {{this.kind}} (Namespace: {{this.namespace}})
  {{else}}
  ## Resource: {{this.kind}}
  {{/if}}
{{else}}
  {{!-- This is a namespace block (FRD-3) with multiple resource types --}}
  ## Resources in Namespace: {{this.namespace}}
{{/if}}
\`\`\`bash
# Command used to generate the output below:
{{{this.command}}}
\`\`\`

\`\`\`
{{{this.output}}}
\`\`\`

{{/each}}

{{!-- Diagnostics Section for Failing Pods --}}
{{#if diagnosticsEnabled}}
{{#if podDiagnostics}}
# Diagnostics for Failing Resources
{{else}}
{{!-- No failing pods found, but diagnostics is enabled --}}
{{/if}}
{{#if podDiagnostics}}

{{#each podDiagnostics}}
---

### Pod: {{this.namespace}}/{{this.podName}}

{{#if this.error}}
**Note:** Error occurred during diagnostics: {{this.error}}
{{/if}}

**Describe Output:**
\`\`\`bash
# Command used:
{{{this.describeCommand}}}
\`\`\`
\`\`\`
{{{this.description}}}
\`\`\`

**Current Logs:**
\`\`\`bash
# Command used:
{{{this.logsCommand}}}
\`\`\`
\`\`\`
{{{this.logs}}}
\`\`\`

{{#if this.prevLogs}}
**Previous Logs:**
\`\`\`bash
# Command used:
{{{this.prevLogsCommand}}}
\`\`\`
\`\`\`
{{{this.prevLogs}}}
\`\`\`
{{/if}}

{{/each}}
{{/if}}
{{/if}}

{{#if instruction}}
# Instruction
{{{instruction}}}
{{/if}}

{{!-- End of Kubernetes Resource Aggregation --}}
`;
};

// Register helpers if needed (e.g., for formatting output or commands)
// Handlebars.registerHelper('formatOutput', (outputContent) => { ... });
