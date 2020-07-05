function uploadFiles(e) {
    // obtain file list
    var files = e.target.files;
    // compose form data object to send to the server in asynchronous post request
    // it's going to be equivalent to form with enctype 'multipart/form-data'
    // i guess this way it would be easier to send multiple fiels at once
    var formData = new FormData();
    for (var i = 0; i < files.length; i++) {
        // todo: filter the files
        formData.append('uploads', files[i], files[i].name);
    }
    var req = new XMLHttpRequest();
    req.open('POST', '/', true);

    req.onload = function () {
        if (req.status === 200) {
            // console.log('files were uploaded');
            // console.log(req.responseText);
            document.getElementById('uploadsList').innerText = req.responseText;
        } else {
            console.error('an error occurred when uploading the files');
        }
    };

    req.send(formData);
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('fetching file list now...');
    var req = new XMLHttpRequest();
    req.open('GET', '/shared-files-list', true);

    req.onload = function () {
        if (req.status === 200) {
            var files = JSON.parse(req.responseText);
            if (!files.length) {
                document.getElementById('downloadsSection').style.display = 'none';
            } else {
                document.getElementById('downloadsSection').style.display = 'block';
                console.log('fetched shared files list: ', files);
                console.log('generating download links...');
                files.forEach(function (fileName) {
                    var linkEl = document.createElement('a');
                    linkEl.href = '/download/' + encodeURI(fileName);
                    linkEl.className = 'button';
                    linkEl.innerText = fileName;
                    document.getElementById('downloadsSectionInner').appendChild(linkEl);
                });
            }
        } else {
            console.error('an error occurred when accessing shared files list');
        }
    };

    req.send();
});