// require("lively2lively/examples/nodejs2lively.for-import.js");
// global.proxies = proxies;

var lively = {lang: require("lively.lang")};
var httpProxy = require('http-proxy');
var http = require("http");
var Cookies = require("cookies")
var dmgr = require("./docker-manager");
var fs = require("fs");
var path = require("path");

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

var waitingForWorkspacePage = "/cloxp-wait.html";
var assumeWorkspaceStillRunningTime = 1000 * 60 * 2;
var proxies = {};
var debug = false;

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// server export

module.exports = {
  start: function(options, thenDo) {
    var s = createProxyServer(options);
    s.once("listening", function() { thenDo(null, s); });
    return s;
  },

  stop: function(server, thenDo) {
    server.once("close", thenDo);
    server.close();
  }

}

process.on('uncaughtException', function(err) {
  // FIXME...
  console.log('Caught exception: ' + (err.stack || err));
});

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

function createProxyServer(options) {
  var port = (options && options.port) || 9015

  var proxyServer = http.createServer(handleRequest);
  proxyServer.on('upgrade', handleWebsocketRequest);
  proxyServer.on("error", function(e) { console.log("prioxy error: ", e); });
  proxyServer.listen(port);
  
  return proxyServer;
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

function handleRequest(req, res) {
  
  // 1. get / set time of last access. this is what we use to decide whether or
  // not to contact docker to ask if the image still exists (expensive)
  var lastReqT = req["workspaceManager-lastRequestTime"] = getCookieLastRequestTime(req, res);
  setCookieLastRequestTime(req, res, Date.now());

  // 2. requests to please-wait-pages don't get proxied
  if (isWaitRequest(req, res)) return serveWaitPage(req, res);

  // 3. if we don't find session data we create a new workspace
  var assignedPort = getCookiePortAssignment(req, res);
  if (!assignedPort) return handleNewWorkspaceRequest(req, res);

  // 4. If last access time is below some limit we assume that the workspace
  // still runs and just forward stuff
  if (Date.now() - lastReqT < assumeWorkspaceStillRunningTime) {
    setCookiePortAssignment(req, res, assignedPort);
    return doProxyWebRequest(ensureProxy(assignedPort), req, res);
  }

  // 5. otherwise we ask if the workspace exists....
  dmgr.isWorkspaceWithPortRunning(assignedPort, function(err, answer) {
    if (!err && answer) {
      // ...and if so, we forward
      setCookiePortAssignment(req, res, assignedPort);
      doProxyWebRequest(ensureProxy(assignedPort), req, res);
    } else {
      // ... or create a new workspace
      handleNewWorkspaceRequest(req, res);
    }
  });
}

function handleWebsocketRequest(req, socket, head) {
  var cookies = new Cookies(req, null);
  var assigned = Number(cookies.get(cloxpCookieName));
  socket.on("error", function(e) { console.log("socker error ", e); })
  if (assigned && proxies[assigned]) {
    proxies[assigned].ws(req, socket, head, function(err) { socket.end(); });
  } else {
    socket.end();
  }
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

function handleNewWorkspaceRequest(req, res) {
  dmgr.getPortForNewWorkspace(function(err, port) {
    if (err) return onErr();
    setCookiePortAssignment(req, res, port);

    if (req.url.match(/workspace-wait-redirect=false/)) {
      dmgr.whenWorkspaceReady(port, function(err) {
        if (err) return onErr();        
        doProxyWebRequest(ensureProxy(port), req, res);
      });
    } else {
      res.writeHead(303, {"Location": waitingForWorkspacePage});
      res.end();
    }
  });
  
  function onErr() {
    res.witeHead(500);
    res.end("Could not successfully request workspace:\n" + err);
  }
}

function serveWaitPage(req, res) {
  var p = path.join("public/")+req.url;
  // var assignedPort = getCookiePortAssignment(req, res);
  // setCookiePortAssignment(req, res, assignedPort);
  fs.exists(p, function(exists) {
    if (!exists) res.writeHead(404, {});
    else {
      res.writeHead(200, {"Content-type": "text/html"})
      var s = fs.createReadStream(p);
      s.pipe(res);
    }
  });
}

function isWaitRequest(req, res) {
  return !!req.url.match(new RegExp(waitingForWorkspacePage+"$"));
}

// dMgr.findReusableContainers;
// dMgr.fetchContainerSpecs;
// dMgr.startDockerSentinel;

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// cookie action
var portOfLastHope = 10080;
var cloxpCookieName = "cloxp-assignment";
var cloxpCookieTimeName = "cloxp-last-req-time";

function getCookieVal(key, req, res) {
  var cookies = new Cookies(req, res);
  var val = Number(cookies.get(key));
  return isNaN(val) ? null : val;
}

function setCookieVal(key, val, req, res) {
  if (!val) {
    console.warn("setCookie %s: no value", key, val);
    return;
  }
  console.log(key, val, !!req, !!res);
  new Cookies(req, res).set(key, val);
}

function getCookiePortAssignment(req, res) { return getCookieVal(cloxpCookieName, req, res); }
function setCookiePortAssignment(req, res, v) { return setCookieVal(cloxpCookieName, v, req, res); }
function getCookieLastRequestTime(req, res) { return getCookieVal(cloxpCookieTimeName, req, res); }
function setCookieLastRequestTime(req, res, v) { return setCookieVal(cloxpCookieTimeName, v, req, res); }

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-


function ensureProxy(port) {
  var proxy = proxies[port];
  if (proxy) return proxies[port];
  proxy = proxies[port] = new httpProxy.createProxyServer({
    target: {host: 'localhost',port: port,ws: true}});
  // function errHandler(err) { console.warn("proxy error: ", err); }
  // if (errHandler) proxy.on("error", errHandler);
  setTimeout(function() {
    delete proxies[port];
    // errHandler && proxy.removeListener("error", errHandler);
  }, 1000*60*2);
  return proxy;
}

function dealWithUnabilityToConnect(cookies, req, res) {
  cookies.set("cloxp-unable-to-connect", Date.now());
  if (res) {
    res.statusCode = 500;
    try {
      res.end("Sorry, right now there are problems with the server. I'll look into it. Please check back later!");
    } catch (e) { console.error(e); }
  }
}

function doProxyWebRequest(proxy, req, res, attempt) {
  debug && console.log("proxying %s", req.url);
  proxy.web(req, res, function(err) {
    if (attempt > 5) {
      console.error("proxy web request errored:", err);
      res.statusCode = 500;
      res.end("Could not reach cloxp server, sorry.");
      return;
    }
    setTimeout(function() {
      doProxyWebRequest(proxy, req, res, (attempt||0)+1);
    }, 700);
  });
}
