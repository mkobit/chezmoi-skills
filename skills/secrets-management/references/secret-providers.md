# Secret providers and CLI helpers

chezmoi supports Unix pass, gopass, native OS keyrings, generic CLI helper tools, and cloud provider secret managers.

## pass and gopass

`pass` and `gopass` template functions execute standard Unix password store commands.

| Function | Signature | Description |
| --- | --- | --- |
| `pass` | `pass "path/to/secret"` | Returns first line of output |
| `passFields` | `passFields "path/to/secret"` | Parses key-value lines into map object |
| `passRaw` | `passRaw "path/to/secret"` | Returns complete raw output |
| `gopass` | `gopass "path/to/secret"` | Returns first line of gopass secret |
| `gopassRaw` | `gopassRaw "path/to/secret"` | Returns full gopass secret output |

```gotmpl
{{ pass "path/to/secret" }}
{{ (passFields "path/to/secret").password }}
{{ gopass "path/to/secret" }}
```

## OS keyring

The `keyring` template function retrieves credentials from system keychains (macOS Keychain, GNOME Keyring, or Windows Credentials Manager).

```gotmpl
{{ keyring "service" "user" }}
```

Store credentials in the OS keyring using the `chezmoi secret keyring` subcommand:

```sh
chezmoi secret keyring set --service=$SERVICE --user=$USER
```

## Generic CLI secret tools

The `secret` and `secretJSON` template functions execute custom secret helper binaries specified in `.chezmoi.toml`.

```toml
[secret]
    command = "vault"
```

```gotmpl
{{ secret "arg" }}
{{ secretJSON "kv" "get" "-format=json" "$ID" }}
```

`secret` returns raw stdout with leading and trailing whitespace trimmed.
`secretJSON` parses stdout as JSON.

## Additional secret providers

| Provider | Template functions / Usage |
| --- | --- |
| AWS Secrets Manager | `{{ awsSecretsManager "secret-id" }}` / `{{ awsSecretsManagerRaw "secret-id" }}` |
| Azure Key Vault | `{{ azureKeyVault "vaultName" "secretName" }}` |
| Doppler | `{{ doppler "project" "config" "secret" }}` / `{{ dopplerProjectJson "project" "config" }}` |
| Dashlane | `{{ dashlanePassword "item" }}` / `{{ dashlaneNote "item" }}` |
| ejson | `{{ ejsonDecrypt "path/to/key" "path/to/ejson" }}` |
| Keeper | `{{ keeper "record-title" }}` / `{{ keeperDataFields "record-title" }}` |
| LastPass | `{{ lastpass "name" }}` |
| Proton Pass | `{{ protonpass "item-name" }}` |

## Upstream documentation links

- [pass functions](https://www.chezmoi.io/reference/templates/pass-functions/): Template functions for retrieving passwords and fields using Unix pass.
- [gopass functions](https://www.chezmoi.io/reference/templates/gopass-functions/): Template functions for the gopass password manager.
- [Keychain functions](https://www.chezmoi.io/reference/templates/keyring-functions/keyring/): Template function for retrieving passwords from OS keyrings.
- [Generic secret functions](https://www.chezmoi.io/reference/templates/secret-functions/): Generic functions for executing external commands to retrieve secrets.
