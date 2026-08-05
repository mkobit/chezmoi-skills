---
name: chezmoi-init
description: Bootstrap chezmoi on a new machine, clone an existing dotfiles repo, migrate existing dotfiles, or run one-shot init scripts.
---

When you need detailed flag specifications, URL resolution rules, or installation script variants, scan the `references/` directory.

## First-time initialization

Initialize chezmoi on a fresh machine or clone an existing repository:

- `chezmoi init`: Create source directory at `~/.local/share/chezmoi` and generate config file from `.chezmoi.$FORMAT.tmpl`.
- `chezmoi init <repo>`: Clone remote dotfiles repository into source directory and generate config file.
- `chezmoi init --apply <repo>`: Clone repository and immediately apply dotfiles.
- `chezmoi init --one-shot <repo>`: Clone, apply, and purge all chezmoi traces (useful for ephemeral container environments).

## One-line bootstrap scripts

Install chezmoi and apply dotfiles in a single command on a new machine:

```sh
sh -c "$(curl -fsLS https://get.chezmoi.io)" -- init --apply user/dotfiles
```

## Reference guides

- [setup.md](references/setup.md): Complete setup overview, config file auto-generation details, and installation scripts.
- [commands.md](references/commands.md): Flag reference for `chezmoi init` (`--apply`, `--one-shot`, `--purge`, `--config-path`) and default URL guessing patterns.

## Related skills

- Consult `chezmoi-cli-commands` for global flags (`--source`, `--destination`) and post-init operations (`apply`, `diff`, `doctor`, `managed`).
- Consult `chezmoi-configuration` for configuring `sourceDir` and top-level options.
