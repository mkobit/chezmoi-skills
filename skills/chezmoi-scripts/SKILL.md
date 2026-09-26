---
name: chezmoi-scripts
description: Run scripts on apply, once, or on content change — manage run_, run_once_, run_onchange_, run_before_, and run_after_ scripts and their state.
---

When you need execution details, environment variable lists, or state management commands, scan the `references/` directory.

## Script file naming prefixes

| Prefix | Execution trigger |
| --- | --- |
| `run_` | Every `chezmoi apply` |
| `run_once_` | Once per unique content (tracked by SHA256) |
| `run_onchange_` | When script content changes since last run |
| `run_before_` | Before target files are updated |
| `run_after_` | After target files are updated |

Prefixes compose left to right: `run_once_before_00-install-packages.sh`.

## Filtering script execution

- Skip running scripts during apply: `chezmoi apply --exclude=scripts`.
- Run only scripts without modifying files: `chezmoi apply --include=scripts`.

## Reference guides

- [script-execution.md](references/script-execution.md): Execution model, script ordering, environment variables, content hashing, and code examples.
- [state-management.md](references/state-management.md): Managing script execution history and resetting `scriptState` / `entryState` buckets.

## Related skills

- Consult `chezmoi-cli-commands` for `chezmoi state` subcommand flags.
- Consult `chezmoi-templating` for rendering logic in `.tmpl` scripts.
