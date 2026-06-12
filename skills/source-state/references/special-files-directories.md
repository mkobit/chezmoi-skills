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

See [externals.md](externals.md) for external files, archives, and git repos.
