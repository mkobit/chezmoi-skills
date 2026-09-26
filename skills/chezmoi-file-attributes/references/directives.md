# Root control directives

Root control files live in the source directory root and alter global target generation, removal, or version compatibility.

## `.chezmoiroot`

The `.chezmoiroot` file re-roots target state evaluation to a subdirectory inside the source repository.
When `.chezmoiroot` contains a directory path, chezmoi treats that subdirectory as the root of the managed target files.

```text
home/
  dot_bashrc
.chezmoiroot
```

If `.chezmoiroot` contains `home`, `dot_bashrc` maps to `~/.bashrc` instead of `~/home/.bashrc`.
This isolates chezmoi source files from non-managed repository files like repository documentation or build tooling.

## `.chezmoiremove`

The `.chezmoiremove` file defines pattern rules for target entries that chezmoi should remove during `chezmoi apply`.
It is interpreted as a template and supports pattern matching relative to the target directory.

```gotmpl
.cache/old-tool/
*.tmp
```

Lines in `.chezmoiremove` specify files or directories that will be deleted if present in the target destination.
Empty lines and lines beginning with `#` are ignored.

## `.chezmoiversion`

The `.chezmoiversion` file specifies the minimum required chezmoi version needed to evaluate the source repository.
If the installed chezmoi version is older than the version declared in `.chezmoiversion`, chezmoi aborts execution with an error.

```text
2.40.0
```

Use `.chezmoiversion` when utilizing recently introduced chezmoi features, template functions, or configuration directives.

## `.chezmoiignore`

The `.chezmoiignore` file defines pattern rules for entries in the source directory that chezmoi should ignore when computing target state.
It is evaluated as a template and supports glob pattern matching relative to the target directory.

```gotmpl
.git/
.DS_Store
{{ if eq .chezmoi.os "windows" }}
.bashrc
{{ end }}
```

## Special `.chezmoi` directories

chezmoi reserves several root subdirectories for specific management features:

- `.chezmoiscripts/`: contains scripts executed during `chezmoi apply`.
- `.chezmoidata/`: contains modular template data files (`.json`, `.toml`, `.yaml`).
- `.chezmoiexternals/`: contains modular external dependency definitions.
- `.chezmoitemplates/`: contains reusable template fragments loaded via `template`.

## `.chezmoi.$FORMAT.tmpl` vs target templates

Config templates (`.chezmoi.toml.tmpl`, `.chezmoi.yaml.tmpl`) are evaluated before reading source state.
As a result, config templates operate under different feature capabilities than standard target `.tmpl` files.

| Feature capability | `.chezmoi.$FORMAT.tmpl` | Target `.tmpl` file |
| --- | --- | --- |
| Access `.chezmoi.*` variables | Yes | Yes |
| Access `promptStringOnce` / `promptBoolOnce` | Yes | No |
| Access `.chezmoidata` / `.chezmoidata/` | No | Yes |
| Access `.chezmoitemplates/` | No | Yes |
| Access user `[data]` settings | No | Yes |
