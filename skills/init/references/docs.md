# Chezmoi init documentation

Review the official `chezmoi init` documentation on the [chezmoi website](https://www.chezmoi.io/reference/commands/init/).
The official documentation provides an exhaustive list of all available flags and their exact behaviors.

## Repository guessing

When a repository argument is provided, chezmoi attempts to guess the correct git URL.
If the argument is exactly one word, it is treated as a GitHub username.
Chezmoi will attempt to clone `https://github.com/<word>/dotfiles.git`.
If the argument contains a slash, it is treated as a host and path.
For example, `gitlab.com/username/dotfiles` will resolve to `https://gitlab.com/username/dotfiles.git`.
The `--ssh` flag overrides this behavior to generate `git@` style URLs instead of `https://`.

## Handling existing source directories

If the source directory already exists, `chezmoi init` changes its behavior.
If no repository argument is passed, it simply regenerates the configuration file from the existing `.chezmoi.toml.tmpl`.
If a repository argument is passed but the directory exists, chezmoi will return an error to prevent accidental overwrites.
To safely re-initialize or update the configuration file without fetching, run `chezmoi init` with no arguments.

## Bare repositories

Chezmoi handles the underlying git repository within the source directory cleanly.
While usually a standard git clone, you can configure chezmoi to use a bare repository structure if preferred.
However, standard initialization handles the `.git` directory naturally without interfering with the target home directory.
