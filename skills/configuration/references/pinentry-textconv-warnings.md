# Pinentry, textconv, and warnings configuration

Configuration options for pinentry integration, text conversion in diffs, and warning suppression.

## Pinentry configuration

[pinentry](https://www.chezmoi.io/reference/configuration-file/pinentry/): Configures GnuPG pinentry integration for passphrase prompting.

```toml
[pinentry]
command = "pinentry-mac"
args = ["--no-global-grab"]
options = ["allow-external-password-cache"]
```

## Textconv configuration

[textconv](https://www.chezmoi.io/reference/configuration-file/textconv/): Configures text converters to transform binary or encrypted files into plain text before computing diffs.

```toml
[[textconv]]
pattern = "*.plist"
command = "plutil"
args = ["-convert", "xml1", "-o", "-", "-"]
```

## Warnings configuration

[warnings](https://www.chezmoi.io/reference/configuration-file/warnings/): Suppresses specific chezmoi warnings.

```toml
[warnings]
configFileTemplateHasChanged = false
```
