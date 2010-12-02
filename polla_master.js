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
  , asciimo = require('asciimo').Figlet
  , colors = require('colors')

var logo = null

process.on('uncaughtException', function (err) {
  var s = err.stack.split('\n')
  s.shift()
  console.log(s)
})

// Common functions
function findAllJsFiles(path, callback) {
  fs.stat(path, function(err, fstat){
    if (err) { 
      log.errorNW('Error retrieving stats for file: ' + path)
    } else {
      if (fstat.isDirectory()) {
        fs.readdir(path, function(err, fileNames) {
          if(err) {
            log.errorNW('Error reading path: ' + path);
          }
          else {
            fileNames.forEach(function (fileName) {
              findAllJsFiles(path + '/' + fileName, callback);
            })
          }
        })
      } else {
        if(path.match(/.*\.(js|node)/)) {
          callback(path)
        }
      }
    }
  })
}

Array.prototype.parseInt = function() {
  var self = this
  this.forEach(function(e, i) {
    self[i] = parseInt(e)
  })
  return this
}

function log(msg) {
  sys.log(msg)
}

function logs(msg) {
  sys.log(sys.inspect(msg))
}

function loga(msg) {
  if (msg) sys.log(msg.join('\n'))
}

//
// Main app
//

var configFile = './config.json'

// Check args for help or alternate config file
var args = process.argv.slice(2)
while (arg = args.shift()) {
  if (arg === "--help" || arg === "-h" || arg === "-?") {
    help(function() {
      process.exit()
    })
  } else if (arg === "--config" || arg === "-c") {
    configFile = args.shift()
  }
}

var config = {
  defaults: {
    ip: "127.0.0.1"
  , listen: 8080
  , ports: [ 7000, 7999 ]
  }
}

var configJSON = null

try {
  configJSON = fs.readFileSync(configFile, 'utf8')
  config = JSON.parse(configJSON)  
} catch(e) {
  log(e)
  log('Unable to read config, using defaults or command line options')
}

config.ip = config.defaults.ip || defaults.ip
config.listen = config.defaults.listen || defaults.listen
config.ports = config.defaults.ports || defaults.ports

// Command line options overrides
var arg, args = process.argv.slice(2)
while (arg = args.shift()) {
  if (arg === "--ip" || arg === "-i") {
    config.ip = args.shift()
  } else if (arg === "--listen" || arg === "-l") {
    config.listen = parseInt(args.shift())
  } else if (arg === "--ports" || arg === "-p") {
    config.ports = args.shift().toString().split('-').parseInt()
  }
}

function help(callback) {
  //
  asciimo.write('polla_master', 'eftiwater', function(art) {
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
      , eval('\'=============================================\'.' + col[rnd])
      , 'Usage:   polla_master [options]'
      , ''
      , 'Options:'
      , '  -i|--ip <IPAddress>                    // 127.0.0.1'
      , '    The IP address you want polla_master server to listen to'
      , ''
      , '  -l|--listen <port>                     // 8080'
      , '    The port number of polla_master'
      , ''
      , '  -p|--ports <fromPort-toPort>           // 7000-7999'
      , '    The ports range of the proxied servers'
      , ''
      , '  -c|--config </path/to/config.json>     // ./config.json'
      , '    Path to the configuration file you want to use'
      , ''
      , '  -h|--help|-?'
      , '    Help'
      ].join('\n')
    )
   callback()
   
  })
  

}

var ServerProcess = function(server) {
  this.server = server
  this.hostname = server.hostname
  this.app = server.app
  this.port = parseInt(server.port)
  this.process = null
  this.error = null
  this.stable = false
  this.exited = false
}

ServerProcess.prototype = {
  spawn: function() {
    var self = this

    process.env.POLLA_HOST = this.hostname
    process.env.POLLA_PORT = this.port
    
    try {
      this.process = child_process.spawn('node', [this.app])
    } catch(e) {
      log(e)
      if (!self.error) self.error = true
      self.server.retries = 0
      self.server.started = false
      self.server.trySpawn()
      return
    }
    
    this.process.stdout.on('data', function (data) {
      process.stdout.write(data)
    })
    
    this.process.stderr.on('data', function (data) {
      sys.print(data)
    })
    
    this.process.on('exit', function (err, sig) {
      self.error = err
      self.exited = true
      
      if (self.error || self.server.started) {
        log.error(self, 'Process exited with error: ' + err + ' ' + sig)
        if (self.server.started) {
          log.error(self, 'Server crashed while running. A restart will be attempted')
          if (!self.error) self.error = true
          self.server.retries = 0
          self.server.started = false
          self.server.trySpawn()
        }
      } else {
        log.success(self, 'Process exited gracefully')
      }
    })
  }

, kill: function(cb) {
    var self = this
    if (this.process) {
      log.say(this, 'Sending KILL signal to process')
      if (this.process) {
        try {
          this.process.removeAllListeners('exit') //, function() {
          this.process.removeAllListeners('close')
          this.process.removeAllListeners('error')
          child_process.exec('kill '+ self.process.pid)
          //})
        } catch(e) {
          log(e)
          return cb(true)
        }
      }
      if (cb) cb(false)
    } else {
      log.notice(this, 'Process does not exist. Cannot KILL')
      if (cb) cb(true)
    }
  }
}

