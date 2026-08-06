# Encryption references

chezmoi supports file-level encryption using `age` or `gpg` backends.

## Encrypted files with age

### Age setup

```toml
# chezmoi.toml
encryption = "age"

[age]
  identity = "~/.config/chezmoi/key.txt"
  recipient = "age1..."
```

Set `encryption` before any section header in `chezmoi.toml`.
Use `identities` and `recipients` (plural array lists) when specifying multiple keys.

Generate an age key (`chezmoi age-keygen` works without installing external `age`):

```sh
chezmoi age-keygen --output ~/.config/chezmoi/key.txt
```

### Adding encrypted files with age

```sh
chezmoi add --encrypt ~/.ssh/id_ed25519
```

chezmoi stores the file as `private_dot_ssh/encrypted_private_id_ed25519.age` in the source repository.
The `encrypted_` prefix applies only to files and never to directories.

### Decryption at apply time

The identity file must be present and readable when running `chezmoi apply`.

## Encrypted files with GPG

### GPG setup

```toml
# chezmoi.toml
encryption = "gpg"

[gpg]
  recipient = "user@example.com"
  symmetric = false
```

### Adding encrypted files with GPG

```sh
chezmoi add --encrypt ~/.netrc
```

### Symmetric GPG encryption

Use symmetric GPG encryption without requiring a key pair:

```toml
[gpg]
  symmetric = true
```

chezmoi prompts for a passphrase on `add` and `apply`.

## Source state naming for encrypted files

Encrypted files in the source directory use the `encrypted_` prefix:

- `encrypted_dot_netrc.age` → `~/.netrc`
- `private_dot_ssh/encrypted_private_id_ed25519.age` → `~/.ssh/id_ed25519`

The `.age` or `.asc` extension is stripped at apply time.

## Encrypted files with rage

chezmoi supports Rust `rage` as an alternative age implementation:

```toml
# chezmoi.toml
encryption = "age"

[age]
  command = "rage"
  identity = "~/.config/chezmoi/key.txt"
  recipient = "age1..."
```

## Transparent repository encryption

chezmoi supports `transparent` mode when using repository-level encryption filters (`transcrypt` or `git-crypt`).

```toml
# chezmoi.toml
encryption = "transparent"
```

Configure `.gitattributes` inside the chezmoi source directory to encrypt matching source files:

```text
encrypted_* filter=crypt diff=crypt merge=crypt
```

## Upstream documentation links

- [Encryption overview](https://www.chezmoi.io/user-guide/encryption/): Overview of how chezmoi encrypts and stores files using various backends.
- [Age encryption](https://www.chezmoi.io/user-guide/encryption/age/): Guide on setting up and using the age encryption backend with chezmoi, including symmetric and passphrase modes.
- [GPG encryption](https://www.chezmoi.io/user-guide/encryption/gpg/): Guide on configuring and using GPG (symmetric and asymmetric) for file encryption in chezmoi.
- [Encryption FAQ](https://www.chezmoi.io/user-guide/frequently-asked-questions/encryption/): Key rotation and re-encryption procedure (apply, update config, `chezmoi forget`, re-add with `--encrypt`).
