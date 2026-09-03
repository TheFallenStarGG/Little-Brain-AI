---
name: Learned word attribution
description: How the admin vocabulary view determines teaching accounts and handles legacy model data.
---

The admin vocabulary view derives teaching attribution from user-authored messages that caused learning: direct Little Brain conversation messages and messages in AI-enabled group rooms. Words that exist only in an older snapshot have no reliable contributor record and must be shown without invented attribution.

**Why:** The original persisted bigram model stored aggregate vocabulary and transitions but no per-word provenance, so retroactively assigning a teacher would be misleading.

**How to apply:** Preserve original chat records when deleting model words, and keep attribution honest when chat history is unavailable, deleted, or predates provenance support.