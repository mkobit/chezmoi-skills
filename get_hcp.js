const fs = require('fs');

async function crawl() {
  const url = 'https://www.chezmoi.io/reference/templates/functions/';
  try {
    const response = await fetch(url);
    const text = await response.text();
    const regex = /<a href="(.*?hcp.*?)">/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        console.log(match[1]);
    }
  } catch (e) {
  }
}
crawl();
