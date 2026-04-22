const fs = require('fs');

async function crawl() {
    try {
        const response = await fetch('https://raw.githubusercontent.com/twpayne/chezmoi/master/pkg/cmd/hcpvaultsecretstemplatefuncs.go');
        console.log(response.status);
    } catch(e) {}
}
crawl();
