// src/core/output/outputStyles/plainStyle.ts

const PLAIN_SEPARATOR = '='.repeat(16);
const PLAIN_LONG_SEPARATOR = '='.repeat(64);

export const getPlainTemplate = () => {
  // Note: Adapt placeholders (e.g., generationHeader, summary*) from outputStyleDecorate.ts
  return `
{{{generationHeader}}}

{{#if preambleEnabled}}
${PLAIN_LONG_SEPARATOR}
Cluster Summary
${PLAIN_LONG_SEPARATOR}

Purpose:
--------
{{{summaryPurpose}}}

File Format:
------------
{{{summaryFileFormat}}}
4. Resource details, each consisting of:
  a. A separator line (================)
  b. Resource kind indication (e.g., Resource: Namespaces)
  c. The kubectl command used
  d. Another separator line
  e. The full YAML output of the command
  f. A blank line

Usage Guidelines:
-----------------
{{{summaryUsageGuidelines}}}

Notes:
------
{{{summaryNotes}}}

{{#if headerText}}
Additional Info:
----------------
User Provided Header:
{{{headerText}}}
{{/if}}

{{/if}}
{{#if resourceTreeEnabled}}
${PLAIN_LONG_SEPARATOR}
Cluster Resource Overview
${PLAIN_LONG_SEPARATOR}
{{{resourceTreeString}}}

{{/if}}
${PLAIN_LONG_SEPARATOR}
Resources
${PLAIN_LONG_SEPARATOR}

${PLAIN_SEPARATOR}
Resource: {{resourceKind}}
Command Used: {{{kubectlCommand}}}
${PLAIN_SEPARATOR}
{{{resourceYamlOutput}}}


{{!-- Placeholder for iterating over multiple resource types later --}}
{{!--
{{#each resources}}
${PLAIN_SEPARATOR}
Resource: {{this.kind}} ({{this.metadata.name}}{{#if this.metadata.namespace}} in {{this.metadata.namespace}}{{/if}})
Command Used: {{{this.command}}}
${PLAIN_SEPARATOR}
{{{this.yaml}}}

{{/each}}
--}}

{{#if instruction}}
${PLAIN_LONG_SEPARATOR}
Instruction
${PLAIN_LONG_SEPARATOR}
{{{instruction}}}
{{/if}}

${PLAIN_LONG_SEPARATOR}
End of Kubernetes Resource Aggregation
${PLAIN_LONG_SEPARATOR}
`;
};
