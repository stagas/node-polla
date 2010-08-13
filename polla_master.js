#!/usr/bin/env node
/*
 * polla_master.js
 *
 * by stagas
 *
 * polla is a multiple http server proxy/router with hot code reloading and failure rollback
 */

// Fetch modules
var sys = require('sys')
  , net = require('net')
  , path = require('path')
  , child_process = require('child_process')
  , fs = require('fs')
  , http = require('http')
  , httpProxy = require('http-proxy')
  , Step = require('step')

// Common functions
function log(msg) {
  sys.log(msg)
}

function logs(msg) {
  sys.log(sys.inspect(msg))
}

// Shortcuts
var spawn = child_process.spawn
  , exec = child_process.exec

var PORT = process.argv[2] ? process.argv[2] : '127.0.0.1'

log([ '', ''
    , 'polla_master by stagas'
    , '----------------------'
    , 'Master is running at: '+ PORT
    , 'If you want to listen to another port, type:  polla_master <port>'
    , ''
    ].join('\n'))
    
// Listening commands server
var conserver = net.createServer(function(stream) {
  stream.on('connect', function() {
  })
  
  stream.on('data', function(data) {
    var args = JSON.parse(data.toString())
    
    switch (args.cmd) {
    
      case 'init':
        if (typeof args.hostname !== 'undefined') {
          Step(
            function() {
              this.fpath = args.target
              this.dpath = path.dirname(this.fpath)

              fs.stat(this.fpath, this.parallel() )
              fs.stat(this.dpath, this.parallel() )
            }
            
          , function(err, fstat, dstat) {
              if ( !err && fstat.isFile() && dstat.isDirectory() ) {
                if (typeof servers[args.hostname] === 'undefined') {
                  stream.write('Starting ' + args.target + ' at ' + args.hostname)
                  queueToStart.push( { app: this.fpath, folder: this.dpath, hostname: args.hostname } )
                } else {
                  stream.write(args.hostname + ' is USED by ' + servers[args.hostname].app + '. Server did NOT start')
                }
              } else {
                stream.write(this.fpath + ' was not found. Server did NOT start')
              }
              stream.end()
            }
          
          )
        } else {
          stream.end('You need to type in a hostname after your app')
        }
        break
      
      case 'start':
        var hostname = args.target
        
        if (typeof servers[hostname] !== 'undefined') {
          if (servers[hostname].stopped) {
            stream.write('Sending START to '+ hostname)
            startServer(hostname)
          } else {
            stream.write(hostname + ' is already STARTED')
          }
        } else {
          stream.write(hostname + ' not found. No action')
        }
        
        stream.end()
        break
        
      case 'stop':
        var hostname = args.target
        
        if (typeof servers[hostname] !== 'undefined') {
          if (!servers[hostname].stopped) {
            stream.write('Sending STOP to '+ hostname)
            stopServer(hostname)
          } else {
            stream.write(hostname + ' is already STOPPED')
          }
        } else {
          stream.write(hostname + ' not found. No action')
        }
        
        stream.end()
        break
        
      case 'restart':
        var hostname = args.target
      
        if (typeof servers[hostname] !== 'undefined') {
          if (!servers[hostname].stopped) {
            stream.write('Sending RESTART to '+ hostname)
            restartServer(hostname)
          } else {
            stream.write(hostname + ' is STOPPED. Attempting START of server instead')
            startServer(hostname)
          }
        } else {
          stream.write(hostname + ' not found. No action')
        }
        
        stream.end()
        break
      
      case 'watch':
        var hostname = args.target
      
        if (typeof servers[hostname] !== 'undefined') {
          if (servers[hostname].watched) {
            stream.write(hostname + ' is already watching files at ' + servers[hostname].folder)
          } else {
            watchFolder(hostname)
            stream.write('Started watching folder '+servers[hostname].folder+' at '+hostname)
          }
        } else {
          stream.write(hostname + ' not found. No action')
        }
      
        stream.end()
        break
        
      case 'unwatch':
        var hostname = args.target
      
        if (typeof servers[hostname] !== 'undefined') {
          if (!servers[hostname].watched) {
            stream.write(hostname + ' is already NOT watching any files at ' + servers[hostname].folder)
          } else {      
            unwatchFolder(hostname)
            stream.write('No longer watching files of '+hostname+' at '+ servers[hostname].folder)
          }
        } else {
          stream.write(hostname + ' not found. No action')
        }
        
        stream.end()
        break
        
      case 'destroy':
        break
    }
    
  })
}).listen('/tmp/polla_master.sock')

var servers = {}
  , queueToStart = []
  , queueToKill = []
  , queueToRestart = []
  , port = 7000

function newPort() {
  port++
  if (port > 7999) port = 7000
  return port
}

function addWatchServer(app, folder, hostname) {
  servers[hostname] = {
    app: app
  , folder: folder
  , files: []
  , hostname: hostname
  , port: 0
  , process: -1
  , portPool: [newPort()]
  , processPool: []
  , portStable: -1
  , processStable: -1
  , error: {}
  , stopped: false
  , watched: true
  }
  startServer(hostname)
}

