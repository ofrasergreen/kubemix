// src/core/output/outputStyles/xmlStyle.ts
export const getXmlTemplate = () => {
  // Note: Adapt placeholders (e.g., generationHeader, summary*) from outputStyleDecorate.ts
  return /* xml */ `
  {{{generationHeader}}}

  {{#if preambleEnabled}}
  <cluster_summary>
  This section contains a summary of the aggregated Kubernetes resources.

  <purpose>
  {{{summaryPurpose}}}
  </purpose>

  <file_format>
  {{{summaryFileFormat}}}
  4. Kubernetes resources, each consisting of:
    - Resource kind, name, and namespace as attributes.
    - The kubectl command used to fetch the resource.
    - The full output of the resource.
  </file_format>

  <usage_guidelines>
  {{{summaryUsageGuidelines}}}
  </usage_guidelines>

  <notes>
  {{{summaryNotes}}}
  </notes>

  {{#if headerText}}
  <additional_info>
  <user_provided_header>
  {{{headerText}}}
  </user_provided_header>
  </additional_info>
  {{/if}}

  </cluster_summary>
  {{/if}}

  {{#if resourceTreeEnabled}}
  <cluster_resource_overview>
  {{{resourceTreeString}}}
  </cluster_resource_overview>
  {{/if}}

  <resources>
  This section contains the output of the aggregated Kubernetes resources.

  <resource kind="{{resourceKind}}">
    <command_used>
      <![CDATA[
  {{{kubectlCommand}}}
      ]]>
    </command_used>
    <manifest>
      <![CDATA[
  {{{resourceOutput}}}
      ]]>
    </manifest>
  </resource>

  {{!-- Placeholder for iterating over multiple resource types later --}}
  {{!--
  {{#each resources}}
  <resource kind="{{this.kind}}" name="{{this.metadata.name}}" {{#if this.metadata.namespace}}namespace="{{this.metadata.namespace}}"{{/if}}>
    <command_used>
      <![CDATA[
  {{{this.command}}}
      ]]>
    </command_used>
    <manifest>
      <![CDATA[
  {{{this.output}}}
      ]]>
    </manifest>
  </resource>
  {{/each}}
  --}}

  </resources>

  {{#if instruction}}
  <instruction>
  {{{instruction}}}
  </instruction>
  {{/if}}

  {{!-- End of Kubernetes Resource Aggregation --}}
  `;
};
