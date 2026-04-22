# Encryption

References:

- age: <https://www.chezmoi.io/user-guide/encryption/age/>
- gpg: <https://www.chezmoi.io/user-guide/encryption/gpg/>

## age

Generate a key using `chezmoi age-keygen`:

```bash
chezmoi age-keygen --output=$HOME/key.txt
```

### age configuration

```toml
encryption = "age"

[age]
  identity = "/home/user/key.txt"
  recipient = "age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p"
```

chezmoi supports multiple identities and multiple recipients:

```toml
encryption = "age"

[age]
  identities = ["/home/user/key1.txt", "/home/user/key2.txt"]
  recipients = ["recipient1", "recipient2"]
```

### age symmetric encryption

To use age's symmetric encryption, specify a single identity and enable symmetric encryption in your config file:

```toml
encryption = "age"

[age]
  identity = "~/.ssh/id_rsa"
  symmetric = true
```

### age symmetric encryption with a passphrase

```toml
encryption = "age"

[age]
  passphrase = true
```

## gpg

### gpg asymmetric (private/public-key) encryption

Specify the encryption key to use in your configuration file (`chezmoi.$FORMAT`) with the `gpg.recipient` key:

```toml
encryption = "gpg"

[gpg]
  recipient = "user@example.com"
```

### gpg symmetric encryption

```toml
encryption = "gpg"

[gpg]
  symmetric = true
```

### gpg encrypting files with a passphrase

If you want to encrypt your files with a passphrase:

```gotemplate
{{ $passphrase := promptStringOnce . "passphrase" "passphrase" -}}

encryption = "gpg"

[data]
  passphrase = {{ $passphrase | quote }}

[gpg]
  symmetric = true
  args = ["--batch", "--passphrase", {{ $passphrase | quote }}, "--no-symkey-cache"]
```

## Re-encrypting when keys change

If you change your encryption keys or add new recipients, you need to re-encrypt all encrypted files so they use the new configuration.

You can re-encrypt all files with:

```bash
chezmoi chattr +encrypt $(chezmoi managed --include=encrypted)
```

After modifying your keys and running the command above, apply the changes to push them back to your target state.
