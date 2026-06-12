---
name: chezmoi-machine-config
description: 'Manage dotfiles across multiple machines: hostname and OS conditionals in templates, per-machine data with .chezmoidata, conditional .chezmoiignore, and machine-specific config patterns.'
---

## Identifying the machine

Template variables that distinguish machines: `.chezmoi.hostname`, `.chezmoi.os`, `.chezmoi.arch`, `.chezmoi.osRelease`.

[Read more about OS and hostname patterns in references/os-patterns.md](references/os-patterns.md)

## Per-machine data

Define machine-specific values in the config file's `[data]` section or in `.chezmoidata` files, then branch on them in templates.

[Read more in references/per-machine-data.md](references/per-machine-data.md)

## Conditional ignore

`.chezmoiignore` is a template: ignore files on machines where they do not apply.

[Read more in references/conditional-ignore.md](references/conditional-ignore.md)

## Related skills

- Template syntax and functions: chezmoi-templating skill.
- Config file options and `chezmoi init` prompting: chezmoi-configuration skill.