function watchFolder(hostname) {
  log('Started watching folder '+servers[hostname].folder+' at '+hostname)
  servers[hostname].watched = true
  exec('find '+ servers[hostname].folder +'/. | grep "\.js$"', function(error, stdout, stderr) {
    var files = stdout.trim().split("\n")

    files.forEach(function(file) {
      servers[hostname].files.push(file)
      fs.watchFile(file, {interval : 500}, function(curr, prev) {
        if (servers[hostname].watched && (curr.mtime.valueOf() != prev.mtime.valueOf() || curr.ctime.valueOf() != prev.ctime.valueOf())) {
          log('RESTARTING '+ hostname +' because of changed file at ' + file)
          unwatchFolder(hostname)
          setTimeout(function() {
            watchFolder(hostname)
          }, 10000)
          setTimeout(function() {
            restartServer(hostname)
          }, 5000)
        }
      })
    })
  })
}

function unwatchFolder(hostname, iswatched) {
  var s = servers[hostname]
  s.files.forEach(function(file) {
    fs.unwatchFile(file)
  })
  s.files = []
  if (!iswatched) s.watched = false
  log('No longer watching folder '+ s.folder +' at '+hostname)
}

function stopServer(hostname) {
  log('Attempting to STOP '+hostname)
  var s = servers[hostname]
  s.stopped = true
  if (s.processPool[s.process]) s.processPool[s.process].kill()
  if (servers[hostname].watched) unwatchFolder(hostname, true)
}

function startServer(hostname) {
  if (typeof servers[hostname] === 'undefined') {
    log(hostname+' not found. Could not start server')
    return false
  }

  var s = servers[hostname]
  
  s.stopped = false
  if (s.watched && !s.files.length) watchFolder(hostname)
  
  s.error[s.port] = null
  
  log('Attempting START of ' + s.app + ' at ' + hostname + ':' + s.portPool[s.port])
  
  process.env.POLLA_PORT = s.portPool[s.port]
  process.env.POLLA_HOST = hostname
  s.process = s.processPool.push(spawn('node', [s.app])) - 1
  var proc = s.processPool[s.process]
  proc.__port = parseInt(s.port)
  proc.__process = parseInt(s.process)
  proc.__stopped = s.stopped ? true : false
  
  proc.stdout.on('data', function (data) {
    process.stdout.write(data)
  })
  proc.stderr.on('data', function (data) {
    sys.print(data)
  })
  proc.on('exit', function (code, sig) {
    log('Process '+ s.app +' at '+ hostname +':'+s.portPool[proc.__port]+' EXITED: '+ code +' '+ sig)
    s.error[proc.__port] = code
    if (code && !s.stopped) {
      queueToRestart.push({ hostname: hostname })
    } else {
      log(s.app + ' at '+hostname+':'+s.portPool[proc.__port]+' EXITED gracefully')
    }
    proc = null    
  })
}

function restartServer(hostname) {
  log('Attempting RESTART of ' + hostname)
  var s = servers[hostname]
  queueToRestart.push({ hostname: hostname })
}

function getPort(hostname) {
  return servers[hostname].portPool[servers[hostname].port]
}

// Set up the proxy server
httpProxy.createServer(function(req, res, proxy) {
  var hostname = req.headers.host
  req.headers.ip = req.connection.remoteAddress
  if (typeof servers[hostname] !== 'undefined') {
    // Proxy the connection to the appropriate server
    var port = getPort(hostname)
    proxy.proxyRequest(port, hostname, req, res)
  } else {
    // Fallback
    proxy.proxyRequest(8888, hostname, req, res)
  }
}).listen(80, PORT)

// Fallback server (handles unmatched servers)
var fallbackServer = http.createServer(function(req, res) {
  res.writeHead(404, { 'Content-Type': 'text/html' })
  res.end('<h1>Not Found</h1><p>The URL you requested could not be found</p>')
}).listen(8888)

function revertIfErr(hostname, oldProcess, oldPort) {
  setTimeout(function() {
    var s = servers[hostname]
      , hasErr = s.error[s.port]

    if (!s.processPool[oldProcess]) {
      log('Previous process '+s.app+' at '+hostname+':'+s.portPool[oldPort]+' didn\'t initialize, no action was performed')
    } else if (!hasErr) {
      if (s.processPool[oldProcess]) s.processPool[oldProcess].kill()
      log('Process '+s.app+' at '+hostname+':'+s.portPool[s.port]+' looks STABLE, killing previous instance')
    } else {
      log([ '************ALERT**************'
          , '*** YOUR SERVER '+ s.app +' AT '+ hostname +':'+ s.portPool[s.port] +' IS EXPERIENCING PROBLEMS ***'
          , 'Rolling back to the LAST STABLE instance at port '+ s.portPool[oldPort]
          , 'The unstable instance was KILLED'
          ].join('\n'))
      s.process = oldProcess
      s.port = oldPort
      s.error[s.port] = null
    }
  }, 15000)
}

setInterval(function() {

  var kill = queueToKill.shift()
    , start = queueToStart.shift()
    , restart = queueToRestart.shift()
  
  if (restart) {
    var hostname = restart.hostname
      , s = servers[hostname]
      , hasErr = s.error[s.port]
      
    if (!hasErr || !s.processPool[s.process]) {
      s.processStable = parseInt(s.process)
      s.portStable = parseInt(s.port)
      var oldProcess = parseInt(s.processStable)
        , oldPort = parseInt(s.portStable)
      
      s.port = s.portPool.push(newPort()) - 1
      startServer(hostname)
      revertIfErr(hostname, oldProcess, oldPort)
      
    } else {
      log('*** '+ s.app +' at '+ hostname +':'+ s.portPool[s.port] +' has ERRORS! Could not start')
      s.processPool[s.process] = null
    }
  }
  
  if (start) {
    addWatchServer(start.app, start.folder, start.hostname)
  }
  
}, 1000)
