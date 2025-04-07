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

{{#if instruction}}
# Instruction
{{{instruction}}}
{{/if}}

{{!-- End of Kubernetes Resource Aggregation --}}
`;
};

// Register helpers if needed (e.g., for formatting output or commands)
// Handlebars.registerHelper('formatOutput', (outputContent) => { ... });
