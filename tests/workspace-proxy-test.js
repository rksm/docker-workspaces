/*global require, mocha, describe, it, beforeEach, afterEach*/

var chai = require('chai'),
    expect = chai.expect,
    chaiHttp = require('chai-http'),
    http = require("http");
chai.use(chaiHttp);

var lively = {lang: require("lively.lang")};

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

delete require.cache[require.resolve('mock-spawn')];

var mockSpawn = require('mock-spawn');
var spawn = mockSpawn(true);
spawn.setDefault(spawn.simple(1, 'command unexpected'));
require('child_process').spawn = function(command, args, options) {
  // late-bind the mock
  return spawn(command, args, options);
};

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

var dockerPsOut1 = "8846ffef3daa        cloxp-base:latest          /bin/sh -c 'rm *.pid   8 hours ago         Up 8 hours          0.0.0.0:10084->10080/tcp                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           cloxp-10084         \n"
                 + "00786c794d59        cloxp-base:latest          /bin/sh -c 'rm *.pid   9 hours ago         Up 9 hours          0.0.0.0:10080->10080/tcp                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           cloxp-10080         \n"

var dockerLogsOut10084 = 
  "[2015-01-10 12:21:45.910] [INFO] console - starting subserver QBFScoresServer on route /nodejs/QBFScoresServer/\n"
+ "Sat, 10 Jan 2015 12:21:45 GMT express deprecated app.del: Use app.delete instead at core/servers/RServer.js:238:9\n"
+ "[2015-01-10 12:21:45.955] [INFO] console - LivelyFS initialize at /home/lively/cloxp/LivelyKernel\n"
+ "[2015-01-10 12:21:45.959] [INFO] console - Server with pid 15 is now running at http://localhost:10080\n"
+ "[2015-01-10 12:21:45.959] [INFO] console - Serving files from /home/lively/cloxp/LivelyKernel\n"
+ "[2015-01-10 12:21:45.980] [INFO] console - CREATE INDEX IF NOT EXISTS rewritten_objects_index ON rewritten_objects(path,version); -- lastID: 0, changes: 0\n"
+ "[2015-01-10 12:21:46.772] [INFO] console - LivelyFS synching 0 (0B MB) files from disk\n"
+ "172.17.42.1 - - [10/Jan/2015:17:54:37 +0000] \"unknown user <->\" \"GET /favicon.ico HTTP/1.1\" 200 1150 \"-\" \"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0.2171.95 Safari/537.36\"\n"
+ "172.17.42.1 - - [10/Jan/2015:18:00:55 +0000] \"unknown user <->\" \"GET /cloxp.html HTTP/1.1\" 404 - \"-\" \"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0.2171.95 Safari/537.36\"\n"

var dockerLogsOut10080 =
  "172.17.42.1 - - [10/Jan/2015:21:50:10 +0000] \"unknown_user <->\" \"GET /nodejs/CommandLineServer/ HTTP/1.1\" 304 - \"http://cloxp.lively-web.org/cloxp.html\" \"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0.2171.95 Safari/537.36\"\n"
+ "172.17.42.1 - - [10/Jan/2015:21:50:43 +0000] \"unknown_user <->\" \"GET /nodejs/CommandLineServer/ HTTP/1.1\" 304 - \"http://cloxp.lively-web.org/cloxp.html\" \"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0.2171.95 Safari/537.36\"\n"
+ "172.17.42.1 - - [10/Jan/2015:21:51:14 +0000] \"unknown_user <->\" \"GET /nodejs/CommandLineServer/ HTTP/1.1\" 304 - \"http://cloxp.lively-web.org/cloxp.html\" \"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0.2171.95 Safari/537.36\"\n"
+ "172.17.42.1 - - [10/Jan/2015:21:51:46 +0000] \"unknown_user <->\" \"GET /nodejs/CommandLineServer/ HTTP/1.1\" 304 - \"http://cloxp.lively-web.org/cloxp.html\" \"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0.2171.95 Safari/537.36\"\n"
+ "172.17.42.1 - - [10/Jan/2015:21:52:18 +0000] \"unknown_user <->\" \"GET /nodejs/CommandLineServer/ HTTP/1.1\" 304 - \"http://cloxp.lively-web.org/cloxp.html\" \"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0.2171.95 Safari/537.36\"\n"
+ "172.17.42.1 - - [10/Jan/2015:21:52:49 +0000] \"unknown_user <->\" \"GET /nodejs/CommandLineServer/ HTTP/1.1\" 304 - \"http://cloxp.lively-web.org/cloxp.html\" \"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0.2171.95 Safari/537.36\"\n"

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

