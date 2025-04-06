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
  c. The full YAML output of the command in a code block.

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
{{#if this.namespace}}
## Resource: {{this.kind}} (Namespace: {{this.namespace}})
{{else}}
## Resource: {{this.kind}}
{{/if}}
\`\`\`bash
# Command used to generate the output below:
{{{this.command}}}
\`\`\`

\`\`\`yaml
{{{this.yaml}}}
\`\`\`

{{/each}}

{{#if instruction}}
# Instruction
{{{instruction}}}
{{/if}}

{{!-- End of Kubernetes Resource Aggregation --}}
`;
};

// Register helpers if needed (e.g., for formatting YAML or commands)
// Handlebars.registerHelper('formatYaml', (yamlContent) => { ... });
