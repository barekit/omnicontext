# @barekit/omnicontext-core

**The shared foundation for OmniContext — schemas, constants, file I/O, session registry, codebase map, git watcher, profile manager, and MCP config auto-wiring.**

OmniContext eliminates "context drift" when switching between AI coding assistants by providing a standardized, local Model Context Protocol (MCP) server that tracks your project's active task, blockers, and rules.

This package (`@barekit/omnicontext-core`) provides the core logic and schemas used by the CLI and MCP server:

-   **Schemas & Validation**: Zod-based schemas for tasks, blockers, logs, sessions, and context.
-   **File I/O**: State loading/saving, auto-compaction, and health reporting inside `.omnicode/`.
-   **Config Manager**: Project-level configuration loader and threshold overrides (`.omnicode/config.json`).
-   **Auto Handoff Summary**: Automated markdown summary generator capturing git diff stats and session activity.
-   **Session Registry**: Concurrent agent session lock management and multi-chat collision detection.
-   **Codebase Map**: Lightweight project file tree, docstring summary extractor, and symbol index.
-   **Codebase Indexer**: Full-text search index powered by Orama.
-   **Git Watcher**: Cross-platform FS watcher for Git HEAD/branch change tracking.
-   **Smart Reader**: Token-budget-aware file reading (signatures, relevant blocks, full).
-   **Profile Manager**: Branch-aware context backup and swap management.

## Installation

```bash
npm install @barekit/omnicontext-core
```

## License

MIT
