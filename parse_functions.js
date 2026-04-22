const fs = require('fs');

async function extract(urls) {
  for (const url of urls) {
    console.log('\n---', url, '---');
    const response = await fetch(url);
    const html = await response.text();
    const regex = /<h3[^>]*id="(.*?)"[^>]*>(.*?)<\/h3>/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
        console.log(match[2].replace(/<[^>]+>/g, '').trim());
    }
  }
}

const urls = [
  'https://www.chezmoi.io/reference/templates/1password-functions/',
  'https://www.chezmoi.io/reference/templates/bitwarden-functions/',
  'https://www.chezmoi.io/reference/templates/pass-functions/',
  'https://www.chezmoi.io/reference/templates/keepassxc-functions/',
  'https://www.chezmoi.io/reference/templates/gopass-functions/',
  'https://www.chezmoi.io/reference/templates/keyring-functions/keyring/',
  'https://www.chezmoi.io/reference/templates/vault-functions/vault/',
  'https://www.chezmoi.io/reference/templates/lastpass-functions/',
  'https://www.chezmoi.io/reference/templates/doppler-functions/',
  'https://www.chezmoi.io/reference/templates/azure-key-vault-functions/azureKeyVault/',
  'https://www.chezmoi.io/reference/templates/hcp-vault-secrets-functions/hcpVaultSecret/'
];

extract(urls);
