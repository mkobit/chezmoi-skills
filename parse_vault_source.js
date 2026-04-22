const fs = require('fs');
async function crawl() {
  const response = await fetch('https://raw.githubusercontent.com/twpayne/chezmoi/master/pkg/cmd/templatefuncs.go');
  const text = await response.text();
  const match = text.match(/vault/i);
  console.log(match);
}
crawl();
