# Chezmoi miscellaneous core commands

- [chezmoi re-add](https://www.chezmoi.io/reference/commands/re-add/): Re-add modified files in the target state, preserving encrypted_ attributes.
- [chezmoi forget](https://www.chezmoi.io/reference/commands/forget/): Remove targets from the source state (stop managing them, but leave them in the target directory).
- [chezmoi destroy](https://www.chezmoi.io/reference/commands/destroy/): Remove target from the source state, the destination directory, and the state.
- [chezmoi archive](https://www.chezmoi.io/reference/commands/archive/): Generate an archive (tar, zip, etc.) of the target state.
- [chezmoi execute-template](https://www.chezmoi.io/reference/commands/execute-template/): Execute templates (useful for testing or calling from other scripts).
- [chezmoi cat](https://www.chezmoi.io/reference/commands/cat/): Write the target contents of files, scripts, or symlinks to stdout.
- chezmoi verify: see [verify.md](verify.md).

## Flags

- **re-add**: `-x`/`--exclude`, `-i`/`--include`, `--re-encrypt`, `-r`/`--recursive`
- **destroy**: `--force` (destroy without prompting), `-r`/`--recursive`
- **archive**: `-f`/`--format` (tar, tar.gz, tgz, zip; guessed from `--output` extension), `-z`/`--gzip`, `-x`/`--exclude`, `-i`/`--include`, `--init`, `-P`/`--parent-dirs`, `-r`/`--recursive`
- **execute-template**: `-f`/`--file` (treat args as filenames), `-i`/`--init`, `--with-stdin` (set `.chezmoi.stdin` from stdin), `--left-delimiter`/`--right-delimiter`, `--stdinisatty bool`
- **execute-template prompt simulation**: `-p`/`--promptString`, `--promptBool`, `--promptInt`, `--promptChoice`, `--promptMultichoice` — each takes comma-separated `prompt=value` pairs to simulate the corresponding template function

## Examples

```bash
chezmoi re-add ~/.bashrc
chezmoi forget ~/.bashrc
chezmoi archive | tar tvf -
chezmoi archive --output=dotfiles.tar.gz
chezmoi execute-template '{{ .chezmoi.os }}' / '{{ .chezmoi.arch }}'
chezmoi cat ~/.bashrc
chezmoi execute-template --init --promptString email=me@home.org < ~/.local/share/chezmoi/.chezmoi.toml.tmpl
```
