---
"@linuxcnc-node/core": patch
---

Build the core NML addon as a standalone client instead of linking the
task-oriented `liblinuxcnc.a` archive. This prevents addon-load failures from
symbols that are only provided by `milltask`.
