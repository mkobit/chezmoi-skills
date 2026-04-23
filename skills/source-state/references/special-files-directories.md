# Special files and directories

All files and directories in the source state whose name begins with `.` are ignored by default, unless they are one of the special files or directories listed here.

## Special files

All of these files are optional and are evaluated in a specific order:

1. `.chezmoiroot` is read from the root of the source directory before anything other file, setting the source state path. The location of all other files, except `.chezmoiversion`, is relative to the source state path.
2. `.chezmoi.$FORMAT.tmpl` is used by `chezmoi init` to prepare or update the chezmoi config file. This will be applied prior to any remaining special files or directories.
3. Data files (`.chezmoidata.$FORMAT` files or files in `.chezmoidata/` directories) are read before any templates are processed so that data contained within are available to the templates.
4. `.chezmoitemplates/` directories are made available for use in source templates.
5. `.chezmoiignore` determines files and directories that should be ignored.
6. `.chezmoiremove` determines files that should be removed during an apply.
7. External sources (`.chezmoiexternal.$FORMAT` or files in `.chezmoiexternals/`) are read in lexical order to include external files and archives as if they were in the source state.
8. `.chezmoiversion` is processed before any operation is applied, to ensure that the running version of chezmoi is new enough.

## Special directories

All of these directories are optional and are evaluated in a specific order described above.

* The files in `.chezmoidata/` directories are read in lexical order with any `.chezmoidata.$FORMAT` files in the source state.
* The files in `.chezmoitemplates/` are made available for use in source templates.
* The files in `.chezmoiscripts/` are read, templated, and according to their phase attributes (`run_after_`, `run_before_`, etc.) and lexical ordering.
* Files in `.chezmoiexternals/` are read in lexical order with any `.chezmoiexternal.$FORMAT` files.

## `.chezmoiexternal.$FORMAT{,.tmpl}`

If a file called `.chezmoiexternal.$FORMAT` (with an optional `.tmpl` extension) exists anywhere in the source state (either `~/.local/share/chezmoi` or directory defined inside `.chezmoiroot`), it is interpreted as a list of external files and archives to be included as if they were in the source state. `$FORMAT` must be one of chezmoi's supported configuration file formats: JSON, JSONC, TOML, and YAML.

`.chezmoiexternal.$FORMAT` is interpreted as a template, whether or not it has a `.tmpl` extension.

Entries are indexed by target name relative to the directory of the `.chezmoiexternal.$FORMAT` file, and must have a `type` and a `url` and/or a `urls` field. `type` can be either `file`, `archive`, `archive-file`, or `git-repo`.

### Fields

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
