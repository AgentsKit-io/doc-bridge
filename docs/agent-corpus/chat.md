---
type: module
id: doc-bridge-chat
editRoot: src/intelligence
humanDoc: /docs/chat-and-rag
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/intelligence
validationPath: pnpm test && pnpm typecheck && pnpm docs:typecheck
---

# Chat and RAG

Owns optional AgentsKit retrieval and chat after deterministic lookup. Conversational UI belongs to the chat surface; enterprise orchestration belongs to the consuming platform.
