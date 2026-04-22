const fs = require('fs');
async function crawl() {
  const url = 'https://www.chezmoi.io/reference/templates/hcp-vault-secret-functions/';
  const response = await fetch(url);
  console.log(response.status);
}
crawl();
