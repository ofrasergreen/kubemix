// src/core/processing/__tests__/resourceProcessor.test.ts
import { describe, expect, it } from 'vitest';
import type { KubeAggregatorConfigMerged } from '../../../src/config/configSchema.js';
import {
  processJsonResourceManifest,
  processResourceManifest,
} from '../../../src/core/processing/resourceProcessor.js';

// Create a mock config that has the required properties for type checking
const createMockConfig = (redactSecrets: boolean): KubeAggregatorConfigMerged => {
  return {
    cwd: '/test',
    output: {
      filePath: 'test.md',
      style: 'markdown',
    },
    kubernetes: {
      outputFormat: 'yaml',
    },
    filter: {
      excludeNamespaces: [],
      excludeResourceTypes: [],
    },
    security: {
      redactSecrets,
    },
  };
};

describe('processResourceManifest', () => {
  it('redacts Secret data in YAML format', () => {
    const yamlString = `
apiVersion: v1
kind: Secret
metadata:
  name: test-secret
type: Opaque
data:
  username: YWRtaW4=
  password: c3VwZXJzZWNyZXQ=
`;

    const config = createMockConfig(true);

    const result = processResourceManifest(yamlString, config);
    expect(result).toContain('name: test-secret');
    expect(result).not.toContain('YWRtaW4=');
    expect(result).not.toContain('c3VwZXJzZWNyZXQ=');
    expect(result).toContain('username: "*****"');
    expect(result).toContain('password: "*****"');
  });

  it('handles multiple YAML documents', () => {
    const yamlString = `
apiVersion: v1
kind: Service
metadata:
  name: test-service
spec:
  ports:
  - port: 80
---
apiVersion: v1
kind: Secret
metadata:
  name: test-secret
type: Opaque
data:
  username: YWRtaW4=
  password: c3VwZXJzZWNyZXQ=
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: test-configmap
data:
  config.json: '{}'
`;

    const config = createMockConfig(true);

    const result = processResourceManifest(yamlString, config);
    expect(result).toContain('name: test-service');
    expect(result).toContain('name: test-secret');
    expect(result).toContain('name: test-configmap');
    expect(result).not.toContain('YWRtaW4=');
    expect(result).not.toContain('c3VwZXJzZWNyZXQ=');
    expect(result).toContain('username: "*****"');
    expect(result).toContain('password: "*****"');
    expect(result).toContain("config.json: '{}'");
  });

  it('handles nested YAML documents with secrets', () => {
    const yamlString = `
apiVersion: v1
items:
- apiVersion: v1
  kind: Service
  metadata:
    name: test-service
  spec:
    ports:
    - port: 80
- apiVersion: v1
  kind: Secret
  metadata:
    name: test-secret
  type: Opaque
  data:
    username: YWRtaW4=
    password: c3VwZXJzZWNyZXQ=
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: test-configmap
data:
  config.json: '{}'
`;

    const config = createMockConfig(true);

    const result = processResourceManifest(yamlString, config);
    expect(result).toContain('name: test-service');
    expect(result).toContain('name: test-secret');
    expect(result).toContain('name: test-configmap');
    expect(result).not.toContain('YWRtaW4=');
    expect(result).not.toContain('c3VwZXJzZWNyZXQ=');
    expect(result).toContain('username: "*****"');
    expect(result).toContain('password: "*****"');
    expect(result).toContain("config.json: '{}'");
  });

  it('does not redact when redactSecrets is false', () => {
    const yamlString = `
apiVersion: v1
kind: Secret
metadata:
  name: test-secret
type: Opaque
data:
  username: YWRtaW4=
  password: c3VwZXJzZWNyZXQ=
`;

    const config = createMockConfig(false);

    const result = processResourceManifest(yamlString, config);
    expect(result).toContain('username: YWRtaW4=');
    expect(result).toContain('password: c3VwZXJzZWNyZXQ=');
  });

  it('handles invalid YAML gracefully', () => {
    const yamlString = `
This is not valid YAML
but the function should not crash
`;

    const config = createMockConfig(true);

    const result = processResourceManifest(yamlString, config);
    expect(result).toContain('This is not valid YAML');
  });
});

describe('processJsonResourceManifest', () => {
  it('redacts Secret data in single JSON resource', () => {
    const jsonString = JSON.stringify({
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: 'test-secret',
      },
      type: 'Opaque',
      data: {
        username: 'YWRtaW4=',
        password: 'c3VwZXJzZWNyZXQ=',
      },
    });

    const config = createMockConfig(true);

    const result = processJsonResourceManifest(jsonString, config);
    const parsed = JSON.parse(result);

    expect(parsed.metadata.name).toBe('test-secret');
    expect(parsed.data.username).toBe('*****');
    expect(parsed.data.password).toBe('*****');
  });

  it('redacts Secret data in a list of resources', () => {
    const jsonString = JSON.stringify({
      apiVersion: 'v1',
      kind: 'List',
      items: [
        {
          apiVersion: 'v1',
          kind: 'Service',
          metadata: {
            name: 'test-service',
          },
          spec: {
            ports: [{ port: 80 }],
          },
        },
        {
          apiVersion: 'v1',
          kind: 'Secret',
          metadata: {
            name: 'test-secret',
          },
          type: 'Opaque',
          data: {
            username: 'YWRtaW4=',
            password: 'c3VwZXJzZWNyZXQ=',
          },
        },
      ],
    });

    const config = createMockConfig(true);

    const result = processJsonResourceManifest(jsonString, config);
    const parsed = JSON.parse(result);

    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0].kind).toBe('Service');
    expect(parsed.items[1].kind).toBe('Secret');
    expect(parsed.items[1].data.username).toBe('*****');
    expect(parsed.items[1].data.password).toBe('*****');
  });

  it('handles invalid JSON gracefully', () => {
    const jsonString = `
    This is not valid JSON
    but the function should not crash
    `;

    const config = createMockConfig(true);

    const result = processJsonResourceManifest(jsonString, config);
    expect(result).toBe(jsonString);
  });
});
