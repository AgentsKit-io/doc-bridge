# Doc Bridge for Obsidian

Desktop companion for refreshing a generated doc-bridge vault and reviewing drift findings.

Build with `npm install && npm run build`, then copy `main.js`, `manifest.json`, and `styles.css` into a vault using `node scripts/install.mjs <vault-path>`. Set the repository root in plugin settings and use **Refresh from doc-bridge**. The plugin runs `ak-docs index` followed by `ak-docs vault export --findings --json`.

The plugin reads tags and titles from Obsidian's metadata cache. Graph colours come from the exporter's `.obsidian/graph.json`; the plugin does not modify that file.