var Server = function(hostname, app) {
  this.hostname = hostname
  this.app = app
  this.folder = path.dirname(app)
  this.port = null
  this.started = false
  this.watched = false
  this.unwatched = false
  this.changed = false
  
  this.files = []
  
  this.process = null
  this.processPool = []
  
  this.retries = 0
  this.retry = null
}

Server.prototype = {
  start: function() {
    if (this.started) return log.notice(this, 'Already started')

    log.say(this, 'Starting server...')

    this.trySpawn()
    
    if (!this.unwatched && !this.watched) this.watch()
  }

, status: function() {
    log.say(this, 'Should have some status here...')
  }
  
, stop: function(cb) {
    if (!this.started) {
      if (cb) cb(false)
      return log.notice(this, 'Already stopped')
    }
    this.started = false
    
    log.say(this, 'Stopping server...')

    if (this.process) this.process.kill(cb)
    this.process = null
  }

, restart: function() {
    var self = this
    
    this.stop(function(err) {
      if (!err) self.start()
      else log.error(self, 'Could not restart server')
    })
  }
  
, watch: function() {
    if (this.watched && !this.unwatched) return log.notice(this, 'Already watching')
    
    var self = this
    
    log.say(this, 'Started watching folder: ' + this.folder)
    
    this.watched = true
    this.unwatched = false
    
    findAllJsFiles(this.folder, function(watch) {
    
      self.files.push(watch)
      
      fs.watchFile(watch, function(oldStat, newStat) {
        if (newStat.mtime.getTime() === oldStat.mtime.getTime()) return
        if (self.started) {
          self.changed = true
          self.started = false
          self.retries = 0
          setTimeout(function() {
            self.trySpawn()
          }, 10 * 1000)
        }
      })
      
    })
  }

, unwatch: function() {
    var self = this
    
    log.say(this, 'Stopping watch of folder: ' + this.folder)
    
    this.unwatched = true
    
    this.files.forEach(function(fileName) {
      fs.unwatchFile(fileName)
    })
    
    this.files = []
  }
  
, rollBack: function() {
    var proc
      , procPool = this.processPool.slice(0)

    log.say(this, 'Rolling back to a stable process')

    while (proc = procPool.pop()) {
      if (proc.stable && !proc.error && !proc.exited) {
        this.process = proc
        this.port = this.process.port
        this.started = true
        log.success(this, 'Found stable process and rolled back. Server is running')
        return true
      }
    }

    log.alert(this, 'No stable process found. Server is not running!')
    this.retries = 0
  }

, killOld: function() {
    var proc
      , procPool = this.processPool.slice(0)
    
    log.say(this, 'Killing old processes (if any)')
    
    while (proc = procPool.pop()) {
      if (!proc.exited && !proc.error && proc !== this.process) {
        try {
          proc.kill()
        } catch(e) {
          log(e)
        }
      }
    }
  }

, killAll: function(cb) {
    var proc
      , procPool = this.processPool.slice(0)
      
    while (proc = procPool.pop()) {
      if (!proc.exited && !proc.error) {
        try {
          proc.kill()
        } catch(e) {
          log(e)
        }
      }
    }
    
    if (cb) cb(false)
  }

, spawn: function() {
    this.process = new ServerProcess(this)
    this.processPool.push(this.process)
    this.process.spawn()
    log.say(this,'Spawning process...')
  }
  
, trySpawn: function(retry) {
    var self = this

    if (!this.process || this.process.error || this.changed) {
      if (this.retries < 5) {
        this.port = polla.newPort()  
        this.retries++
        if (retry) log.say(this, 'Retrying start of process (attempt ' + (this.retries) + '/5)...')      
        this.spawn()    
      } else {
        this.retries++       
        log.alert(this, "Server did NOT start because of too many errors")
        this.rollBack()
        return
      }
    } else {
      log.success(this, 'Server started')
      this.process.stable = true
      this.retries = 0
      this.started = true
      this.killOld()
      return
    }

    if (!this.process || !this.process.stable || this.process.error || this.changed) {
      this.changed = false
      if (this.retries <= 5) {
        setTimeout(function() {
          self.trySpawn(true)
        }, 3000 + (this.retries * 1000) )
      }
    }
    
  }
}

var log = {
  stream: null
  
, print: function(s) {
    sys.log(s)
    if (this.stream) try { this.stream.write(s + '\n') } catch(err) {}
  }

, printW: function(w, s) {
    var ws = w.hostname +':'+ w.port +' '+ w.app +' - '+s
    sys.log(ws)
    if (this.stream) try { this.stream.write(ws + '\t\n') } catch(err) {}
  }
  
, say: function(w, s) {
    this.printW(w, s)
  }

, success: function(w, s) {
    this.printW(w, 'SUCCESS: '+s)
  }
  
, notice: function(w, s) {
    this.printW(w, 'NOTICE: '+s)
  }
  
, error: function(w, s) {
    this.printW(w, 'ERROR: '+s)
    return false
  }

, alert: function(w, s) {
    this.printW(w, 'ALERT: *** '+s)
    return false
  }
  
, errorNW: function(s) {
    this.print('ERROR: '+s)
    return false
  }
}

