---
'@dexto/core': minor
'@dexto/agent-config': minor
'@dexto/agent-management': minor
'@dexto/image-local': minor
'@dexto/tools-builtins': minor
'@dexto/server': minor
'@dexto/tui': minor
dexto: minor
---

Replace source-composed Skills with one injected exact-name `Skills` implementation and the
`skill_load` tool contract. Local skills use the canonical `.agents/skills` roots, while hosted
storage and resolution remain owned by the host image.
