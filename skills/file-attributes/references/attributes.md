# Target entry attributes

chezmoi stores the source state of target files, symbolic links, and directories in regular files and directories in the source directory (`~/.local/share/chezmoi` by default).
Directory targets are represented as directories in the source state.
All other target types are represented as files in the source state.
Target attributes and behaviors are encoded directly into source file and directory names.

Attribute prefixes can be modified by renaming files in the source state or using the `chezmoi chattr` command.

## Attribute prefix table

| Prefix | Target effect |
| --- | --- |
| `dot_` | Rename target entry to use a leading dot, e.g. `dot_foo` becomes `.foo` |
| `private_` | Remove group and world permissions from the target file or directory (chmod 0700 / 0600) |
| `executable_` | Add executable permissions to the target file (chmod +x) |
| `exact_` | Remove any files or directories in the destination directory not managed by chezmoi |
| `readonly_` | Remove write permissions from the target file or directory |
| `empty_` | Ensure the file exists even if empty, preventing chezmoi from removing empty files |
| `symlink_` | Create a symbolic link instead of a regular file |
| `create_` | Ensure the target file exists, creating it with specified contents if absent |
| `modify_` | Treat source contents as a script that modifies an existing destination file |
| `remove_` | Remove the file or symlink if it exists or remove the directory if empty |
| `encrypted_` | Store the file encrypted in the source repository using age or GPG |
| `external_` | Ignore attribute processing in child entries |
| `literal_` | Stop parsing prefix attributes |
| `before_` | Run script before updating destination files |
| `after_` | Run script after updating destination files |
| `once_` | Run script only if contents have not been executed before |
| `onchange_` | Run script only when script content changes |
| `run_` | Treat contents as an executable script to run during apply |

## Suffixes

| Suffix | Target effect |
| --- | --- |
| `.tmpl` | Treat source file contents as a Go text/template |
| `.literal` | Stop parsing suffix attributes |

Encrypted files strip the `.age` or `.asc` extension after decryption.

## Allowed combinations by target type

Different target types support specific attribute prefix and suffix combinations.
Attribute order flows from left to right during composition.

| Target type | Source type | Allowed prefixes in order | Allowed suffixes |
| --- | --- | --- | --- |
| Directory | Directory | `remove_`, `external_`, `exact_`, `private_`, `readonly_`, `dot_` | none |
| Regular file | File | `encrypted_`, `private_`, `readonly_`, `empty_`, `executable_`, `dot_` | `.tmpl` |
| Create file | File | `create_`, `encrypted_`, `private_`, `readonly_`, `empty_`, `executable_`, `dot_` | `.tmpl` |
| Modify file | File | `modify_`, `encrypted_`, `private_`, `readonly_`, `executable_`, `dot_` | `.tmpl` |
| Remove file | File | `remove_`, `dot_` | none |
| Script | File | `run_`, `once_` or `onchange_`, `before_` or `after_` | `.tmpl` |
| Symbolic link | File | `symlink_`, `dot_` | `.tmpl` |

The `literal_` prefix and `.literal` suffix can appear at any position to halt attribute parsing.
This allows managing filenames that match chezmoi attribute keywords.

## Path composition examples

Prefixes compose left to right from the outer scope to the inner file name.

### Private hidden configuration directory

`private_dot_config/` maps to `~/.config/` with mode `0700`.

### Encrypted private SSH key

`private_dot_ssh/encrypted_private_id_ed25519.age` maps to `~/.ssh/id_ed25519` with mode `0600` after decryption.

### Executable template script

`dot_local/bin/executable_dotfiles-sync.tmpl` maps to `~/.local/bin/dotfiles-sync` with `0755` permissions after rendering.

### Exact directory cleanup

`exact_dot_config/helix/` ensures `~/.config/helix/` contains only files explicitly managed by chezmoi in that directory.
