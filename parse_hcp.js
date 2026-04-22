const fs = require('fs');
async function crawl() {
  const url = 'https://www.chezmoi.io/reference/templates/hcp-vault-secrets-functions/';
  const response = await fetch(url);
  console.log(response.status);
  const text = await response.text();
  console.log(text.substring(0, 100));
}
crawl();
