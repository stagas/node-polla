#!/usr/bin/env node
/*
 * polla.js
 *
 * by stagas
 *
 * polla is a multiple http server proxy/router with hot code reloading and failure rollback
 */

var sys = require('sys')
  , net = require('net')
 
function log(msg) {
  sys.log(msg)
}

function logs(msg) {
  sys.log(sys.inspect(msg))
}

function connectSend(cmd, target, hostname) {
  var stream = net.createConnection('/tmp/polla_master.sock')
  stream.on('connect', function() {
    sys.log('Sending ' + cmd + ' to ' + target)
    stream.write(JSON.stringify({cmd: cmd, target: target, hostname: hostname}))
  })
  stream.on('data', function(data) {
    sys.log('POLLA: '+data)
  })
  stream.on('error', function(err) {
    sys.puts("Problem connecting. Are you sure polla_master is running?")
  })
  stream.on('end', function(err) {
    stream.destroy()
  })
  stream.on('close', function(err) {
    sys.puts('Finished.')
  })
}

function help() {
  sys.puts([ ''
    , 'polla by stagas'
    , '---------------'
    , 'Usage:'
    , ''
    , 'Initializing and starting a server:'
    , ''
    , '   polla init <folder/app.js> <hostname>'
    , ''
    , 'The following commands are available after initialization:'
    , ''
    , '   Starting a server: ........ polla start <hostname>'
    , '   Stopping a server: ........ polla stop <hostname>'
    , '   Restarting a server: ...... polla restart <hostname>'
    , '   Enable folder watching: ... polla watch <hostname>'
    , '   Disable folder watching: .. polla unwatch <hostname>'
    , '   Destroy a server: ......... polla destroy <hostname>'
    , ''
    , 'IMPORTANT NOTES: Your app should be in its own folder for code reloading to work '
      + 'properly.'
    , 'Also, process.env.POLLA_PORT and process.env.POLLA_HOSTNAME are the two '
      + 'enviroment variables passed to your app\'s instance, so your http server should be '
      + 'listening to them for polla to be able to route the traffic.'
    ].join('\n'))
}

var cmd = process.argv[2]
if (['init','start','stop','restart','watch','unwatch','destroy'].indexOf(cmd) >= 0) {
  var target = process.argv[3]
  var hostname = process.argv[4]

  connectSend(cmd.toLowerCase(), target, hostname)
} else {
  help()
}
