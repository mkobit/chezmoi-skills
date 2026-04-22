# Setup and Installation

## Setup overview

chezmoi generates your dotfiles for your local machine. It combines two main sources of data:

1. **The source directory** (`~/.local/share/chezmoi`), which is common to all your machines, and is a clone of your dotfiles repo. Each file that chezmoi manages has a corresponding file in the source directory.
2. **The config file**, typically `~/.config/chezmoi/chezmoi.toml` (although you can use JSON or YAML if you prefer), which is specific to the local machine.

## Automatic config file generation

`chezmoi init` can create a config file automatically, if one does not already exist. If your repo contains a file called `.chezmoi.$FORMAT.tmpl` where `$FORMAT` is one of the supported config file formats (json, jsonc, toml, or yaml) then `chezmoi init` will execute that template to generate your initial config file.

Specifically, if you have `.chezmoi.toml.tmpl` that looks like this:

```toml
{{- $email := promptStringOnce . "email" "Email address" -}}

[data]
    email = {{ $email | quote }}
```

Then `chezmoi init` will create an initial `chezmoi.toml` using this template. `promptStringOnce` is a special function that prompts the user for a value if it is not already set in your data.

## Re-create your config file

If you change your config file template, chezmoi will warn you if your current config file was not generated from that template. You can re-generate your config file by running:

```sh
chezmoi init
```

## Install

The latest version of chezmoi is 2.70.2.

### One-line binary install

Install the correct binary for your operating system and architecture in `./bin` with a single command:

```sh
# curl
sh -c "$(curl -fsLS https://get.chezmoi.io)"

# wget
sh -c "$(wget -qO- https://get.chezmoi.io)"

# PowerShell
iex "&{$(irm 'https://get.chezmoi.io/ps1')}"
```

### One-shot bootstrap script variants

If you already have a dotfiles repo using chezmoi on GitHub at `https://github.com/$GITHUB_USERNAME/dotfiles` then you can install chezmoi and your dotfiles with the single command:

```sh
sh -c "$(curl -fsLS https://get.chezmoi.io)" -- init --apply $GITHUB_USERNAME
```

Private GitHub repos require other authentication methods:

```sh
sh -c "$(curl -fsLS https://get.chezmoi.io)" -- init --apply git@github.com:$GITHUB_USERNAME/dotfiles.git
```

To install the chezmoi binary in a different directory, use the `-b` option:

```sh
sh -c "$(curl -fsLS get.chezmoi.io)" -- -b $HOME/.local/bin
```

### init flags table

| Flag | Type | Default | Description |
| --- | --- | --- | --- |
| `-a`, `--apply` | bool | `false` | Run `chezmoi apply` after checking out the repo and creating the config file. |
| `--branch` | string | `""` | Check out `branch` instead of the default branch. |
| `-C`, `--config-path` | string | `""` | Write the generated config file to `path` instead of the default location. |
| `--data` | bool | `true` | Include existing template data when creating the config file. |
| `-d`, `--depth` | int | `0` | Clone the repo with depth `depth`. |
| `--git-lfs` | bool | `false` | Run `git lfs pull` after cloning the repo. |
| `-g`, `--guess-repo-url` | bool | `true` | Guess the repo URL from the repo argument. |
| `--one-shot` | bool | `false` | Equivalent of `--apply`, `--depth=1`, `--force`, `--purge`, and `--purge-binary`. |
| `--prompt` | bool | `false` | Force the `prompt*Once` template functions to prompt. |
| `--promptBool` | string | `""` | Populate the `promptBool` template function with values from pairs. |
| `--promptChoice` | string | `""` | Populate the `promptChoice` template function with values from pairs. |
| `--promptDefaults` | bool | `false` | Make all `prompt*` template function calls with a default value return that default value instead of prompting. |
| `--promptInt` | string | `""` | Populate the `promptInt` template function with values from pairs. |
| `--promptMultichoice` | string | `""` | Populate the `promptMultichoice` template function with values from pairs. |
| `--promptString` | string | `""` | Populate the `promptString` template function with values from pairs. |
| `-p`, `--purge` | bool | `false` | Remove the source and config directories after applying. |
| `-P`, `--purge-binary` | bool | `false` | Attempt to remove the chezmoi binary after applying. |
| `--recurse-submodules` | bool | `true` | Recursively clone submodules. |
| `--ssh` | bool | `false` | Guess an SSH repo URL instead of an HTTPS repo. |
| `-x`, `--exclude` | string | `""` | Exclude target state entries of specific types. |
| `-i`, `--include` | string | `""` | Include target state entries of specific types. |
