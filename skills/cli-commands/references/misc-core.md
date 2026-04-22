# Chezmoi miscellaneous core commands

- [chezmoi re-add](https://www.chezmoi.io/reference/commands/re-add/): Re-add modified files in the target state, preserving encrypted_ attributes.
- [chezmoi forget](https://www.chezmoi.io/reference/commands/forget/): Remove targets from the source state (stop managing them, but leave them in the target directory).
- [chezmoi destroy](https://www.chezmoi.io/reference/commands/destroy/): Remove target from the source state, the destination directory, and the state.
- [chezmoi archive](https://www.chezmoi.io/reference/commands/archive/): Generate an archive (tar, zip, etc.) of the target state.
- [chezmoi execute-template](https://www.chezmoi.io/reference/commands/execute-template/): Execute templates (useful for testing or calling from other scripts).
- [chezmoi cat](https://www.chezmoi.io/reference/commands/cat/): Write the target contents of files, scripts, or symlinks to stdout.
- [chezmoi verify](https://www.chezmoi.io/reference/commands/verify/): Verify that all targets match their target state. Exits with code 0 if they match, 1 otherwise.

## Flags

- **re-add**: `-x`/`--exclude`, `-i`/`--include`, `--re-encrypt`, `-r`/`--recursive`
- **destroy**: `--force` (destroy without prompting), `-r`/`--recursive`
- **archive**: `-f`/`--format` (tar, tar.gz, tgz, zip), `-z`/`--gzip`
- **execute-template**: `-f`/`--file` (treat args as filenames), `-i`/`--init`
- **verify**: `-x`/`--exclude`, `-i`/`--include`, `--init`, `-P`/`--parent-dirs`, `-r`/`--recursive`

## Examples

```bash
chezmoi re-add ~/.bashrc
chezmoi forget ~/.bashrc
chezmoi archive | tar tvf -
chezmoi archive --output=dotfiles.tar.gz
chezmoi execute-template '{{ .chezmoi.os }}' / '{{ .chezmoi.arch }}'
chezmoi cat ~/.bashrc
chezmoi verify ~/.bashrc
```
