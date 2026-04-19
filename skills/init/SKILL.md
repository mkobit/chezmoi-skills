---
version: 0.0.1
name: chezmoi-init
description: Initialize and set up chezmoi, including bare repository handling and initial configuration.
---

## First-time initialization

```sh
chezmoi init
```

Creates the source directory at `~/.local/share/chezmoi` as a git repository.
Does not apply any files — run `chezmoi apply` separately.

## Initialize from an existing dotfiles repo

```sh
chezmoi init https://github.com/user/dotfiles.git
```

Use `--apply` to clone and apply in one step:

```sh
chezmoi init --apply https://github.com/user/dotfiles.git
```

Use `--purge` to remove the source dir after applying (useful for ephemeral environments):

```sh
chezmoi init --apply --purge https://github.com/user/dotfiles.git
```

## GitHub shorthand

```sh
chezmoi init user           # expands to https://github.com/user/dotfiles.git
chezmoi init user/myrepo    # expands to https://github.com/user/myrepo.git
```

## Overriding directories

```sh
chezmoi init --source /path/to/source
chezmoi init --destination /path/to/target
chezmoi init --config /path/to/chezmoi.toml
```

## One-shot initialization script

```sh
sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply user/dotfiles
```

## Handling existing files

If a target file already exists and differs from the source state, `chezmoi apply` will report a conflict.
Resolve with `chezmoi merge <file>` or overwrite with `chezmoi apply --force`.

To incorporate existing dotfiles into chezmoi:

```sh
chezmoi add ~/.bashrc ~/.gitconfig
```

## Bare repository setup

```sh
chezmoi init --source ~/.dotfiles
```

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
