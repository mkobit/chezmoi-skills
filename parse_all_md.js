const fs = require('fs');

async function processFile(url) {
    const response = await fetch(url);
    const text = await response.text();
    const regex = /^\#\# (.*?)$/gm;
    let results = [];
    let match;
    while((match = regex.exec(text)) !== null) {
        results.push(match[1]);
    }
    return results;
}

async function run() {
    console.log(await processFile('https://raw.githubusercontent.com/twpayne/chezmoi/master/assets/chezmoi.io/docs/reference/templates/1password-functions/index.md'));
    console.log(await processFile('https://raw.githubusercontent.com/twpayne/chezmoi/master/assets/chezmoi.io/docs/reference/templates/bitwarden-functions/index.md'));
}
run();
