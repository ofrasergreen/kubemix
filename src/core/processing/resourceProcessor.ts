// src/core/processing/resourceProcessor.ts

import * as yaml from 'yaml';
import type { KubeAggregatorConfigMerged } from '../../config/configSchema.js';
import { logger } from '../../shared/logger.js';

/**
 * Placeholder string used to replace secret values
 */
const SECRET_REDACTION_PLACEHOLDER = '*****';

/**
 * Processes YAML content containing Kubernetes resources, applying redaction rules
 * based on the configuration.
 *
 * @param yamlString - The YAML string to process, potentially containing multiple resources
 * @param config - The merged configuration object
 * @returns The processed YAML string with secrets potentially redacted
 */
export const processResourceManifest = (yamlString: string, config: KubeAggregatorConfigMerged): string => {
  // If the YAML string is empty or redaction is disabled, return as is
  if (!yamlString) {
    logger.debug('Empty YAML string, skipping redaction');
    return yamlString;
  }

  if (!config.security?.redactSecrets) {
    logger.debug('Secret redaction disabled in config, skipping redaction');
    return yamlString;
  }

  logger.debug(`Processing YAML string (${yamlString.length} chars) for secret redaction...`);

  // Debug: Log the first 100 chars to help diagnose format issues
  const previewText = yamlString.substring(0, 100).replace(/\n/g, '\\n');
  logger.debug(`YAML content preview: "${previewText}..."`);

  // Additional format verification - if it doesn't look like YAML, log and return
  if (!yamlString.includes('apiVersion:') && !yamlString.includes('kind:')) {
    logger.warn('Content does not appear to be valid YAML/Kubernetes manifest, skipping redaction');
    return yamlString;
  }

  // Attempt to parse the YAML content (which may have multiple documents)
  try {
    // Parse all documents in the YAML string
    const documents = yaml.parseAllDocuments(yamlString);

    // If no documents found, return the original string
    if (!documents.length) {
      return yamlString;
    }

    // Process each document
    let hasProcessedSecrets = false;
    let documentCount = 0;
    let secretCount = 0;

    for (const doc of documents) {
      documentCount++;
      // Skip null or empty documents
      if (!doc || doc.errors?.length) {
        logger.warn(`Skipping invalid YAML document #${documentCount} during processing`);
        continue;
      }

      // Check if the document represents a Secret
      const docJson = doc.toJSON();
      logger.debug(`Document #${documentCount} kind: ${docJson?.kind}`);

      // Process the document and any nested items recursively
      const processDocument = (yamlDoc: yaml.Document.Parsed): { hasProcessedSecrets: boolean; itemCount: number } => {
        let hasProcessedSecrets = false;
        let itemCount = 0;
        const json = yamlDoc.toJSON();

        // If this is a Secret, process it
        if (json?.kind === 'Secret') {
          secretCount++;
          if (json?.data) {
            logger.debug(`Found Secret resource with data field: ${Object.keys(json.data).join(', ')}`);
            // This is a Secret with a data field - redact the values
            redactSecretData(yamlDoc);
            hasProcessedSecrets = true;
          } else {
            logger.debug('Found Secret resource without data field, nothing to redact');
          }
        }

        // If this document has items, process them recursively
        const itemsNode = yamlDoc.get('items');
        if (itemsNode && yaml.isSeq(itemsNode)) {
          for (let i = 0; i < itemsNode.items.length; i++) {
            const item = itemsNode.items[i];
            if (yaml.isMap(item)) {
              itemCount++;
              // Create a new document from the item
              const itemDoc = yaml.parseDocument(yaml.stringify(item));
              const { hasProcessedSecrets: hasProcessedItemSecrets } = processDocument(itemDoc);
              if (hasProcessedItemSecrets) {
                // Replace the original item with the processed one
                itemsNode.set(i, itemDoc.contents);
                hasProcessedSecrets = true;
              }
            }
          }
        }

        return { hasProcessedSecrets, itemCount };
      };

      const { hasProcessedSecrets: hasProcessedSecretsInDoc, itemCount } = processDocument(doc);
      hasProcessedSecrets = hasProcessedSecrets || hasProcessedSecretsInDoc;

      logger.debug(`Processed document #${documentCount} (${itemCount} items)`);

      if (!hasProcessedSecretsInDoc) {
        logger.debug(`No secrets found in document #${documentCount} (${itemCount} items)`);
      }
    }

    if (hasProcessedSecrets) {
      logger.debug(`Successfully redacted data in ${secretCount} Secret resources`);
    } else if (secretCount > 0) {
      logger.debug(`Found ${secretCount} Secret resources but none had data to redact`);
    } else {
      logger.debug(`No Secret resources found in ${documentCount} YAML documents`);
    }

    // Convert all documents back to YAML string
    const result = documents.map((doc) => doc.toString({ directives: true })).join('\n---\n');

    // Debug output length and preview
    logger.debug(`YAML output after processing: ${result.length} chars`);
    const outputPreview = result.substring(0, 100).replace(/\n/g, '\\n');
    logger.debug(`Processed YAML preview: "${outputPreview}..."`);

    return result;
  } catch (error) {
    // Log the error but don't fail the main process - return original
    logger.warn(
      `Error processing resource manifest for redaction: ${error instanceof Error ? error.message : String(error)}`,
    );
    return yamlString;
  }
};

