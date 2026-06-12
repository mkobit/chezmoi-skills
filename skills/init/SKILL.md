---
name: chezmoi-init
description: Bootstrap chezmoi on a new machine, clone an existing dotfiles repo, migrate existing dotfiles, or run one-shot init scripts.
---

## First-time initialization

See [`references/setup.md`](references/setup.md) for more details.

```sh
chezmoi init
```

Creates the source directory at `~/.local/share/chezmoi` as a git repository.
If the source directory contains a `.chezmoi.$FORMAT.tmpl` file, generates the config file from that template.
Does not apply any files — run `chezmoi apply` separately.
Re-running `chezmoi init` with no repo regenerates the config file (e.g. after editing the config template).

## Initialize from an existing dotfiles repo

```sh
chezmoi init https://github.com/user/dotfiles.git
```

Use `--apply` to clone and apply in one step:

```sh
chezmoi init --apply https://github.com/user/dotfiles.git
```

Use `--purge` to remove the source, config, and cache directories after applying (useful for ephemeral environments):

```sh
chezmoi init --apply --purge https://github.com/user/dotfiles.git
```

Use `--one-shot` for transitory environments (e.g. containers) — equivalent to `--apply --depth=1 --force --purge --purge-binary`:

```sh
chezmoi init --one-shot user/dotfiles
```

## Repo URL guessing

```sh
chezmoi init user           # https://user@github.com/user/dotfiles.git
chezmoi init user/myrepo    # https://user@github.com/user/myrepo.git
chezmoi init gitlab.com/user/myrepo  # https://user@gitlab.com/user/myrepo.git
```

Pass `--ssh` to guess SSH URLs instead (`git@github.com:user/dotfiles.git`), or `--guess-repo-url=false` to disable guessing.
See [`references/commands.md`](references/commands.md) for the full pattern table.

## Overriding directories

`--source`, `--destination`, and `--config` are global flags, not init-specific — see the chezmoi-cli-commands skill.
Init's own `-C`/`--config-path` flag writes the generated config file to a different location.

```sh
chezmoi init --source ~/.dotfiles
chezmoi init --config-path /path/to/chezmoi.toml
```

To persist a custom source directory, set the `sourceDir` config option (see the chezmoi-configuration skill).
See [`references/commands.md`](references/commands.md) for full init flag details.

## One-line bootstrap on a new machine

Install chezmoi, clone the repo, and apply in a single command:

```sh
sh -c "$(curl -fsLS https://get.chezmoi.io)" -- init --apply user/dotfiles
```

For transitory environments, use `--one-shot` to also remove all traces of chezmoi afterwards:

```sh
sh -c "$(curl -fsLS https://get.chezmoi.io)" -- init --one-shot user/dotfiles
```

## Handling existing files

If a target file has been modified since chezmoi last wrote it, `chezmoi apply` prompts before overwriting.
Preview changes with `chezmoi diff`, overwrite without prompting with `chezmoi apply --force`, or merge with `chezmoi merge <file>`.

To incorporate existing dotfiles into chezmoi:

```sh
chezmoi add ~/.bashrc ~/.gitconfig
```

## Custom source directory

```sh
chezmoi init --source ~/.dotfiles
```

This overrides the source directory for chezmoi commands. It does not set up a bare repository.
Then migrate files using `chezmoi add`.

## Verifying the initialized state

```sh
chezmoi doctor         # check for problems
chezmoi data           # confirm template data loaded
chezmoi diff           # preview what would be applied
chezmoi managed        # list managed files
```

## Re-initialization

To reset and start over (destructive):

```sh
chezmoi purge --binary  # removes source dir, config, and chezmoi binary
chezmoi init            # start fresh
```
