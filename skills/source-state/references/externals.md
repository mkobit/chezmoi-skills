# Externals

[`.chezmoiexternal.$FORMAT`](https://www.chezmoi.io/reference/special-files/chezmoiexternal-format/): include external files, archives, and git repos as if they were in the source state.

If a file called `.chezmoiexternal.$FORMAT` (with an optional `.tmpl` extension) exists anywhere in the source state (either `~/.local/share/chezmoi` or directory defined inside `.chezmoiroot`), it is interpreted as a list of external files and archives to be included as if they were in the source state.
`$FORMAT` must be one of chezmoi's supported configuration file formats: JSON, JSONC, TOML, and YAML.

`.chezmoiexternal.$FORMAT` is interpreted as a template, whether or not it has a `.tmpl` extension.
If the file is located in a directory ignored by `.chezmoiignore`, all entries within it are also ignored.

Entries are indexed by target name relative to the directory of the `.chezmoiexternal.$FORMAT` file, and must have a `type` and a `url` and/or a `urls` field.
`type` can be either `file`, `archive`, `archive-file`, or `git-repo`.
If an entry's parent directories do not already exist in the source state, chezmoi creates them as regular directories.

Files in `.chezmoiexternals/` directories are read in lexical order with any `.chezmoiexternal.$FORMAT` files.

## Fields

| Variable | Type | Default value | Description |
| --- | --- | --- | --- |
| `type` | string | none | External type (`file`, `archive`, `archive-file`, or `git-repo`) |
| `decompress` | string | none | Decompression for file (`bzip2`, `gzip`, `xz`, `zstd`) |
| `encrypted` | bool | false | Whether the external is encrypted |
| `exact` | bool | false | Add `exact_` attribute to directories in archive |
| `exclude` | []string | none | Patterns to exclude from archive |
| `executable` | bool | false | Add `executable_` attribute to file |
| `private` | bool | false | Add `private_` attribute to file |
| `readonly` | bool | false | Add `readonly_` attribute to file |
| `format` | string | autodetect | Format of archive |
| `path` | string | none | Path to file in archive |
| `include` | []string | none | Patterns to include from archive |
| `refreshPeriod` | duration | 0 | Refresh period |
| `stripComponents` | int | 0 | Number of leading directory components to strip from archives |
| `url` | string | none | URL |
| `urls` | []string | none | Extra URLs to try, in order |
| `checksum.sha256` | string | none | Expected SHA256 checksum of data |
| `checksum.sha384` | string | none | Expected SHA384 checksum of data |
| `checksum.sha512` | string | none | Expected SHA512 checksum of data |
| `checksum.size` | int | none | Expected size of data |
| `clone.args` | []string | none | Extra args to git clone |
| `filter.command` | string | none | Command to filter contents |
| `filter.args` | []string | none | Extra args to command to filter contents |
| `pull.args` | []string | none | Extra args to git pull |
| `archive.extractAppleDouble` | bool | false | If true, AppleDouble files are extracted |
| `targetPath` | string | none | Target path, overriding the key of the entry |

`url` must be an `https://`, `http://`, or `file://` URL.
If `urls` is specified, they are tried in order and the first that succeeds is used.

## Type: `file`

The target is a file with the contents of `url`.

```toml
[".vim/autoload/plug.vim"]
    type = "file"
    url = "https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim"
    refreshPeriod = "168h"
```

`decompress` decompresses a single compressed file.
`.rar` and `.zip` are archives, not compression: use `archive-file` to extract a single file from them.

## Type: `archive`

The target is a directory with the contents of the archive at `url`.

```toml
[".oh-my-zsh"]
    type = "archive"
    url = "https://github.com/ohmyzsh/ohmyzsh/archive/master.tar.gz"
    exact = true
    stripComponents = 1
    refreshPeriod = "168h"
```

- `exact = true` makes `chezmoi apply` remove entries not present in the archive.
- `stripComponents` removes leading path components from archive members (GitHub tarballs wrap contents in a `$repo-$ref/` directory, so they usually need `stripComponents = 1`).
- Supported `format` values: `tar`, `tar.gz`, `tgz`, `tar.bz2`, `tbz2`, `xz`, `tar.zst`, `zip`; guessed from the URL path, then the contents, if unset.

## Type: `archive-file`

The target is a single file (or symlink) extracted from the archive at `url`, selected by `path`.

```toml
[".local/bin/age"]
    type = "archive-file"
    url = "https://github.com/FiloSottile/age/releases/download/v1.1.1/age-v1.1.1-{{ .chezmoi.os }}-{{ .chezmoi.arch }}.tar.gz"
    path = "age/age"
    executable = true
```

- `path` matches the member path inside the archive after `stripComponents` is applied; verify with `tar tzf archive.tar.gz` (a leading `./` in the listing must appear in `path` too).
- `executable = true` sets the executable bits even if not set in the archive.

## Type: `git-repo`

chezmoi runs `git clone $URL $TARGET_NAME` (with optional `clone.args`) if the target does not exist, or `git pull` (with optional `pull.args`) if it does.

```toml
[".vim/pack/alker0/chezmoi.vim"]
    type = "git-repo"
    url = "https://github.com/alker0/chezmoi.vim.git"
    refreshPeriod = "168h"
    [".vim/pack/alker0/chezmoi.vim".pull]
        args = ["--ff-only"]
```

Limitations:

- Requires a `git` binary in `$PATH`.
- The directory is delegated to git; chezmoi cannot manage any other files in it.
- Contents are not shown by `chezmoi diff` or `chezmoi dump`, and are listed by `chezmoi unmanaged`.
- To manage extra files inside, use an `archive` external pointing at a tarball of the repo's default branch instead.

Private repos must use an SSH URL; guard the entry so machines without the key skip it:

```gotmpl
{{ if stat (joinPath .chezmoi.homeDir ".ssh" "id_rsa") }}
[".path/to/private/repo"]
    type = "git-repo"
    url = "git@private.com:org/repo.git"
{{ end }}
```

## Include and exclude patterns

`include` and `exclude` match paths **in the archive**, not the target state:

1. A member matching any `exclude` pattern is excluded (directories recursively exclude their contents).
2. Otherwise, a member matching any `include` pattern is included.
3. Otherwise, if only `include` patterns were given, the member is excluded.
4. Otherwise, the member is included.

```toml
["www/adminer/plugins"]
    type = "archive"
    url = "https://api.github.com/repos/vrana/adminer/tarball"
    stripComponents = 2
    include = ["*/plugins/**"]
```

## Refreshing and caching

For `file` and `archive` externals, chezmoi caches downloaded URLs; for `git-repo` externals, `refreshPeriod` sets how often `git pull` runs.
`refreshPeriod` defaults to `0`, meaning never refresh unless forced.
Force a refresh with `chezmoi apply -R` / `--refresh-externals`.
Common periods: `24h` (day), `168h` (week), `672h` (four weeks).

## `targetPath`

`targetPath` overrides the entry key as the target path, allowing multiple externals to land in one directory:

```toml
[fira_code]
    type = "archive"
    url = "https://github.com/tonsky/FiraCode/releases/download/6.2/Fira_Code_v6.2.zip"
    include = ["ttf/*.ttf"]
    targetPath = ".local/share/fonts"
[jetbrains_mono]
    type = "archive"
    url = "https://github.com/JetBrains/JetBrainsMono/releases/download/v2.304/JetBrainsMono-2.304.zip"
    include = ["fonts/ttf/*.ttf"]
    targetPath = ".local/share/fonts"
```

## Verification and filtering

- Set any `checksum.sha256`/`sha384`/`sha512` field to make chezmoi verify the downloaded data.
- `filter.command` + `filter.args` pipe the downloaded data through a command (stdin → stdout) before use.
