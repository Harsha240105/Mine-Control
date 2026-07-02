# Contributing to MineControl OS

MineControl OS is a solo-maintained project by Harshavardhan H S. While
contributions are welcome, the project follows a focused development roadmap.

## How to Contribute

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/your-feature`)
3. **Make your changes**
4. **Run the build** (`npm run build`)
5. **Run type checking** (`npm run typecheck`)
6. **Run lint** (`npm run lint`)
7. **Commit with a clear message**
8. **Push and open a Pull Request**

## Guidelines

- Follow the existing code style (TypeScript, React functional components)
- Do not add new npm dependencies without good reason
- Keep the application local-first — no cloud dependencies
- Test on both Windows and Linux if possible
- Update the CHANGELOG.md with your changes
- Update the README.md if your change affects user-facing features
- Update docs/ if your change affects the API or architecture

## Development Setup

```bash
git clone https://github.com/Harsha240105/Mine-Control.git
cd Mine-Control
npm install
npm run dev
```

See [docs/development-guide.md](docs/development-guide.md) for detailed development instructions.

## Code Standards

- TypeScript strict mode
- React 18 functional components with hooks
- Tailwind CSS for styling (no CSS modules or styled-components)
- SQLite via better-sqlite3 for persistence (synchronous API, prepared statements)
- Express + Socket.IO for the backend API
- All routes require `authMiddleware` (except login)

## Pull Request Process

1. Ensure all checks pass:
   - `npm run build` — production build compiles
   - `npm run typecheck` — TypeScript strict mode passes
   - `npm run lint` — no ESLint warnings
2. Update CHANGELOG.md with your changes
3. Update README.md if your change affects user-facing features
4. Update docs/ if your change affects the API or architecture
5. Do not add new npm dependencies without good reason
6. Maintain the local-first, no-cloud-dependency principle
7. Your PR will be reviewed within 7 days

## Issue Templates

Choose the appropriate template when opening an issue:
- [Bug Report](https://github.com/Harsha240105/Mine-Control/issues/new?template=bug_report.md) — Something isn't working
- [Feature Request](https://github.com/Harsha240105/Mine-Control/issues/new?template=feature_request.md) — New feature idea
- [Performance Report](https://github.com/Harsha240105/Mine-Control/issues/new?template=performance_report.md) — Lag, high CPU/memory
- [Documentation Issue](https://github.com/Harsha240105/Mine-Control/issues/new?template=documentation_report.md) — Docs feedback
- [Question](https://github.com/Harsha240105/Mine-Control/issues/new?template=question.md) — How-to questions

## Questions?

Open a [GitHub Discussion](https://github.com/Harsha240105/Mine-Control/discussions) or use the in-app Feedback Center.
