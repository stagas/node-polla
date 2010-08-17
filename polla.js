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
  , asciimo = require('asciimo').Figlet
  , colors = require('colors')
 
function log(msg) {
  sys.log(msg)
}

function logs(msg) {
  sys.log(sys.inspect(msg))
}

function connectSend(args) {
  var stream = net.createConnection('/tmp/polla_master.sock')
  stream.on('connect', function() {
    stream.write(args)
  })
  stream.on('data', function(data) {
    data.toString().split('\t\n').forEach(function(e,i,a) {
      if (i<a.length-1) sys.log('polla - '+e)
    })
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

function help(callback) {
  //
  asciimo.write('polla', 'eftiwater', function(art) {
    var col = [
          'yellow', 'cyan', 'magenta', 'green', 'red', 'blue' ]
      , cnt = 0
      , artcol = []
      , rnd = 0
      
    art.toString().split('\n').forEach(function(e) {
      rnd = Math.floor((Math.random() * col.length))
      eval(
        'artcol.push(e.' + col[rnd] + '); ' 
      )
      rnd = Math.floor((Math.random() * col.length))      
    })
    artcol.pop()
    
    sys.puts(
      [ artcol.join('\n')
      , eval('\'==================\'.' + col[rnd])
      , 'Usage:'
      , '   polla <hostname> [--]<command> [parameters] [<command>, ...]'
      , ''
      , 'Commands:'
      , ''
      , '   Initialize a server: ...... init <folder/app.js>'
      , '   Starting a server: ........ start'
      , '   Stopping a server: ........ stop'
      , '   Restarting a server: ...... restart'
      , '   Enable folder watching: ... watch'
      , '   Disable folder watching: .. unwatch'
      , '   Server status: ............ status|stat'
      , '   Destroy a server: ......... destroy|kill'
      , '   Killing polla_master: ..... exit|die'
      , ''
      , 'IMPORTANT NOTES: Your app should be in its own folder for code reloading to work '
        + 'properly.'
      , 'Also, process.env.POLLA_PORT and process.env.POLLA_HOSTNAME are the two '
        + 'enviroment variables passed to your app\'s instance, so your http server should be '
        + 'listening to them for polla to be able to route the traffic.'
      , '-----------------------------------------------------------'
      ].join('\n')
    )
    
    if (callback) callback()
    
  })
}

//var cmd = process.argv[3].toLowerCase()

//if (['init','start','stop','restart','watch','unwatch','destroy'].indexOf(cmd) >= 0) {
//  var hostname = process.argv[2]
//    , app = process.argv[4]

help()
  
connectSend(process.argv.slice(2).join(' '))


