# Externals

[`.chezmoiexternal.$FORMAT`](https://www.chezmoi.io/reference/special-files/chezmoiexternal-format/): include external files, archives, and git repos as if they were in the source state.

If a file called `.chezmoiexternal.$FORMAT` (with an optional `.tmpl` extension) exists anywhere in the source state (either `~/.local/share/chezmoi` or directory defined inside `.chezmoiroot`), it is interpreted as a list of external files and archives to be included as if they were in the source state.
`$FORMAT` must be one of chezmoi's supported configuration file formats: JSON, JSONC, TOML, and YAML.

`.chezmoiexternal.$FORMAT` is interpreted as a template, whether or not it has a `.tmpl` extension.

Entries are indexed by target name relative to the directory of the `.chezmoiexternal.$FORMAT` file, and must have a `type` and a `url` and/or a `urls` field.
`type` can be either `file`, `archive`, `archive-file`, or `git-repo`.

Files in `.chezmoiexternals/` directories are read in lexical order with any `.chezmoiexternal.$FORMAT` files.

## Fields

| Variable | Type | Default value | Description |
| --- | --- | --- | --- |
| `type` | string | none | External type (`file`, `archive`, `archive-file`, or `git-repo`) |
| `decompress` | string | none | Decompression for file |
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
