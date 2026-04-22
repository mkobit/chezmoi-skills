const fs = require('fs');
async function crawl() {
  const response = await fetch('https://www.chezmoi.io/reference/templates/azure-key-vault-functions/');
  console.log(response.status);
}
crawl();
