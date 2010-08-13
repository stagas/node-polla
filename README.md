# polla

polla is a multiple http server proxy/router with hot code reloading and failure rollback.

## Installation

	$ npm install polla

## Usage

Start the master with:

	$ polla_master [port]

On a new shell type:

	$ polla

And you'll be presented with a list of commands on what you can do with polla.
The main command is:

	$ polla init <path/to/app.js> <hostname>

This initializes your server application and starts it.
After this, you only need to pass the `<hostname>` as an argument for the other commands in order to access your server.
Other commands include: `start`, `stop`, `restart`, `watch`, `unwatch`, `destroy`.

## Description

polla was inspired by [this](http://dracoblue.net/dev/hot-reload-for-nodejs-servers-on-code-change/173/) article but takes
it a lot further than simple hot code reloading:

With polla you can have multiple http servers running on the same IP / machine using different hostnames.
polla takes care of all the routing (with the help of [http-proxy](http://github.com/nodejitsu/node-http-proxy)), 
but also watches the .js files in your application's directory for any changes, and if any, it attempts to
run your app again, but doesn't kill the old process until the new one is considered stable (if it doesn't
crash for a short period). If the changed app crashes and is unable to start, polla rolls back to the last known
stable instance of your app so your sites don't go down.

polla passes two enviroment variables accessed with `process.env.POLLA_PORT` and `process.env.POLLA_HOST` inside
your app, so you should change your http server to `.listen()` to those.

Also, since node spawns a new http connection to your server, req.connection.remoteAddress will point to your
server's IP address. Until this is resolved somehow, polla creates a req.headers.ip variable holding the remoteAddress,
so you should use that to get the client's IP.

## Issues

The filename you pass to polla is relative to where you launched polla_master, not where polla runs.
For that, I suggest you run polla_master and polla in the same folder so you don't have to type in
absolute paths.

Also, polla might fail if you upload multiple js files at the same time through FTP (if that process
would take longer than 10 seconds). If you're unsure, do `unwatch` on your server and `restart` by hand.

Command `destroy` isn't implemented yet.
