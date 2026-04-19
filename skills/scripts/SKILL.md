---
version: 0.0.1
name: chezmoi-scripts
description: Manage execution scripts (run_once_, run_onchange_, before_, after_) and their lifecycles.
---

## Script file naming prefixes

Scripts in `.chezmoiscripts/` (or anywhere in source) are identified by filename prefix:

| Prefix | Runs when |
| --- | --- |
| `run_` | Every `chezmoi apply` |
| `run_once_` | Once ever (tracked in state database) |
| `run_onchange_` | When the script content changes |
| `run_before_` | Before files are applied |
| `run_after_` | After files are applied |

Prefixes compose left to right: `run_once_before_install-packages.sh`

## Script ordering

Within the same phase (`before`, `after`), scripts run in lexicographic order.
Use numeric prefixes to control order: `run_once_before_00-setup.sh`, `run_once_before_01-packages.sh`.

## Making scripts executable

Scripts must be executable in the source state.
Use `executable_` in the filename: `executable_run_once_before_install.sh`
Or preserve the bit with `chezmoi add --follow`.

## Example: install packages once

```sh
#!/bin/sh
# .chezmoiscripts/run_once_before_install-packages.sh.tmpl

{{ if eq .chezmoi.os "linux" -}}
sudo apt-get install -y git curl
{{ else if eq .chezmoi.os "darwin" -}}
brew install git curl
{{ end -}}
```

## Example: reload shell config on change

```sh
#!/bin/sh
# .chezmoiscripts/run_onchange_after_reload-shell.sh

source ~/.bashrc
```

## Tracking state

Chezmoi records which `run_once_` scripts have run in `~/.local/share/chezmoi/chezmoistate.boltdb`.

Inspect the state:

```sh
chezmoi state dump
```

Clear all script history (forces re-run of all `run_once_` scripts):

```sh
chezmoi state delete-bucket --bucket=scriptState
```

Clear a specific script:

```sh
chezmoi state delete --bucket=scriptState --key=<hash>
```

## `run_onchange_` content hashing

chezmoi hashes the script content to detect changes.
If the script's text changes (including template output), it re-runs.

## Skipping scripts

Use `--exclude=scripts` to apply files without running scripts:

```sh
chezmoi apply --exclude=scripts
```

Use `--include=scripts` to run only scripts without applying files:

```sh
chezmoi apply --include=scripts
```

## Debugging scripts

Run with `--verbose` to see which scripts are queued and why:

```sh
chezmoi apply --verbose --dry-run
```
