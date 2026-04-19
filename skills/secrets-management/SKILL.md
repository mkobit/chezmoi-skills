---
version: 0.0.1
name: chezmoi-secrets-management
description: Integrate with password managers (Bitwarden, 1Password, etc.) and manage encrypted files using age or gpg.
---

## Approaches to secrets

chezmoi supports two strategies for secrets in dotfiles:

1. **Template functions** — fetch secrets at apply time from a password manager
2. **Encrypted files** — store secrets encrypted in the source repository (age or gpg)

Use template functions for secrets that may rotate.
Use encrypted files for static credentials or keys you want in-repo.

## Password manager template functions

See [password managers reference](./references/password-managers.md) for deeper integrations and full function lists.

### 1Password

```gotmpl
{{ onepassword "Item Name" "vault" "account" }}
{{ onepasswordDocument "Document Name" }}
{{ onepasswordDetailsFields "Item Name" "field" }}
```

Requires `op` CLI and active session.

### Bitwarden

```gotmpl
{{ bitwarden "item" "field" }}
{{ bitwardenFields "item" "field" }}
{{ bitwardenAttachment "filename" "item" }}
```

Requires `bw` CLI and `BW_SESSION` env var.

### pass / gopass

```gotmpl
{{ pass "path/to/secret" }}
{{ gopass "path/to/secret" }}
```

### KeePassXC

```gotmpl
{{ keepassxc "Entry Name" "field" }}
```

Requires `keepassxc-cli`.

### macOS Keychain

```gotmpl
{{ keychain "service" "account" }}
```

### Vault (HashiCorp)

```gotmpl
{{ vault "secret/path" "key" }}
```

### Generic: environment variable fallback

```gotmpl
{{ env "MY_SECRET" }}
```

Use sparingly — environment variables are less secure than a password manager.

## Encrypted files with age

See [encryption reference](./references/encryption.md) for detailed configuration options.

### Age setup

```toml
# chezmoi.toml
encryption = "age"

[age]
  identity = "~/.config/chezmoi/key.txt"
  recipient = "age1..."
```

Generate a key:

```sh
age-keygen -o ~/.config/chezmoi/key.txt
```

### Add an encrypted file with age

```sh
chezmoi add --encrypt ~/.ssh/id_ed25519
```

chezmoi stores the file as `encrypted_private_dot_ssh/encrypted_id_ed25519.age` in the source.

### Decryption at apply time

The identity file must be present and readable.

## Encrypted files with gpg

See [encryption reference](./references/encryption.md) for detailed configuration options.

### GPG setup

```toml
# chezmoi.toml
encryption = "gpg"

[gpg]
  recipient = "user@example.com"
  symmetric = false
```

### Add an encrypted file with gpg

```sh
chezmoi add --encrypt ~/.netrc
```

### Symmetric encryption (no key pair required)

```toml
[gpg]
  symmetric = true
```

chezmoi prompts for a passphrase on add and apply.

## Source state naming for encrypted files

Encrypted files in the source dir are named with the `encrypted_` prefix:

- `encrypted_dot_netrc.age` → `~/.netrc`
- `encrypted_private_dot_ssh/encrypted_id_ed25519.age` → `~/.ssh/id_ed25519`

The `.age` or `.asc` extension is stripped at apply time.

## Secret templates in config

You can use password manager functions directly in `chezmoi.toml.tmpl`:

```toml
[data]
  gitSigningKey = "{{ onepasswordDetailsFields "GPG Key" "public key" }}"
```

## Best practices

- Store the age identity or gpg private key outside the source repository
- Rotate secrets in the password manager, not in chezmoi templates
