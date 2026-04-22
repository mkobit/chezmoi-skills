const fs = require('fs');
async function crawl() {
  const response = await fetch('https://www.chezmoi.io/reference/templates/functions/');
  const text = await response.text();
  const match = text.match(/<a href="[^"]*hcp[^"]*">([^<]+)<\/a>/g);
  console.log(match);
}
crawl();
