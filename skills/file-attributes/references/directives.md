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
