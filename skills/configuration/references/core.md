# Core Configuration Options

Reference: <https://www.chezmoi.io/reference/configuration-file/variables/#top-level>
A list of all top-level configuration options available in `chezmoi.toml` / `chezmoi.yaml`.

## Top level variables

| Variable | Type | Default | Description |
| --- | --- | --- | --- |
| `cacheDir` | `string` | `$XDG_CACHE_HOME/chezmoi` / `$HOME/.cache/chezmoi` | Cache directory. |
| `color` | `string` | `"auto"` | Colorize output. |
| `data` | `object` | `none` | Template data. |
| `destDir` | `string` | `$HOME` / `%USERPROFILE%` | Destination directory. |
| `encryption` | `string` | `none` | Encryption type, either `age`, `gpg`, or `transparent`. |
| `env` | `object` | `none` | Extra environment variables for scripts and commands. |
| `format` | `string` | `"json"` | Format for data output, either `json` or `yaml`. |
| `interactive` | `string` | `false` | Prompt for all changes. |
| `mode` | `string` | `"file"` | Mode in target dir, either `file` or `symlink`. |
| `pager` | `string` | `$PAGER` | Default pager CLI command. |
| `pagerArgs` | `[]string` | `none` | Extra args to the pager command. |
| `persistentState` | `string` | `$XDG_CONFIG_HOME/chezmoi/chezmoi.boltdb` | Location of the persistent state file. |
| `progress` | `bool` | `false` | Display progress bars. |
| `scriptEnv` | `object` | `none` | Extra environment variables for scripts, hooks, and commands. |
| `scriptTempDir` | `string` | `none` | Temporary directory for scripts. |
| `sourceDir` | `string` | `$XDG_SHARE_HOME/chezmoi` | Source directory. |
| `tempDir` | `string` | from system | Temporary directory. |
| `umask` | `int` | from system | Umask. |
| `useBuiltinAge` | `string` | `"auto"` | Use builtin age if age command is not found in `$PATH`. |
| `useBuiltinGit` | `string` | `"auto"` | Use builtin git if git command is not found in `$PATH`. |
| `verbose` | `bool` | `false` | Make output more verbose. |
| `workingTree` | `string` | source directory | git working tree directory. |
