const fs = require('fs');

async function check() {
    let urls = [
      'https://raw.githubusercontent.com/twpayne/chezmoi/master/docs/reference/templates/1password-functions.md',
      'https://raw.githubusercontent.com/twpayne/chezmoi/master/docs/reference/templates/bitwarden-functions.md',
      'https://raw.githubusercontent.com/twpayne/chezmoi/master/docs/reference/templates/keepassxc-functions.md',
      'https://raw.githubusercontent.com/twpayne/chezmoi/master/docs/reference/templates/vault-functions.md',
    ];
    for (const url of urls) {
        const response = await fetch(url);
        if (response.status === 200) {
            console.log(await response.text());
        } else {
            console.log('Failed:', url);
        }
    }
}
check();
