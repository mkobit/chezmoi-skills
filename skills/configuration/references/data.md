# Data Injection and Templates

Reference: <https://www.chezmoi.io/user-guide/templating/#template-data>
How to structure custom data injection and variables in `chezmoi`.

## Template Data

chezmoi provides a variety of template variables. For a full list, run `chezmoi data`.

These come from a variety of sources (later data overwrite earlier ones):

* Variables populated by chezmoi are in `.chezmoi`, for example `.chezmoi.os`.
* Variables created by you in `.chezmoidata.$FORMAT` configuration files. The various supported formats (`json`, `jsonc`, `toml`, and `yaml`) are read in alphabetical order.
* Variables created by you in the `data` section of the configuration file.

### Data Section Config

You can place custom fields directly in the configuration file under `[data]`:

```toml
[data]
  email = "user@example.com"
  name = "User Name"
  gitEmail = "work@company.com"
  personal = false
  os = "linux"
```

### External Data Files

External data files can be placed at `~/.local/share/chezmoi/.chezmoidata.toml` or `.chezmoidata.yaml`.

```toml
# ~/.local/share/chezmoi/.chezmoidata.toml
[git]
  email = "user@example.com"
```

```yaml
# ~/.local/share/chezmoi/.chezmoidata.yaml
git:
  email: "user@example.com"
```

### Using Data in Templates

Data is accessible directly on the top-level template context:

```gotemplate
{{ .email }}
{{ .name }}
{{ if eq .chezmoi.os "linux" }}
# Linux config
{{ end }}
```
