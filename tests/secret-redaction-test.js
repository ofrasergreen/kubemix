// Simple test for secret redaction functionality
const { processResourceManifest, processJsonResourceManifest } = require('../lib/core/processing/resourceProcessor.js');

// Create a test config object
const config = {
  security: {
    redactSecrets: true,
  },
};

// Test YAML secret redaction
const testYaml = `apiVersion: v1
kind: Secret
metadata:
  name: test-secret
  namespace: default
type: Opaque
data:
  username: dXNlcg==
  password: cGFzc3dvcmQ=
`;

console.log('Original YAML:');
console.log(testYaml);
console.log('\nRedacted YAML:');
const redactedYaml = processResourceManifest(testYaml, config);
console.log(redactedYaml);

// Test JSON secret redaction
const testJson = JSON.stringify({
  apiVersion: 'v1',
  kind: 'Secret',
  metadata: {
    name: 'test-secret',
    namespace: 'default',
  },
  data: {
    username: 'dXNlcg==',
    password: 'cGFzc3dvcmQ=',
  },
});

console.log('\nOriginal JSON:');
console.log(testJson);
console.log('\nRedacted JSON:');
const redactedJson = processJsonResourceManifest(testJson, config);
console.log(redactedJson);
