// require("lively2lively/examples/nodejs2lively.for-import.js");
// global.proxies = proxies;

var lively = {lang: require("lively.lang")};
var httpProxy = require('/home/lively/lively-web.org/cloxp/docker-cloxp-proxy/node_modules/http-proxy');
var http = require("http");
var Cookies = require("cookies")
var dMgr = require("./docker-manager");

var portOfLastHope = 10080;

// dMgr.findReusableContainers;
// dMgr.fetchContainerSpecs;
// dMgr.startDockerSentinel;

var cloxpCookieName = "cloxp-assignment";
var proxies = {};
var debug = false;

function sendToExistingConnection(cookies, req, res, thenDo) {

  var assigned = Number(cookies.get(cloxpCookieName));
  if (!assigned) {
    debug && console.log("send request to existing connection? ... no")
    return thenDo(null, false); // new connection
  } else if (proxies[assigned]) { // recent connection, handler should be around
    proxies[assigned].web(req, res);
    false && debug && console.log("send request to existing connection? ... yes, has proxy already:", assigned);
    return thenDo(null, true);
  } else { // check if con still exists...
    dMgr.fetchRunningSpecForPort(assigned, function(err, spec) {
      if (err || !spec) return thenDo(null, false);
      var proxy = ensureProxy(assigned);
      proxy.web(req, res);
      debug && console.log(spec);
      debug && console.log("send request to existing connection? ... yes, created proxy:", assigned);
      thenDo(null, true);
    });
  }
}

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

function createNewConnection(cookies, req, res, thenDo) {
  debug && console.log("request to create new connection...");
  dMgr.findReusableContainer(function(err, c) {
    if (!err && c) return done(null, c);
    else {
      dMgr.createNewContainer(function(err, c) {
        if (!err && c) return done(null, c);
        if (!c) {
          console.warn("Last attempt to serve the client: proxy to " + portOfLastHope);
          c = {port: portOfLastHope, name: "cloxp-"+portOfLastHope};
          thenDo(null, c);
        }
        thenDo(err || new Error("Could not create new container!"), false);
      });
    }
  });

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

  function done(err, c) {
    debug && console.log("Found reusable or new container: ", c);
    cookies.set(cloxpCookieName, c.port);
    var proxy = ensureProxy(c.port);
    doProxyWebRequest(proxy, req, res);
    return thenDo(err, !err && c);
  }
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

function handleRequest(req, res) {
  var cookies = new Cookies(req, res);
  lively.lang.fun.composeAsync(
    function(n) { sendToExistingConnection(cookies, req, res, n); },
    function(handled, n) { handled ? n(null, true) : createNewConnection(cookies, req, res, n); }
  )(function(err, handled) {
    if (handled) return;
    console.error("could not handle request! ", err);
    dealWithUnabilityToConnect(cookies, req,res);
  });
}

function doProxyWebRequest(proxy, req, res, attempt) {
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

var proxyServer = http.createServer(handleRequest);

//
// Listen to the `upgrade` event and proxy the
// WebSocket requests as well.
//
proxyServer.on('upgrade', function (req, socket, head) {
  var cookies = new Cookies(req, null);
  var assigned = Number(cookies.get(cloxpCookieName));
  socket.on("error", function(e) { console.log("socker error ", e); })
  if (assigned && proxies[assigned]) {
    proxies[assigned].ws(req, socket, head, function(err) { socket.end(); });
  } else {
    socket.end();
  }
});

proxyServer.on("error", function(e) {
  console.log("prioxy error: ", e);
});

process.on('uncaughtException', function(err) {
  console.log('Caught exception: ' + (err.stack || err));
});

proxyServer.listen(9015);