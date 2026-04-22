const fs = require('fs');

async function extract(urls) {
  for (const url of urls) {
    console.log('\n---', url, '---');
    const response = await fetch(url);
    const html = await response.text();
    // try to match the code blocks or strong tags?
    const regex = /<code[^>]*>(.*?)<\/code>/g;
    let match;
    let set = new Set();
    while ((match = regex.exec(html)) !== null) {
        let t = match[1].replace(/<[^>]+>/g, '').trim();
        if (t.includes('onepassword') || t.includes('bitwarden') || t.includes('rbw') || t.includes('pass') || t.includes('keepassxc') || t.includes('gopass') || t.includes('keyring') || t.includes('vault') || t.includes('lastpass') || t.includes('doppler') || t.includes('azure') || t.includes('hcp')) {
            set.add(t);
        }
    }
    console.log(Array.from(set));
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
  'https://www.chezmoi.io/reference/templates/azure-key-vault-functions/azureKeyVault/'
];

extract(urls);
