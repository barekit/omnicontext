# @barekit/omnicontext-core

**The shared foundation for OmniContext — schemas, constants, file I/O, git watcher, profile manager, and MCP config auto-wiring.**

OmniContext eliminates "context drift" when switching between AI coding assistants by providing a standardized, local Model Context Protocol (MCP) server that tracks your project's active task, blockers, and rules.

This package (`@barekit/omnicontext-core`) provides the core logic and schemas used by the CLI and MCP server:

-   **Schemas & Validation**: Zod-based schemas for tasks, blockers, logs, and context.
-   **File I/O**: State loading/saving inside the `.omnicode/` directory.
-   **Codebase Indexer**: full-text search index powered by Orama.
-   **Git Watcher**: cross-platform FS watcher for Git HEAD/branch change tracking.
-   **Smart Reader**: token-budget-aware file reading (signatures, relevant blocks, full).
-   **Profile Manager**: branch-aware context backup and swap management.

## Installation

```bash
npm install @barekit/omnicontext-core
```

## License

MIT
