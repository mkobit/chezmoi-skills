[Built-in variables](https://www.chezmoi.io/reference/templates/variables/) - Official chezmoi documentation for available `.chezmoi.*` template data.

| Variable | Type | Example value | Notes |
| --- | --- | --- | --- |
| `.chezmoi.arch` | `string` | `"amd64"` | Architecture, as returned by `runtime.GOARCH` |
| `.chezmoi.args` | `[]string` | | The arguments passed to the chezmoi command |
| `.chezmoi.cacheDir` | `string` | | The cache directory |
| `.chezmoi.config` | `object` | | The configuration, as read from the config file |
| `.chezmoi.configFile` | `string` | | The path to the configuration file used by chezmoi |
| `.chezmoi.destDir` | `string` | | The destination directory |
| `.chezmoi.executable` | `string` | | The path to the chezmoi executable, if available |
| `.chezmoi.flags` | `object` | | Selected flags passed to the chezmoi command |
| `.chezmoi.fqdnHostname` | `string` | | The fully-qualified domain name hostname of the machine |
| `.chezmoi.gid` | `string` | | The primary group ID |
| `.chezmoi.group` | `string` | `"staff"` | The group of the user running chezmoi |
| `.chezmoi.homeDir` | `string` | `"/home/user"` | The home directory of the user running chezmoi |
| `.chezmoi.hostname` | `string` | `"my-laptop"` | The hostname of the machine, up to the first `.` |
| `.chezmoi.kernel` | `object` | | Information from `/proc/sys/kernel` (Linux only) |
| `.chezmoi.os` | `string` | `"linux"` | Operating system, as returned by `runtime.GOOS` |
| `.chezmoi.osRelease` | `object` | | Information from `/etc/os-release` (Linux only) |
| `.chezmoi.pathListSeparator` | `string` | `":"` | Path list separator (`:` on Unix, `;` on Windows) |
| `.chezmoi.pathSeparator` | `string` | `"/"` | Path separator (`/` on Unix, `\` on Windows) |
| `.chezmoi.rawHomeDir` | `string` | | Home dir with Windows backslash path separator |
| `.chezmoi.sourceDir` | `string` | `"/home/user/.local/share/chezmoi"` | The source directory |
| `.chezmoi.sourceFile` | `string` | | The path of the template relative to the source directory |
| `.chezmoi.targetFile` | `string` | | The absolute path of the target file for the template |
| `.chezmoi.uid` | `string` | | The user ID |
| `.chezmoi.username` | `string` | `"alice"` | The username of the user running chezmoi |
| `.chezmoi.version.builtBy` | `string` | | Program that built chezmoi executable |
| `.chezmoi.version.commit` | `string` | | Git commit of chezmoi executable |
| `.chezmoi.version.date` | `string` | | Timestamp of chezmoi executable build |
| `.chezmoi.version.version` | `string` | | Version of chezmoi |
| `.chezmoi.windowsVersion` | `object` | | Windows version information (Windows only) |
| `.chezmoi.workingTree` | `string` | | The working tree of the source directory |
