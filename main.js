const https = require('https');
const path = require('path');
const fs = require('fs-extra');
const express = require('express');
const helmet = require('helmet');
const formidable = require('formidable');

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
app.get('/shared-files-list', (req, res, next) => {
    const sharePath = path.join(__dirname, 'share');
    console.log('listing shared files from ' + sharePath);
    const files = [];
    fs.ensureDirSync(sharePath);
    const dir = fs.opendirSync(sharePath);
    while (true) {
        curEnt = dir.readSync();
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
    const filePath = path.join(__dirname, 'share', fileName);
    console.log('sending file for download:', fileName);
    if (fs.stat(filePath, (err) => {
        if (!err) {
            res.download(filePath, fileName);
        } else {
            res.redirect(303, '/');
        }
    }));
});
app.post('/', (req, res, next) => {
    const uploadsPath = path.join(__dirname, 'uploads');
    fs.ensureDirSync(uploadsPath);
    const form = new formidable({
        uploadDir: uploadsPath,
        multiples: true,
        keepExtensions: true,
    });
    form.parse(req, function (err, fields, files) {
        // console.log('files:', files)
        const filesArr = Array.isArray(files.uploads)? files.uploads: [files.uploads];
        res.writeHead(200, { 'content-type': 'text/plain; charset=UTF-8'});
        filesArr.forEach((file) => {
            // console.log(file);
            if (file.size < 1) {
                // todo: remove temp file if it was empty
                // todo: use a different library that doesn't save files automatically
                return;
            }
            const savePath = path.join(uploadsPath, file.name);
            fs.renameSync(file.path, savePath);
            console.log('new file was uploaded:', savePath);
            res.write('uploaded ' + file.name + '\n');
        });
        res.end();
    });
});
app.use(express.static(path.join(__dirname, 'static')));
// if request wasn't handled, redirect to the main page instead of showing errors
app.use((req, res, next) => { res.redirect(303, '/') });

const server = https.createServer(httpsOptions, app);

server.on('listening', () => {
    console.log('hosting drop spot at', `https://${server.address().address}:${server.address().port}`);
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
