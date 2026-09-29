---
"@agentskit/doc-bridge": patch
---

Redact more real token shapes: Slack (`xoxb-`/`xoxp-`/`xoxa-`/`xoxr-`/`xoxs-`/`xapp-`), OpenAI (`sk-`, `sk-proj-`), Anthropic (`sk-ant-`), all GitHub token prefixes, AWS `ASIA` ids, Google API keys, Stripe restricted keys, npm tokens, `Bearer` credentials and PEM private key blocks. The list is exported once as `SECRET_PATTERNS` (with `containsSecret`), and the memory promotion safety scan now uses it too.
