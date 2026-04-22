const fs = require('fs');

async function crawl() {
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

  for (const url of urls) {
    try {
      const response = await fetch(url);
      const text = await response.text();
      fs.writeFileSync('crawl_' + url.split('/').filter(Boolean).pop() + '.html', text);
      console.log('Crawled', url);
    } catch (e) {
      console.error('Failed', url, e);
    }
  }
}
crawl();
