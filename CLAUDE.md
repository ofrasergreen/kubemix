# KubeMix Development Guide

## Build & Test Commands
- Build: `npm run build`
- Lint: `npm run lint`
- Test all: `npm run test`
- Test single file: `npm run test -- path/to/test.ts`
- Test coverage: `npm run test-coverage`

## Code Style Guidelines
- TypeScript with strict typing
- Biome for formatting (2-space indent, 120 char line width)
- Use camelCase for variables/functions, PascalCase for types/classes
- Export types/interfaces separately from implementations
- Always use semicolons, single quotes, trailing commas
- Descriptive error classes extending KubeAggregatorError base
- Centralized error handling with shared/errorHandle.ts
- Use logger.ts for consistent logging with appropriate levels
- Follow Kubernetes resource naming conventions in core services