/**
 * Processes JSON content containing Kubernetes resources, applying redaction rules
 * based on the configuration.
 *
 * @param jsonString - The JSON string to process
 * @param config - The merged configuration object
 * @returns The processed JSON string with secrets potentially redacted
 */
export const processJsonResourceManifest = (jsonString: string, config: KubeAggregatorConfigMerged): string => {
  // If the JSON string is empty or redaction is disabled, return as is
  if (!jsonString) {
    logger.debug('Empty JSON string, skipping redaction');
    return jsonString;
  }

  if (!config.security?.redactSecrets) {
    logger.debug('Secret redaction disabled in config, skipping redaction');
    return jsonString;
  }

  logger.debug(`Processing JSON string (${jsonString.length} chars) for secret redaction...`);

  // Debug: Log the first 100 chars to help diagnose format issues
  const previewText = jsonString.substring(0, 100).replace(/\n/g, '\\n');
  logger.debug(`JSON content preview: "${previewText}..."`);

  // Additional format verification - if it doesn't look like JSON, log and return
  if (!jsonString.trim().startsWith('{') && !jsonString.trim().startsWith('[')) {
    logger.warn('Content does not appear to be valid JSON, skipping redaction');
    return jsonString;
  }

  try {
    // Parse the JSON
    const resourceData = JSON.parse(jsonString);

    // Check if it's a list of items or a single resource
    let hasProcessedSecrets = false;
    let secretCount = 0;

    if (resourceData.items && Array.isArray(resourceData.items)) {
      // It's a list - process each item
      logger.debug(`Processing a list of ${resourceData.items.length} resources`);

      for (const item of resourceData.items) {
        if (item.kind === 'Secret') {
          secretCount++;
          if (item.data) {
            logger.debug(`Found Secret resource with data field: ${Object.keys(item.data).join(', ')}`);
            // Redact all values in the data field
            for (const key in item.data) {
              if (Object.prototype.hasOwnProperty.call(item.data, key)) {
                item.data[key] = SECRET_REDACTION_PLACEHOLDER;
                hasProcessedSecrets = true;
              }
            }
          } else {
            logger.debug('Found Secret resource without data field, nothing to redact');
          }
        }
      }
    } else if (resourceData.kind === 'Secret') {
      secretCount++;
      if (resourceData.data) {
        logger.debug(`Found a single Secret with data: ${Object.keys(resourceData.data).join(', ')}`);
        // It's a single Secret resource
        for (const key in resourceData.data) {
          if (Object.prototype.hasOwnProperty.call(resourceData.data, key)) {
            resourceData.data[key] = SECRET_REDACTION_PLACEHOLDER;
            hasProcessedSecrets = true;
          }
        }
      } else {
        logger.debug('Found a single Secret without data field, nothing to redact');
      }
    } else {
      logger.debug(`No secrets found in JSON (kind: ${resourceData.kind || 'unknown'})`);
    }

    if (hasProcessedSecrets) {
      logger.debug(`Successfully redacted data in ${secretCount} Secret resource(s)`);
    } else if (secretCount > 0) {
      logger.debug(`Found ${secretCount} Secret resource(s) but none had data to redact`);
    }

    // Convert back to JSON string
    const result = JSON.stringify(resourceData);

    // Debug output length and preview
    logger.debug(`JSON output after processing: ${result.length} chars`);
    const outputPreview = result.substring(0, 100).replace(/\n/g, '\\n');
    logger.debug(`Processed JSON preview: "${outputPreview}..."`);

    return result;
  } catch (error) {
    // Log the error but don't fail the main process - return original
    logger.warn(
      `Error processing JSON resource manifest for redaction: ${error instanceof Error ? error.message : String(error)}`,
    );
    return jsonString;
  }
};

/**
 * Helper function to redact the values in a Secret's data field
 *
 * @param doc - The yaml.Document representing a Secret
 */
function redactSecretData(doc: yaml.Document.Parsed): void {
  try {
    // Get the data field node from the document
    const dataNode = doc.get('data');

    // If data field is missing or not a map, nothing to do
    if (!dataNode) {
      logger.debug('Secret has no data field');
      return;
    }

    if (typeof dataNode !== 'object' || !yaml.isMap(dataNode)) {
      logger.debug(`Secret data field is not a map: ${typeof dataNode}`);
      return;
    }

    logger.debug(`Found data field with ${dataNode.items.length} entries`);

    // Iterate through each key in the data map
    for (const item of dataNode.items) {
      try {
        const key = item.key as string;
        // Replace the value with our placeholder
        dataNode.set(key, SECRET_REDACTION_PLACEHOLDER);
        logger.debug(`Redacted value for key: ${key}`);
      } catch (error) {
        logger.warn(`Error redacting data entry: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Also check for stringData, though it's less common in kubectl output
    const stringDataNode = doc.get('stringData');
    if (stringDataNode && typeof stringDataNode === 'object' && yaml.isMap(stringDataNode)) {
      logger.debug(`Found stringData field with ${stringDataNode.items.length} entries`);
      for (const item of stringDataNode.items) {
        try {
          const key = item.key as string;
          stringDataNode.set(key, SECRET_REDACTION_PLACEHOLDER);
          logger.debug(`Redacted stringData value for key: ${key}`);
        } catch (error) {
          logger.warn(`Error redacting stringData entry: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  } catch (error) {
    logger.warn(`Error in redactSecretData: ${error instanceof Error ? error.message : String(error)}`);
  }
}
