---
name: chezmoi-machine-config
description: Manage multi-machine dotfiles using hostname/OS conditionals, per-machine template data, and conditional ignores.
---

When you need detailed OS branching examples, data merging rules, or WSL detection snippets, scan the `references/` directory.

## Identifying machines

Key built-in variables for distinguishing machines:

- `.chezmoi.os`: Operating system (`"linux"`, `"darwin"`, `"windows"`).
- `.chezmoi.arch`: CPU architecture (`"amd64"`, `"arm64"`).
- `.chezmoi.hostname`: Hostname up to the first `.`.
- `.chezmoi.fqdnHostname`: Fully-qualified hostname.
- `.chezmoi.osRelease`: Linux distribution metadata from `/etc/os-release`.
- `.chezmoi.kernel.osrelease`: Linux kernel release string (used for WSL detection).

Run `chezmoi data` to inspect all variables on the local machine.

## Per-machine data sources

- Config file `[data]` section (generated from `.chezmoi.$FORMAT.tmpl` on init): Dynamic per-machine values such as email, work roles, or prompt inputs.
- `.chezmoidata.$FORMAT` / `.chezmoidata/` files in source state: Static data shared across all machines, read before template evaluation.

## Reference guides

- [os-patterns.md](references/os-patterns.md): Branching patterns for OS, Linux distribution, WSL detection, and hostname conditionals.
- [per-machine-data.md](references/per-machine-data.md): Data source resolution, precedence, and merge semantics.
- [conditional-ignore.md](references/conditional-ignore.md): Conditional ignore rules using `.chezmoiignore.tmpl`.

## Related skills

- Consult `chezmoi-templating` for template syntax, Sprig functions, and variable references.
- Consult `chezmoi-configuration` for config file setup and options.
- Consult `chezmoi-file-attributes` for source attribute prefixes and root control files.
