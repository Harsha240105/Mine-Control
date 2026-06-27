# Contributing to MineControl OS

MineControl OS is a solo-maintained project by Harshavardhan H S. While
contributions are welcome, the project follows a focused development roadmap.

## How to Contribute

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/your-feature`)
3. **Make your changes**
4. **Run the build** (`npm run build`)
5. **Commit with a clear message**
6. **Push and open a Pull Request**

## Guidelines

- Follow the existing code style (TypeScript, React functional components)
- Do not add new npm dependencies without good reason
- Keep the application local-first — no cloud dependencies
- Test on both Windows and Linux if possible
- Update the CHANGELOG.md with your changes

## Development Setup

```bash
git clone https://github.com/Harsha240105/Mine-Control.git
cd Mine-Control
npm install
npm run dev
```

## Code Standards

- TypeScript strict mode
- React 18 functional components with hooks
- Tailwind CSS for styling
- SQLite via better-sqlite3 for persistence
- Express + Socket.IO for the backend API

## Pull Request Process

1. Ensure all builds pass (`npm run build`)
2. Update the README if your change affects user-facing features
3. Your PR will be reviewed within 7 days

## Questions?

Open a GitHub Discussion or Issue for any questions.
