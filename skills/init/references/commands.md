# Commands

## `init [repo]`

Setup the source directory, generate the config file, and optionally update the destination directory to match the target state. This is done in the following order:

1. The source directory is initialized. If chezmoi does not detect a Git repository in the source directory, chezmoi will clone the provided repo into the source directory. If no repo is provided, chezmoi will initialize a new Git repository.
2. If the initialized source directory contains a `.chezmoi.$FORMAT.tmpl` file, a new configuration file will be created using that file as a template.
3. If the `--apply` flag is provided, `chezmoi apply` is run.
4. If the `--purge` flag is provided, chezmoi will remove the source, config, and cache directories.
5. If the `--purge-binary` is passed, chezmoi will attempt to remove its own binary.

### Default URL Guessing (`--guess-repo-url`)

By default, if `repo` is given, chezmoi will guess the full git repo URL, using HTTPS by default, or SSH if the `--ssh` option is specified, according to the following patterns:

| Pattern | HTTPS Repo | SSH repo |
| --- | --- | --- |
| `user` | `https://user@github.com/user/dotfiles.git` | `git@github.com:user/dotfiles.git` |
| `user/repo` | `https://user@github.com/user/repo.git` | `git@github.com:user/repo.git` |
| `site/user/repo` | `https://user@site/user/repo.git` | `git@site:user/repo.git` |
| `sr.ht/~user` | `https://user@git.sr.ht/~user/dotfiles` | `git@git.sr.ht:~user/dotfiles.git` |
| `sr.ht/~user/repo` | `https://user@git.sr.ht/~user/repo` | `git@git.sr.ht:~user/repo.git` |

To disable git repo URL guessing, pass the `--guess-repo-url=false` option.

## Flags

| Flag | Type | Default | Description |
| --- | --- | --- | --- |
| `-a`, `--apply` | bool | `false` | Run `chezmoi apply` after checking out the repo and creating the config file. |
| `--branch` | string | `""` | Check out `branch` instead of the default branch. |
| `-C`, `--config-path` | string | `""` | Write the generated config file to `path` instead of the default location. |
| `--data` | bool | `true` | Include existing template data when creating the config file. Set this to false to simulate creating the config file with no existing template data. |
| `-d`, `--depth` | int | `0` | Clone the repo with depth `depth`. |
| `--git-lfs` | bool | `false` | Run `git lfs pull` after cloning the repo. |
| `-g`, `--guess-repo-url` | bool | `true` | Guess the repo URL from the repo argument. This defaults to true. |
| `--one-shot` | bool | `false` | The equivalent of `--apply`, `--depth=1`, `--force`, `--purge`, and `--purge-binary`. It attempts to install your dotfiles with chezmoi and then remove all traces of chezmoi from the system. This is useful for setting up temporary environments (e.g. Docker containers). |
| `--prompt` | bool | `false` | Force the `prompt*Once` template functions to prompt. |
| `--promptBool` | string | `""` | Populate the `promptBool` template function with values from pairs. |
| `--promptChoice` | string | `""` | Populate the `promptChoice` template function with values from pairs. |
| `--promptDefaults` | bool | `false` | Make all `prompt*` template function calls with a default value return that default value instead of prompting. |
| `--promptInt` | string | `""` | Populate the `promptInt` template function with values from pairs. |
| `--promptMultichoice` | string | `""` | Populate the `promptMultichoice` template function with values from pairs. |
| `--promptString` | string | `""` | Populate the `promptString` template function with values from pairs. |
| `-p`, `--purge` | bool | `false` | Remove the source and config directories after applying. |
| `-P`, `--purge-binary` | bool | `false` | Attempt to remove the chezmoi binary after applying. |
| `--recurse-submodules` | bool | `true` | Recursively clone submodules. This defaults to true. |
| `--ssh` | bool | `false` | Guess an SSH repo URL instead of an HTTPS repo. |
| `-x`, `--exclude` | string | `""` | Exclude target state entries of specific types. The default is none. Types can be explicitly included with the `--include` flag. |
| `-i`, `--include` | string | `""` | Include target state entries of specific types. The default is all. Types can be explicitly excluded with the `--exclude` flag. |

## Examples

Initialize with an SSH repo:

```sh
chezmoi init --ssh user
```

Initialize with Token Auth (HTTPS):

```sh
chezmoi init https://user:TOKEN@github.com/user/dotfiles.git
```

Initialize without guessing the repo URL:

```sh
chezmoi init --guess-repo-url=false user
```

Other examples:

```sh
chezmoi init user
chezmoi init user --apply
chezmoi init user --apply --purge
chezmoi init user/dots
chezmoi init codeberg.org/user
chezmoi init gitlab.com/user
```
