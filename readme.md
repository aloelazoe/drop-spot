this is a little app for sharing files

it needs node.js and npm to setup and run

you will need to generate tls certificates for secure https connection (see main.js)

create a folder named 'share' in the project folder and place files that you want to share in there

files that are uploaded to the server will be saved in 'uploads' folder

default host and port are 0.0.0.0 and 443, which means the server will be accessible from other devices on local network on default https port

two optional arguments can be provided when starting the programm to specify different host and port

for example setting host to internal address so that the server won't be accessible from other devices:

`node main.js 127.0.0.1 3000`
