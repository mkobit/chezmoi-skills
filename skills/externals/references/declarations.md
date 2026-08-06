# External declarations

[`.chezmoiexternal.$FORMAT`](https://www.chezmoi.io/reference/special-files/chezmoiexternal-format/): include external files, archives, and git repositories into the target state.

If a file called `.chezmoiexternal.$FORMAT` (with an optional `.tmpl` extension) exists in the source state, chezmoi parses it as a map of external target definitions.
Format `$FORMAT` must be one of chezmoi's supported configuration file formats: JSON, JSONC, TOML, or YAML.
The file is evaluated as a template whether or not it has a `.tmpl` suffix.

Entries in `.chezmoiexternal.$FORMAT` are keyed by target path relative to the declaring file.
Files in `.chezmoiexternals/` subdirectories are read in lexical order alongside `.chezmoiexternal.$FORMAT` files.

## Schema fields

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `type` | string | required | Type (`file`, `archive`, `archive-file`, `git-repo`) |
| `url` | string | none | Primary download/clone URL |
| `urls` | []string | none | Fallback URLs evaluated in order |
| `decompress` | string | none | Decompression (`bzip2`, `gzip`, `xz`, `zstd`) |
| `encrypted` | bool | `false` | Whether payload is encrypted |
| `exact` | bool | `false` | Add `exact_` attribute to extracted archive dirs |
| `executable` | bool | `false` | Set executable permissions on target file |
| `private` | bool | `false` | Set private permissions on target file |
| `readonly` | bool | `false` | Set read-only permissions on target file |
| `format` | string | autodetect | Archive format (`tar`, `tar.gz`, `zip`, etc.) |
| `path` | string | none | Relative path of file to extract |
| `include` | []string | none | Glob patterns of archive members to include |
| `exclude` | []string | none | Glob patterns of archive members to exclude |
| `archive.extractAppleDouble` | bool | `false` | Extract AppleDouble files (`._*`) |
| `refreshPeriod` | duration | `0` | Minimum interval before re-fetching resource |
| `stripComponents` | int | `0` | Directory levels to strip from archive paths |
| `checksum.sha256` | string | none | Expected SHA-256 checksum |
| `checksum.sha384` | string | none | Expected SHA-384 checksum |
| `checksum.sha512` | string | none | Expected SHA-512 checksum |
| `checksum.size` | int | none | Expected size in bytes |
| `clone.args` | []string | none | Arguments for `git clone` |
| `pull.args` | []string | none | Arguments for `git pull` |
| `filter.command` | string | none | Command to pipe payload through |
| `filter.args` | []string | none | Arguments for filter command |
| `targetPath` | string | none | Target path overriding map key |

## External types

### `file`

Downloads a single remote file directly to destination path.

```toml
[".vim/autoload/plug.vim"]
    type = "file"
    url = "https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim"
    refreshPeriod = "168h"
```

Use `decompress` for compressed single files (`.gz`, `.bz2`).
For `.zip` or `.tar.gz` single files, use `archive-file`.

### `archive`

Unpacks an archive directory tree into target location.

```toml
[".oh-my-zsh"]
    type = "archive"
    url = "https://github.com/ohmyzsh/ohmyzsh/archive/master.tar.gz"
    exact = true
    stripComponents = 1
    refreshPeriod = "168h"
```

Setting `exact = true` removes unmanaged files inside destination during apply.
`stripComponents` removes leading directory wrappers.

### `archive-file`

Extracts a single file from an archive by matching internal path.

```toml
[".local/bin/age"]
    type = "archive-file"
    url = "https://github.com/FiloSottile/age/releases/download/v1.1.1/age-v1.1.1-{{ .chezmoi.os }}-{{ .chezmoi.arch }}.tar.gz"
    path = "age/age"
    executable = true
```

### `git-repo`

Clones a remote git repository or runs `git pull` when updating.

```toml
[".vim/pack/alker0/chezmoi.vim"]
    type = "git-repo"
    url = "https://github.com/alker0/chezmoi.vim.git"
    refreshPeriod = "168h"
    [".vim/pack/alker0/chezmoi.vim".pull]
        args = ["--ff-only"]
```

`git-repo` requires `git` in `$PATH` and delegates directory management to git.

## Include and exclude pattern rules

Archive extraction processes `include` and `exclude` pattern rules in priority sequence:

1. Archive members matching any `exclude` pattern are skipped.
2. Archive members matching any `include` pattern are extracted.
3. If only `include` patterns are defined, non-matching members are skipped.
4. Otherwise, non-excluded members are extracted.

```toml
["www/adminer/plugins"]
    type = "archive"
    url = "https://api.github.com/repos/vrana/adminer/tarball"
    stripComponents = 2
    include = ["*/plugins/**"]
```

## Refreshing and caching mechanisms

chezmoi caches downloaded files and archive artifacts locally.
The `refreshPeriod` parameter specifies how frequently chezmoi checks remote endpoints.
Setting `refreshPeriod = 0` (default) prevents automatic refreshes until forced manually.
Run `chezmoi apply --refresh-externals` or `chezmoi apply -R` to force immediate re-download.

## Edge cases and caveats

- Guard private SSH git-repo externals with `stat` checks (`{{ if stat (joinPath .chezmoi.homeDir ".ssh" "id_rsa") }}`) to avoid clone failures when SSH keys are missing.
- Verify exact member paths inside archives using `tar tf` or `unzip -l`.
- If `.chezmoiexternal.$FORMAT` is inside an ignored directory in `.chezmoiignore`, all entries declared within it are ignored.
- Parent directories of external targets are created automatically as regular directories in target state.
