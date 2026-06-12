# Conditional ignore

Ignoring files per machine with a templated `.chezmoiignore`.

## Rules

- `.chezmoiignore` is always interpreted as a template, with or without a `.tmpl` extension.
- Patterns match the **target** path (e.g., `.work`), not the source path (`dot_work`).
- Patterns use doublestar matching (`*`, `**`).
- Prefix a pattern with `!` to exclude it from ignoring; all excludes take priority over all includes.
- `.chezmoiignore` files in source subdirectories apply only to that subdirectory.
- Comments start with `#` (mid-line `#` must be preceded by whitespace).

## Inverted logic

chezmoi installs everything by default, so per-machine management is written as "ignore unless":

```gotmpl
{{- if ne .chezmoi.hostname "work-laptop" }}
.work
{{- end }}
```

This means: only manage `.work` on `work-laptop`.

## Branching on OS, hostname, and data flags

```gotmpl
README.md

{{- if ne .chezmoi.os "darwin" }}
Library/
{{- end }}

{{- if ne .chezmoi.os "windows" }}
AppData/
{{- end }}

{{- if not .work }}
.config/work-tool/
{{- end }}
```

## Pattern semantics

```gotmpl
*.txt       # *.txt at the top level of the target directory
*/*.txt     # *.txt one level down, not deeper
backups/    # the directory itself, not its contents
backups/**  # contents, not the directory itself
dir/f*
!dir/foo    # ignore dir/f* except dir/foo
```

## Inspecting

```sh
chezmoi ignored    # list targets ignored on this machine
```

## Interactions

If a `.chezmoiexternal.$FORMAT` file is located in an ignored directory, all entries within it are also ignored.
