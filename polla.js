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
      , 'Usage:  polla <hostname> [--]<command> [parameters] [<command>, ...]'
      , 'Commands:  init <folder>, start, stop, restart, destroy, exit'
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


