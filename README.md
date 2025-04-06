# KubeMix ☸️

**Aggregate Kubernetes resources into a single, AI-friendly file.**

`kubemix` is a command-line tool designed to gather information about resources within a Kubernetes cluster and consolidate it into a single file. This structured output is optimized for consumption by Large Language Models (LLMs) and other AI tools, making it easier to analyze, troubleshoot, or understand the state of your cluster.

## ✨ Features

* **Kubernetes Resource Aggregation:** Fetches details about various resources (starting with Namespaces).
* **kubectl Powered:** Uses standard `kubectl` commands under the hood, ensuring compatibility and familiarity. The commands used are included in the output for transparency and AI understanding.
* **AI-Friendly Output:** Generates output (initially Markdown) structured for easy parsing by LLMs.
* **Configurable:** Options to filter by namespace, resource type, labels, etc.
* **Extensible:** Built with a modular structure in TypeScript.

## 🤔 Why KubeMix?

Understanding the state of a Kubernetes cluster often involves running multiple `kubectl` commands and piecing together information. Feeding this complex, distributed state into AI models for analysis or assistance can be challenging. `kubemix` aims to simplify this by:

1.  Fetching relevant resource information based on your needs.
2.  Consolidating this information into a single, structured file.
3.  Including the exact `kubectl` commands used, providing context for the AI.
4.  Redacting potentially sensitive information.

## 📋 Prerequisites

*   **Node.js:** Version 18.0.0 or higher.
*   **npm** or **pnpm** or **yarn:** For installation.
*   **kubectl:** Must be installed and configured to access your target Kubernetes cluster(s). The tool uses your current `kubectl` context by default.

## 🚀 Installation

You can run `kubemix` directly using `npx` without installation:

```bash
npx kubemix [options]
```

Or, install it globally:

```bash
# Using npm
npm install -g kubemix

# Using yarn
yarn global add kubemix
```

## 📊 Basic Usage

Run the tool in your terminal. By default (in its initial version), it will fetch all namespaces and output to `kubemix-output.md`:

```bash
kubemix
```

Specify a different output file:

```bash
kubemix -o my-cluster-state.md
```

Specify a different output style (XML and Plain Text available):

```bash
kubemix --style markdown  # default
kubemix --style xml
kubemix --style plain
```

Specify kubeconfig or context:

```bash
kubemix --kubeconfig /path/to/config --context my-cluster-context
```

## 📄 Output Format (Initial - Markdown)

The default Markdown output (`kubemix-output.md`) contains:

```markdown
[Generated Preamble explaining the file content...]

# Cluster Resource Overview
namespace-a
namespace-b
kube-system
...

# Resources

## Resource: Namespaces
```bash
# Command used to generate the output below:
kubectl get namespaces -o yaml
```

```yaml
apiVersion: v1
items:
- apiVersion: v1
  kind: Namespace
  metadata:
    name: namespace-a
  ...
- apiVersion: v1
  kind: Namespace
  metadata:
    name: namespace-b
  ...
...
kind: List
metadata:
  resourceVersion: ""
```

## 🤝 Contributing

Contributions are welcome! 

**Development Setup:**

```bash
git clone https://github.com/USERNAME/kubemix.git
cd kubemix
npm install
npm run build
```

**Running Tests:**

```bash
npm test
npm run test-coverage
```

**Linting:**

```bash
npm run lint
```

## 📜 License

This project is licensed under the ISC License.