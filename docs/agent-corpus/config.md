---
type: module
id: doc-bridge-config
editRoot: src/config
humanDoc: /docs/spec/config-v1
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/config
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/config
---

# Config

Owns finding, parsing, validating and defaulting the repository's configuration, and the enums every
other area validates against.

`loadConfig` walks up from a start directory for the first `doc-bridge.config.{ts,js,mjs,json}`, or a
`package.json` carrying a `docBridge` key. A `.ts`/`.js` config is read as a **static object literal**
through `parseStaticJsObject` — nothing is executed, so a config that computes its value at runtime
will not load. `doc-bridge.config.yaml` is in the candidate list but rejected on purpose: the loader
throws `YAML config is not supported yet`. Do not document YAML as a supported format.

Input is validated by `DocBridgeConfigV1Schema`, then `applyConfigDefaults` fills what the caller left
out — corpus `include`/`exclude`, `index.outFile` of `.doc-bridge/index.json`, `contentHash` of
`sha256-normalized-v1`, the llms.txt and capabilities outputs, `gates.preset` of `minimal` and
`rules.mode` of `default`.

`schema.ts` is also where `RuleIdSchema` and the gate id enums live, so adding a gate or a rule means
editing this area as well as the one that implements it. `resolveProjectRoot` climbs at most twelve
levels and falls back to the directory it started from rather than failing.
