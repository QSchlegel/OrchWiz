# Downloads (Desktop Installers)

This folder is intentionally kept in git, but the actual installer artifacts are not.

The public website serves "latest" aliases from here:

- `/downloads/orchwiz-mac.dmg`
- `/downloads/orchwiz-win.exe`
- `/downloads/orchwiz-linux.tar.gz`

Those files are expected to be populated during deploy (or locally) by running:

```bash
cd node
npm run downloads:sync
```

Source of truth for versioned installers is GitHub Releases. The sync script mirrors the latest release assets into these stable filenames and also writes `/downloads/manifest.json`.

## Local Builds (No GitHub Release Yet)

If you have not published GitHub Releases yet, you can still make the stable `/downloads/*` aliases work locally:

```bash
cd desktop
npm run dist

cd ../node
npm run downloads:mirror-local
```

That mirrors the newest matching artifacts from `desktop/dist-app/` into `node/public/downloads/` (and generates `manifest.json` with SHA-256 checksums).
