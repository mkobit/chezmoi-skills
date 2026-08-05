---
name: chezmoi-configuration
description: Configure chezmoi settings including file locations, template data, tools, hooks, and git integration.
---

When you need detailed configuration keys, schema tables, or advanced options, scan the `references/` directory.

## Config file location

chezmoi reads its config file from `~/.config/chezmoi/chezmoi.$FORMAT`, where `$FORMAT` is `json`, `jsonc`, `toml`, or `yaml`.
Use `chezmoi doctor` to confirm the active configuration path.

## Key configuration areas

- [core.md](references/core.md): Top-level configuration options (`sourceDir`, `destDir`, `umask`, `pager`, `color`, `mode`).
- [data.md](references/data.md): Data injection options (`[data]`, `.chezmoidata.$FORMAT` files).
- [tools.md](references/tools.md): Tool integration for editing (`[edit]`), diffing (`[diff]`), and three-way merging (`[merge]`).
- [hooks.md](references/hooks.md): Operation lifecycle hooks (`.pre` and `.post`) for commands and git events.
- [git.md](references/git.md): Git integration options (`autoCommit`, `autoPush`, `commitMessageTemplate`).

## Related skills

- Consult `chezmoi-secrets-management` for `encryption` (`age` or `gpg`) setup.
- Consult `chezmoi-machine-config` for machine-specific configuration templates (`.chezmoi.$FORMAT.tmpl`).
