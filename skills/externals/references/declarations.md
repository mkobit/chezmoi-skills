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
| `type` | string | required | External type (`file`, `archive`, `archive-file`, or `git-repo`) |
| `url` | string | none | Primary download or clone URL |
| `urls` | []string | none | Fallback URLs evaluated in order if primary URL fails |
| `decompress` | string | none | Decompression algorithm for single files (`bzip2`, `gzip`, `xz`, `zstd`) |
| `encrypted` | bool | `false` | Whether the downloaded payload is encrypted |
| `exact` | bool | `false` | Add `exact_` attribute to extracted archive directories |
| `executable` | bool | `false` | Set executable permissions on target file |
| `private` | bool | `false` | Set private permissions on target file |
| `readonly` | bool | `false` | Set read-only permissions on target file |
| `format` | string | autodetect | Archive format (`tar`, `tar.gz`, `tgz`, `tar.bz2`, `tbz2`, `xz`, `tar.zst`, `zip`) |
| `path` | string | none | Relative path of single file to extract from archive |
| `include` | []string | none | Glob patterns matching archive members to include |
| `exclude` | []string | none | Glob patterns matching archive members to exclude |
| `refreshPeriod` | duration | `0` | Minimum interval before re-fetching external resource |
| `stripComponents` | int | `0` | Number of leading directory levels to strip from archive paths |
| `checksum.sha256` | string | none | Expected SHA-256 checksum of downloaded payload |
| `checksum.sha384` | string | none | Expected SHA-384 checksum of downloaded payload |
| `checksum.sha512` | string | none | Expected SHA-512 checksum of downloaded payload |
| `checksum.size` | int | none | Expected size in bytes of downloaded payload |
| `clone.args` | []string | none | Additional CLI arguments passed to `git clone` |
| `pull.args` | []string | none | Additional CLI arguments passed to `git pull` |
| `filter.command` | string | none | Executable to pipe downloaded payload through |
| `filter.args` | []string | none | Arguments for payload filter command |
| `targetPath` | string | none | Target destination path overriding map key |

## External types

### `file`

The `file` type downloads a single remote file directly to the destination path.

```toml
[".vim/autoload/plug.vim"]
    type = "file"
    url = "https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim"
    refreshPeriod = "168h"
```

Use `decompress` for compressed single files like `.gz` or `.bz2`.
For `.zip` or `.tar.gz` single files, use `archive-file` instead.

### `archive`

The `archive` type unpacks an entire archive directory tree into the target location.

```toml
[".oh-my-zsh"]
    type = "archive"
    url = "https://github.com/ohmyzsh/ohmyzsh/archive/master.tar.gz"
    exact = true
    stripComponents = 1
    refreshPeriod = "168h"
```

Setting `exact = true` removes unmanaged files inside the destination directory during apply.
`stripComponents` removes leading directory wrappers commonly present in release tarballs.

### `archive-file`

The `archive-file` type extracts a single file from an archive by matching its internal path.

```toml
[".local/bin/age"]
    type = "archive-file"
    url = "https://github.com/FiloSottile/age/releases/download/v1.1.1/age-v1.1.1-{{ .chezmoi.os }}-{{ .chezmoi.arch }}.tar.gz"
    path = "age/age"
    executable = true
```

The `path` parameter matches member paths after `stripComponents` reduction.

### `git-repo`

The `git-repo` type clones a remote git repository or runs `git pull` when updating.

```toml
[".vim/pack/alker0/chezmoi.vim"]
    type = "git-repo"
    url = "https://github.com/alker0/chezmoi.vim.git"
    refreshPeriod = "168h"
    [".vim/pack/alker0/chezmoi.vim".pull]
        args = ["--ff-only"]
```

`git-repo` requires `git` in `$PATH` and delegates directory management entirely to git.
Files inside a `git-repo` directory are excluded from `chezmoi diff` and `chezmoi dump`.

## Include and exclude pattern rules

Archive extraction filtering processes `include` and `exclude` pattern rules in priority sequence:

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
The `refreshPeriod` parameter specifies how frequently chezmoi checks remote endpoints for changes.
Setting `refreshPeriod = 0` (default) prevents automatic refreshes until forced manually.
Run `chezmoi apply --refresh-externals` or `chezmoi apply -R` to force immediate re-download of all external dependencies.
Standard duration strings like `24h`, `168h`, or `720h` define valid refresh intervals.
