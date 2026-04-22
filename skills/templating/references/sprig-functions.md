[Sprig function library](http://masterminds.github.io/sprig/) - Documentation for the Sprig functions included in chezmoi templates.
[chezmoi template functions](https://www.chezmoi.io/reference/templates/functions/) - Official documentation for functions added by chezmoi.

## Sprig Functions

### String Functions

- `trim str`: Removes whitespace from both sides of a string.
- `trimAll chars str`: Removes given characters from the front or back of a string.
- `trimSuffix suffix str`: Trims just the suffix from a string.
- `trimPrefix prefix str`: Trims just the prefix from a string.
- `upper str`: Converts the entire string to uppercase.
- `lower str`: Converts the entire string to lowercase.
- `title str`: Converts to title case.
- `untitle str`: Removes title casing.
- `repeat count str`: Repeats a string multiple times.
- `substr start end str`: Gets a substring from a string.
- `nospace str`: Removes all whitespace from a string.
- `trunc len str`: Truncates a string.
- `abbrev max str`: Truncates a string with ellipses.
- `abbrev both max str`: Truncates both sides.
- `contains substr str`: Tests to see if one string is contained inside of another.
- `hasPrefix prefix str`: Tests whether a string has a given prefix.
- `hasSuffix suffix str`: Tests whether a string has a given suffix.
- `quote str`: Wraps a string in double quotes.
- `squote str`: Wraps a string in single quotes.
- `cat str1 str2...`: Concatenates multiple strings into one, separated by spaces.
- `indent count str`: Indents every line in a given string to the specified indent width.
- `nindent count str`: Indents and prepends a new line.
- `replace old new str`: Performs simple string replacement.
- `plural one many count`: Returns `one` if count is 1, and `many` otherwise.

### String List Functions

- `splitList sep str`: Splits a string into a list of strings using a separator.
- `sortAlpha list`: Sorts a list of strings in alphabetical order.

### Math Functions

- `add a b`: Sums numbers.
- `add1 a`: Increments by 1.
- `sub a b`: Subtracts numbers.
- `div a b`: Performs integer division.
- `mod a b`: Modulo.
- `mul a b`: Multiplies numbers.
- `max a b...`: Returns the largest of a series of integers.
- `min a b...`: Returns the smallest of a series of integers.
- `floor float`: Returns the greatest float value less than or equal to x.
- `ceil float`: Returns the least float value greater than or equal to x.
- `round float precision`: Rounds a float to a given decimal precision.
- `randInt min max`: Returns a random integer value between min and max.

### Defaults Functions

- `default default_val actual_val`: Provides a default value if the actual value is empty.
- `empty val`: Returns true if the given value is considered empty.
- `coalesce vals...`: Takes a list of values and returns the first non-empty one.
- `fromJson str`: Decodes a JSON document into a dict.
- `toJson dict`: Encodes an item into a JSON string.
- `toPrettyJson dict`: Encodes an item into a pretty (indented) JSON string.
- `toRawJson dict`: Encodes an item into JSON without escaping HTML characters.
- `ternary true_val false_val bool`: Takes two values, and a test value. If the test value is true, the first value will be returned.

### Lists and Dicts Functions

- `list vals...`: Creates a list from its arguments.
- `first list`: Returns the first item in a list.
- `rest list`: Returns all but the first item.
- `last list`: Returns the last item.
- `initial list`: Returns all but the last item.
- `append list val`: Appends a new item to an existing list.
- `prepend list val`: Pushes an element onto the front of a list.
- `concat lists...`: Concatenates multiple lists.
- `reverse list`: Reverses a list.
- `uniq list`: Generates a list with all of the duplicates removed.
- `without list val`: Filters items out of a list.
- `has list val`: Tests to see if a list has a particular element.
- `compact list`: Removes empty items from a list.
- `dict key1 val1 key2 val2...`: Creates a dictionary from a list of keys and values.
- `get dict key`: Gets the value for a key in a dictionary.
- `set dict key val`: Adds a new key/value pair to a dictionary.
- `hasKey dict key`: Tests whether a dictionary contains a key.
- `pluck key dicts...`: Gives a list of all of the values with the given key.
- `keys dict`: Returns a list of all of the keys in one or more dictionaries.
- `pick dict keys...`: Selects just the given keys out of a dictionary.
- `omit dict keys...`: Removes the given keys from a dictionary.
- `values dict`: Returns the list of values in a dictionary.
- `deepCopy dict`: Returns a deep copy of a dictionary.

### Type Conversion Functions

- `atoi str`: Converts a string to an integer.
- `int64 val`: Converts a value to an int64.
- `int val`: Converts a value to an int.
- `float64 val`: Converts to a float64.
- `toString val`: Converts a given value to a string.
- `toStrings list`: Converts a list of values to a list of strings.

### Path and Filepath Functions

- `base path`: Returns the last element of path.
- `dir path`: Returns the directory component of the path.
- `ext path`: Returns the file name extension.
- `clean path`: Returns the shortest path name equivalent to path.
- `isAbs path`: Reports whether the path is absolute.

### OS Functions

- `env var`: Reads an environment variable.
- `expandenv str`: Expands environment variables in a string.

## chezmoi-specific Functions

### File and Path Functions

- `joinPath paths...`: Joins path elements into a single path.
- `lookPath exec`: Searches for an executable named `exec` in the directories named by the `PATH` environment variable.
- `findExecutable execs...`: Finds the first executable in the list in `$PATH`.
- `findOneExecutable exec dict`: Finds the first executable from a dict of possible paths.
- `isExecutable path`: Returns true if the file is executable.
- `stat path`: Returns file information.
- `lstat path`: Returns file information, not following symlinks.

### Command Execution

- `exec cmd args...`: Executes a command and returns its standard output.
- `output cmd args...`: Same as exec.
- `outputList cmd args...`: Returns the standard output of a command split by lines.

### Data Conversion and Formatting

- `fromJsonc str`: Decodes a JSONC document into a dict.
- `fromToml str`: Decodes a TOML document into a dict.
- `fromYaml str`: Decodes a YAML document into a dict.
- `fromIni str`: Decodes an INI document into a dict.
- `toToml dict`: Encodes an item into a TOML string.
- `toYaml dict`: Encodes an item into a YAML string.
- `toIni dict`: Encodes an item into an INI string.

### Utility Functions

- `eqFold str1 str2`: Returns true if the two strings are equal under Unicode case-folding.
- `glob pattern`: Returns a list of filenames matching the shell pattern.
- `globCaseInsensitive pattern`: Case-insensitive glob.
- `include path`: Returns the contents of a file as a string.
- `includeTemplate name data`: Includes another template by name, passing data.
- `deleteValueAtPath path dict`: Deletes a value at a dot-separated path in a dict.
- `setValueAtPath path val dict`: Sets a value at a dot-separated path in a dict.
- `pruneEmptyDicts dict`: Removes empty dictionaries from a dict.

### Secret Manager and External Functions

Functions for integrating with secret managers like `bitwarden`, `onepassword`, `pass`, `vault`, `gopass`, `keepassxc`, `keeper`, `lastpass`, `ejson`, `doppler`, `dashlane`, `awsSecretsManager`, `azureKeyVault`, `secret`, as well as GitHub (`gitHubKeys`, `gitHubLatestRelease`, etc.). These typically return data as strings or dicts from the respective tools.
