import https from 'https';

const url = 'https://hangar.papermc.io/api/v1/projects/LuckPerms/versions/latest/download';
https.get(url, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`HEADERS: ${JSON.stringify(res.headers, null, 2)}`);
    res.on('data', (chunk) => {
        console.log(`BODY: ${chunk}`);
    });
}).on('error', (e) => {
    console.error(`ERROR: ${e.message}`);
});