var polla = {
  servers: {}
  
, proxyPort: config.ports[0]

, newPort: function() {
    return this.proxyPort++
  }
  
, server: function(hostname, cmd) {
    return typeof this.servers[hostname] !== 'undefined' ? this.servers[hostname][cmd]() : log.errorNW('Server not found')
  }
  
, startProxy: function() {
    var self = this
    
    // Set up the proxy server
    httpProxy.createServer(function(req, res, proxy) {
      var hostname = req.headers.host
      
      // Hack to let servers know the client IP
      req.headers.ip = req.connection.remoteAddress
      
      if (typeof self.servers[hostname] !== 'undefined') {
        try {
          proxy.proxyRequest(self.servers[hostname].port, hostname, req, res)
        } catch(e) {
          log(e)
        }
      } else {
        // Fallback
        try {
          proxy.proxyRequest(8888, hostname, req, res)
        } catch(e) {
          log(e)
        }
      }
    }).listen(config.listen, config.ip)
    
    // Fallback server (handles unmatched servers)
    var fallbackServer = http.createServer(function(req, res) {
      res.writeHead(404, { 'Content-Type': 'text/html' })
      res.end('<h1>Not Found</h1><p>The URL you requested could not be found</p>')
    }).listen(8888)

  }
  
, startConsole: function() {
    net.createServer(function(stream) {
      stream.on('close', function(data) {
        log.errorNW('REMOTE CONSOLE CLOSED')
        log.stream = null
      })

      stream.on('error', function(data) {
        log.errorNW('REMOTE CONSOLE ERROR')
        log.stream = null
      })
      
      stream.on('data', function(data) {
        var args = data.toString().replace(/\s{2,}/g,' ').split(' ')
          , hostname = args.length>0 ? args[0] : null
        
        log.stream = stream

        var arg
        while (arg = args.shift()) {

          if (arg === 'init' || arg === '--init') {
            if (hostname && args.length>0) {
              if (typeof polla.servers[hostname] !== 'undefined') {
                log.notice(polla.servers[hostname], 'Server is initialized already')
              } else {
                polla.servers[hostname] = new Server(hostname, args.shift())
                log.say(polla.servers[hostname], 'Server initialized')
              }
            }
            
          } else if (arg === 'start' || arg === '--start') {
            if (hostname) polla.server(hostname, 'start')
            
          } else if (arg === 'stop' || arg === '--stop') {
            if (hostname) polla.server(hostname, 'stop')
            
          } else if (arg === 'restart' || arg === '--restart') {
            if (hostname) polla.server(hostname, 'restart')
            
          } else if (arg === 'watch' || arg === '--watch') {
            if (hostname) polla.server(hostname, 'watch')
            
          } else if (arg === 'unwatch' || arg === '--unwatch') {
            if (hostname) polla.server(hostname, 'unwatch')
            
          } else if (arg === 'status' || arg === 'stat' || arg === '--status' || arg === '--stat') {
            if (hostname && polla.server(hostname, 'status')) {}
            else polla.status()
            
          } else if (arg === 'destroy' || arg === '--destroy' || arg === 'kill' || arg === '--kill') {
            if (hostname) {
              polla.servers[hostname].killAll(function() {
                delete polla.servers[hostname]
              })
            }
          
          } else if (arg === 'exit' || arg === '--exit' || arg === 'die' || arg === '--die') {
            polla.servers.forEach(function(serv) {
              serv.killAll()
            })
            setTimeout(function() {
              stream.end()
              process.exit()
            }, 3000)

          }
        }

      })
    }).listen('/tmp/polla_master.sock')

  }
, status: function() {
    this.servers.forEach(function(e) {
      e.status()
    })
  }
  
, init: function() {
    this.startConsole()
    this.startProxy()
    log.print('polla_master is running')
  }
}

// soft kill

polla.init()

function bye() {
  console.log('Killing me softly')
  for (var k in polla.servers) {
    polla.servers[k].killAll()
  }
  setTimeout(function() {
    process.exit()
  }, 3000)
}

process.on('SIGINT', bye)
process.on('SIGTERM', bye)

if (typeof config.servers !== 'undefined' && config.servers.length) {
  var cserver
  for (var i=0; i<config.servers.length; i++) {
    cserver = config.servers[i]
    polla.servers[cserver.host] = new Server(cserver.host, cserver.app)
    for (var a=0; a < cserver.actions.length; a++) {
      console.log(cserver.host, cserver.actions[a])
      polla.server(cserver.host, cserver.actions[a])
    }
  }
}