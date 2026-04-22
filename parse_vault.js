const fs = require('fs');

async function processFile(url) {
    const response = await fetch(url);
    const text = await response.text();
    console.log(text);
}

async function run() {
    await processFile('https://raw.githubusercontent.com/twpayne/chezmoi/master/assets/chezmoi.io/docs/reference/templates/hcp-vault-secrets-functions/hcpVaultSecret.md');
}
run();