var server = require("../index");
var pseudoWorkspaceServer;
// var proxyquire =  require('proxyquire');
// var foo = proxyquire('child_process', { 'spawn': pathStub });

function startPseudoServer(port, thenDo) {
  var s = http.createServer(function(req, res) {
    console.log("request to %s %s", req.url, port);
    res.end(); });
  s.listen(port);
  s.once("listening", function() { thenDo(null, s); });
  return s;
}


// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

describe("workspace proxy", function() {

  var app, port = 8080, baseURL = 'http://localhost:' + port,
      pseudoWorkspaceServer1, pseudoWorkspaceServer2;

  beforeEach(function(thenDo) {
    lively.lang.fun.waitForAll([
      function(n) { server.start({waitForDockerTimout: 800, port: port}, function(err, _app) { app = _app; n(err); }); },
      function(n) { pseudoWorkspaceServer1 = startPseudoServer(10081, n); },
      function(n) { pseudoWorkspaceServer2 = startPseudoServer(10084, n); }
    ], thenDo);
  });

  afterEach(function(thenDo) {
    lively.lang.fun.waitForAll([
      function(n) { server.stop(app, n); },
      function(n) { pseudoWorkspaceServer1.close(n); },
      function(n) { pseudoWorkspaceServer2.close(n); }],
      thenDo);
  });

  describe("new requests", function() {

    it("creates a new workspace", function(done) {
      spawn = mockSpawn(true);
      spawn.setDefault(function(cb) {
        expect(this.command+this.args.join("\n")).to.not.be.ok();
        cb(666);
      });

      // 1. get running dockers
      spawn.sequence.add(function(cb) {
        expect('docker ps | grep "cloxp-10"').to.equal(this.args.slice(1).join(" "));
        this.stdout.write(dockerPsOut1); cb(0);
      });

      // 2. For the two running, get logs to find last activity
      spawn.sequence.add(function(cb) {
        expect('docker logs --tail="300" 8846ffef3daa').to.equal(this.args.slice(1).join(" "));
        this.stdout.write(dockerLogsOut10084); cb(0);
      });
      spawn.sequence.add(function(cb) {
        expect('docker logs --tail="300" 00786c794d59').to.equal(this.args.slice(1).join(" "));
        this.stdout.write(dockerLogsOut10080); cb(0);
      });

      // 3. start a non-running container on the next avail port:
      spawn.sequence.add(function(cb) {
        expect("docker rm cloxp-10081  > /dev/null 2>&1; /home/lively/lively-web.org/cloxp/start.sh 10081").to.equal(this.args.slice(1).join(" "));
        setTimeout(function() { this.stdout.write('1234abcd5678'); cb(0); }.bind(this), 100);
      });

      // 4. Check if container ready....
      spawn.sequence.add(function(cb) {
        expect("curl -s -S -I 0.0.0.0:10081").to.equal(this.args.slice(1).join(" "));
        setTimeout(function() { cb(0); }.bind(this), 100);
      });

      chai.request(baseURL).get('/cloxp.html?workspace-wait-redirect=false').end(function (err, res) {
        expect(err).to.be.null;
        expect(res).to.have.cookie("cloxp-assignment", "10081");
        expect(res).to.have.cookie("cloxp-last-req-time");
        done();
      });
      
    });

    // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

    it("binds request with session data to existing workspace", function(done) {

      spawn = mockSpawn(true);
      spawn.setDefault(function(cb) {
        expect(this.command+this.args.join("\n")).to.not.be.ok();
        cb(666);
      });

      chai.request(baseURL)
        .get('/cloxp.html')
        .set({'cookie': 'cloxp-last-req-time=' + (Date.now()-1000*5) + '; path=/; httponly; '
                         + 'cloxp-assignment=10084; path=/; httponly; '})
        .end(function (err, res) {
          expect(err).to.be.null;
          expect(res).to.have.cookie("cloxp-assignment", "10084");
          expect(res).to.have.cookie("cloxp-last-req-time");
          done();
        });
    });

    it("binds request with session data to existing workspace but asks for its existance", function(done) {

      spawn = mockSpawn(true);
      spawn.setDefault(function(cb) {
        expect(this.command+this.args.join("\n")).to.not.be.ok();
        cb(666);
      });

      // 1. Check if container ready....
      spawn.sequence.add(function(cb) {
        expect("curl -s -S -I 0.0.0.0:10084").to.equal(this.args.slice(1).join(" "));
        setTimeout(function() { cb(0); }.bind(this), 100);
      });

      chai.request(baseURL)
        .get('/cloxp.html')
        .set({'cookie': 'cloxp-last-req-time=' + (Date.now()-1000*5*60) + '; path=/; httponly; '
                         + 'cloxp-assignment=10084; path=/; httponly; '})
        .end(function (err, res) {
          expect(err).to.be.null;
          expect(res).to.have.cookie("cloxp-assignment", "10084");
          expect(res).to.have.cookie("cloxp-last-req-time");
          done();
        });
    });

    // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

    it("gets us a new workspace if old one doesn't answer", function(done) {

      spawn = mockSpawn(true);
      spawn.setDefault(function(cb) {
        expect(this.command+this.args.join("\n")).to.not.be.ok();
        cb(666);
      });

      // 0. Check if container ready....
      lively.lang.arr.range(1,4).forEach(function() {
        spawn.sequence.add(function(cb) {
          expect("curl -s -S -I 0.0.0.0:10085").to.equal(this.args.slice(1).join(" "));
          setTimeout(function() { cb(7); }.bind(this), 100);
        });
      });


      // 1. get running dockers
      spawn.sequence.add(function(cb) {
        expect('docker ps | grep "cloxp-10"').to.equal(this.args.slice(1).join(" "));
        this.stdout.write(dockerPsOut1); cb(0);
      });

      // 2. For the two running, get logs to find last activity
      spawn.sequence.add(function(cb) {
        expect('docker logs --tail="300" 8846ffef3daa').to.equal(this.args.slice(1).join(" "));
        this.stdout.write(dockerLogsOut10084); cb(0);
      });
      spawn.sequence.add(function(cb) {
        expect('docker logs --tail="300" 00786c794d59').to.equal(this.args.slice(1).join(" "));
        this.stdout.write(dockerLogsOut10080); cb(0);
      });

      // 3. start a non-running container on the next avail port:
      spawn.sequence.add(function(cb) {
        expect("docker rm cloxp-10081  > /dev/null 2>&1; /home/lively/lively-web.org/cloxp/start.sh 10081").to.equal(this.args.slice(1).join(" "));
        setTimeout(function() { this.stdout.write('1234abcd5678'); cb(0); }.bind(this), 100);
      });

      // 4. Check if container ready....
      spawn.sequence.add(function(cb) {
        expect("curl -s -S -I 0.0.0.0:10081").to.equal(this.args.slice(1).join(" "));
        setTimeout(function() { cb(0); }.bind(this), 100);
      });

      chai.request(baseURL).get('/cloxp.html?workspace-wait-redirect=false')
        .set({'cookie': 'cloxp-last-req-time=' + (Date.now()-1000*5*60) + '; path=/; httponly; '
                   + 'cloxp-assignment=10085; path=/; httponly; '})
        .end(function (err, res) {
          expect(err).to.be.null;
          expect(res).to.have.cookie("cloxp-assignment", "10081");
          expect(res).to.have.cookie("cloxp-last-req-time");
          done();
        });

    });

  });
});