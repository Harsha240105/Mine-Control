# Build & Run

## Production
```powershell
cd "C:\Users\hshar\Documents\MineCraft Server"
npm run build:server   # Compile server TypeScript → dist/server/
npm run build:client   # Compile frontend React → dist/client/
npm start              # node dist/server/index.js on port 3001
```

Open http://localhost:3001 in browser.

## Dev mode
```powershell
npm run dev  # Vite on :5173, backend on :3001, auto-reload
```

## TypeScript compilation only
```powershell
npm run build:server  # just server (important after editing .ts files)
npm run build:client  # just client (important after editing .tsx/.ts files)
```

`npx vite build` builds ONLY the client. Always run `npm run build:server` separately after server-side edits.

## Database
Path: `MineControl OS\data\minecontrol.db`
