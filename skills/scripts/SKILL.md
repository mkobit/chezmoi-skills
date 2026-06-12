---
name: chezmoi-scripts
description: Run scripts on apply, once, or on content change — manage run_, run_once_, run_onchange_, run_before_, and run_after_ scripts and their state.
---

## Script file naming prefixes

Scripts in `.chezmoiscripts/` (or anywhere in source) are identified by filename prefix.
For more details, see [Script execution and naming](references/script-execution.md).

| Prefix | Runs when |
| --- | --- |
| `run_` | Every `chezmoi apply` |
| `run_once_` | Once per unique content (SHA256 tracked in state; re-runs if content changes) |
| `run_onchange_` | When the script content changes since the last successful run |
| `run_before_` | Before files are updated |
| `run_after_` | After files are updated |

Prefixes compose left to right: `run_once_before_install-packages.sh`

For `.tmpl` scripts, content is hashed after template execution.
A `run_once_` script with content that already ran (even under a different filename) does not run again.

## Script ordering

Scripts are executed in alphabetical order.
Without `before_`/`after_`, scripts run interleaved with file updates (`run_b.sh` runs after updating `a.txt` and before `c.txt`).
Use numeric prefixes to control order: `run_once_before_00-setup.sh`, `run_once_before_01-packages.sh`.

## Execution model

Scripts do not need the executable bit in the source directory.
chezmoi writes the script contents to a temporary directory with the executable bit set and runs it with `exec(3)`, so the script must start with a `#!` line or be an executable binary.
The working directory is the first existing parent directory in the destination tree.
Create scripts manually in the source directory (`chezmoi cd`); `chezmoi add` does not create them.

If a `.tmpl` script renders to an empty string or only whitespace, it is not executed — useful for disabling scripts dynamically.

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

## Example: re-run when another file changes

Embed a hash of the other file in the script so the script content changes with it:

```sh
#!/bin/bash
# .chezmoiscripts/run_onchange_dconf-load.sh.tmpl
# dconf.ini hash: {{ include "dconf.ini" | sha256sum }}

dconf load / < {{ joinPath .chezmoi.sourceDir "dconf.ini" | quote }}
```

Add `dconf.ini` to `.chezmoiignore` so chezmoi does not create it in the target.

## Tracking state

chezmoi records script state in `chezmoistate.boltdb` in the same directory as its config file (default `~/.config/chezmoi/chezmoistate.boltdb`).
`run_once_` scripts are tracked in the `scriptState` bucket and `run_onchange_` scripts in the `entryState` bucket.
For more details, see [Script state management](references/state-management.md).

Inspect the state:

```sh
chezmoi state dump
```

Force re-run of all `run_once_` scripts:

```sh
chezmoi state delete-bucket --bucket=scriptState
```

Force re-run of all `run_onchange_` scripts:

```sh
chezmoi state delete-bucket --bucket=entryState
```

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

In verbose mode, script contents are printed before execution; in dry-run mode, scripts are not executed:

```sh
chezmoi apply --verbose --dry-run
```

`chezmoi status` lists scripts that would run with status `R`.
