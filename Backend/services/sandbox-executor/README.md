# Sandbox executor

This is the only mutation-capable process in a repair run. It consumes an immutable mounted task, downloads a bounded source archive, rejects unsafe archive/change paths, applies an explicit file set, and executes a fixed verification profile (`node` or `go`). It never accepts arbitrary shell commands.

The executor emits exactly one machine-readable `SRE_AGENT_RESULT=<json>` log record and exits non-zero when extraction, mutation, or verification fails. The Kubernetes sandbox controller owns its image selection and resource/network isolation.
