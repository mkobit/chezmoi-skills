const fs = require('fs');

async function get_functions(url) {
  try {
    const response = await fetch(url);
    const text = await response.text();
    const regex = /<h[123][^>]*>(.*?)<\/h[123]>/g;
    let match;
    let results = [];
    while ((match = regex.exec(text)) !== null) {
      let t = match[1].replace(/<[^>]+>/g, '').trim();
      if (t && t !== 'Table of contents' && !t.includes('functions') && !t.includes('Table of contents') && t !== 'Sign-in prompt' && t !== 'Secrets Automation') {
        results.push(t);
      }
    }
    return results;
  } catch(e) {
    return [];
  }
}

async function get_code(url) {
  try {
    const response = await fetch(url);
    const text = await response.text();
    const regex = /<code[^>]*>(.*?)<\/code>/g;
    let match;
    let results = [];
    while ((match = regex.exec(text)) !== null) {
      let t = match[1].replace(/<[^>]+>/g, '').trim();
      if (t.includes('{{') || t.includes('export') || t.includes('op ') || t.includes('bw ')) {
        results.push(t);
      }
    }
    return results;
  } catch(e) {
    return [];
  }
}

(async () => {
    console.log(await get_functions('https://www.chezmoi.io/reference/templates/1password-functions/'));
    console.log(await get_code('https://www.chezmoi.io/user-guide/password-managers/1password/'));
})();
