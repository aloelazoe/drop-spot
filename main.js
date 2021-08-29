// prevent default express error handler from leaking data
process.env.NODE_ENV = 'production';

const https = require('https');
const path = require('path');
const fs = require('fs-extra');
const { spawnSync } = require('child_process');

const express = require('express');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const formidable = require('formidable');
const qrcode = require('qrcode-terminal');

// doc
// text messages are saved in "~/drop-spot/recieved-messages" directory
// newest message always has a name "0.txt"
// older messages get the number in their name increased with every new message

// todo:
// make sure default error handler doesn't leak data: https://expressjs.com/en/guide/error-handling.html
// * allow customizing all directories in the config file. figure out how to serve static files from the root but sending files for download from another folder
// * add a config file
// * save messages as files in a folder on disk. name them as numbers with '0.txt' always being the latest

const dropSpotDir = path.join(process.env['HOME'], 'drop-spot');
const paths = {
    recievedFiles: path.join(dropSpotDir, 'recieved-files'),
    hostedFiles: path.join(dropSpotDir, 'hosted-files'),
    recievedMessages: path.join(dropSpotDir, 'recieved-messages'),
}

Object.values(paths).forEach((p) => { fs.ensureDirSync(p) });

// private key and certificate files for https encryption on local network
// can be generated generated using openssl like this:
// openssl genrsa -des3 -out private-key.pem 2048
// openssl req -x509 -new -nodes -key private-key.pem -sha256 -days 1825 -out certificate.pem
// (the second line generates the root certificate)
// a passphrase can be used to encrypt the private key and generate the certificate,
// for now will just store it in a file in 'tls' directory alongside the private key and certificate
// links:
    // https://deliciousbrains.com/ssl-certificate-authority-for-local-https-development/
    // https://security.stackexchange.com/q/121163
// browser will issue a warning about certificate not being valid,
// because it's not issued by certificate authority that browser knows
// but one can add the site to the list of exeptions and secure https connection will be in use
// also can install the root certificate and set it to trusted on the whole system
const httpsOptions = {
    key: fs.readFileSync(path.join(__dirname, 'tls/private-key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'tls/certificate.pem')),
    passphrase: fs.readFileSync(path.join(__dirname, 'tls/passphrase'), {encoding: 'utf8'}),
};

const port = parseInt(process.argv[3]) || 443;
// when using '0.0.0.0' as a host, the server will be accessible over all interfaces
// it means it will be visible to other devices on the local network
// and will be accessible through its ip address on the network
const host = process.argv[2] || '0.0.0.0';
// to make it invisible to other devices, internal address '127.0.0.1' can be used
// but make sure to use it with a different port:
// default web ports like 443 and 80 won't work with the internal ip address

const app = express();

app.use(helmet());

// log ip address
app.use('/\*', (req, res, next) => {
    console.log(`\n${new Date().toJSON()}: request from ${req.ip}`);
    next();
});

// handle downloads
app.get('/shared-files-list', (req, res, next) => {
    console.log('listing shared files from ' + paths.hostedFiles);
    const files = [];
    const dir = fs.opendirSync(paths.hostedFiles);
    while (true) {
        const curEnt = dir.readSync();
        if (!curEnt) break;
        if (curEnt.isFile() && !curEnt.name.startsWith('.')) {
            files.push(curEnt.name);
        }
    }
    dir.closeSync();
    res.json(files);
});

app.get('/download/\*', (req, res, next) => {
    const fileName = path.basename(decodeURI(req.path));
    const filePath = path.join(paths.hostedFiles, fileName);
    console.log('sending file for download:', fileName);
    if (fs.stat(filePath, (err) => {
        if (!err) {
            res.download(filePath, fileName);
        } else {
            res.redirect(303, '/');
        }
    }));
});

// handle post requests
// plain text messages
app.post('/', bodyParser.text(), (req, res, next) => {
    // console.log('content type: ' + req.get('Content-Type'));

    if (typeof req.body == 'string' && req.body.length > 0) {
        // shift names of all existing messages by one, to make space
        // for our latest message which will be called '0'
        const dir = paths.recievedMessages;
        fs.readdirSync(dir)
            .filter(n => /\d+\.txt$/.test(n))
            .map(n => parseInt(n.split('.')[0]))
            .sort((a, b) => b-a)
            .forEach((n) => {
                fs.renameSync(
                    path.join(dir, n+'.txt'),
                    path.join(dir, (n+1)+'.txt')
                );
            });
        fs.writeFileSync(path.join(dir, '0.txt'), req.body, 'utf8');

        console.log(`new text message: ${dir}/0.txt`);

        res.writeHead(200, { 'content-type': 'text/plain; charset=UTF-8'});
        res.write('💌 your text message was recieved');
        res.end();
    } else {
        next();
    }
});

// handle multi-part form data with files
app.post('/', (req, res, next) => {
    // console.log('is multipart/form-data: ' + req.is('multipart/form-data'));
    const form = new formidable({
        uploadDir: paths.recievedFiles,
        multiples: true,
        keepExtensions: true,
    });
    form.parse(req, (err, fields, files) => {
        if (err) {
            next();
        }
        if (Object.keys(files).length > 0) {
            // console.log('files:', files)
            const filesArr = Array.isArray(files.uploads)? files.uploads: [files.uploads];
            res.writeHead(200, { 'content-type': 'text/plain; charset=UTF-8'});
            filesArr.forEach((file) => {
                // console.log(file);
                if (file.size < 1) {
                    // update formidable, new version has options to handle this
                    // todo: remove temp file if it was empty
                    // todo: use a different library that doesn't save files automatically
                    return;
                }
                const savePath = path.join(paths.recievedFiles, file.name);
                fs.renameSync(file.path, savePath);
                console.log('new file was uploaded:', savePath);
                res.write('uploaded ' + file.name + '\n');
            });
            res.end();
        }
    });
});
app.post('/', (req, res, next) => {
    console.log('post request not accetpted');
    res.writeHead(400, { 'content-type': 'text/plain; charset=UTF-8'});
    res.write('post request not accetpted');
    res.end();
});

// serve static files
app.use(express.static(path.join(__dirname, 'static')));

// if request wasn't handled, redirect to the main page instead of showing errors
app.use((req, res, next) => { res.redirect(303, '/') });

const server = https.createServer(httpsOptions, app);
const lanIp = getLanIp();

server.on('listening', () => {
    console.log('hosting drop spot at', `https://${server.address().address}:${server.address().port}`);
    if (lanIp) {
        const addr = `https://${lanIp}:${server.address().port}`;
        console.log('address on local network:', addr);
        qrcode.generate(addr);
    }
});
server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        console.log(`address https://${host}:${port} already in use`);
    } else if (e.code === 'EACCES') {
        console.log(`can not access port ${port} on host ${host}`);
    } else {
        console.error(e);
    }
    server.close();
});
server.listen(port, host);

function getLanIp() {
    let output;
    try {
        output = spawnSync('ifconfig');
    } catch (err) {
        console.log("couldn't get ip address on local network. perhaps ifconfig command is not accessible here?");
        return null;
    }
    const stdoutStr = output.stdout? output.stdout.toString('utf8'): '';
    const ipMatch = stdoutStr.match(/^(?!\s*?inet.*?127\.0\.0\.1.*$)\s*?inet.*?(\d*?\.\d*?\.\d*?\.\d*).*$/m);
    if (ipMatch && ipMatch[1]) {
        return(ipMatch[1]);
    }
}
