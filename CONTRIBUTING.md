# Contributing to OmniContext

Thank you for your interest in contributing! OmniContext is an open-source project and we welcome contributions of all kinds.

## Development Setup

### Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 9 (installed via `corepack enable pnpm`)

### Getting Started

```bash
# Clone the repository
git clone https://github.com/barekit/omnicontext.git
cd omnicontext

# Install dependencies
pnpm install

# Build all packages
pnpm turbo run build

# Run tests
pnpm turbo run test
```

### Project Structure

| Path | Description |
|------|-------------|
| `packages/core/` | Shared Zod schemas, file I/O, git watcher, profile manager |
| `apps/cli/` | Commander.js CLI + MCP server |

### Development Workflow

```bash
# Watch mode — rebuilds on changes
pnpm turbo run dev

# Type-check without building
pnpm turbo run lint

# Run tests
pnpm turbo run test
```

## Contribution Guidelines

### Branch Strategy

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run `pnpm turbo run build && pnpm turbo run test`
5. Commit with a descriptive message
6. Push and open a Pull Request

### Commit Messages

Use clear, descriptive commit messages:

```
feat: add omni rules append command
fix: handle detached HEAD in git watcher
docs: update MCP configuration examples
test: add schema validation edge cases
```

### Code Style

- **TypeScript** with strict mode enabled
- **ESM** modules (`"type": "module"`)
- Use Zod for all runtime validation
- Export types alongside schemas
- Add JSDoc comments for public APIs

### Testing

- Use **vitest** for all tests
- Place tests in `__tests__/` directories adjacent to source
- Cover both happy paths and error cases
- Test Zod schemas with valid and invalid inputs

### Pull Request Process

1. Ensure the build passes: `pnpm turbo run build`
2. Ensure tests pass: `pnpm turbo run test`
3. Update documentation if you're adding/changing public APIs
4. Request review from a maintainer

## Reporting Issues

Please use [GitHub Issues](https://github.com/barekit/omnicontext/issues) to report bugs or request features. Include:

- Steps to reproduce
- Expected vs actual behavior
- Node.js version and OS
- Relevant `.omnicode/` file contents (if applicable)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
