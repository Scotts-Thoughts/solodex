# Build Instructions

## Development

```bash
npm run dev
```

Starts the Electron app in dev mode with hot reload.

## Production Builds

### Compile only (no installer)

```bash
npm run build
```

Compiles the renderer and main process via `electron-vite`. Output goes to `out/`. Does **not** produce an executable.

### Windows installer

```bash
npm run build:win
```

Compiles the app then runs `electron-builder --win` to produce an NSIS installer. Output goes to `dist/`.

### macOS app

```bash
npm run build:mac
```

Compiles the app then runs `electron-builder --mac`. Output goes to `dist/`.
