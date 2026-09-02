---
"@linuxcnc-node/types": minor
"@linuxcnc-node/grpc-client": patch
---

Expose nine-axis tool wear offsets in status and preserve omitted tool-table
fields and coordinate tails during partial `setTool` updates. Route tool
upsert, relocation, and deletion through LinuxCNC-owned transactional NML
commands with validation, durable persistence, and normal command completion.
Remote CRUD supports file-backed random and nonrandom tool tables;
the pinned LinuxCNC build rejects `DB_PROGRAM` during IO initialization.
