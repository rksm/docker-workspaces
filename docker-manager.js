
var lively = {lang: require("lively.lang")};
var spawn = require("child_process").spawn;
var debug = true;

function exec(cmd, options, thenDo) {
  if (typeof options === "function") { thenDo = options; options = null; }
  var p = spawn("bash", ["-c", cmd], options);
  if (typeof thenDo === "function") {
    var stdout = "", stderr = "";
    function gatherStdout(data) { stdout += data; }
    function gatherStderr(data) { stderr += data; }
    p.stdout.on('data', gatherStdout);
    p.stderr.on('data', gatherStderr);
    p.once('close', function(code) {
      p.stdout.removeListener("data", gatherStdout);
      p.stderr.removeListener("data", gatherStderr);
      thenDo(code, stdout, stderr);
    });
  }
  return p;
}
// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

module.exports.getPortForNewWorkspace = function(thenDo) {
  createNewContainer(function(err, c) {
    thenDo(err, c && c.port);
  });
}

module.exports.isWorkspaceWithPortRunning = function(port, thenDo) {
  whenWorkspaceReady(800, port, function(err, c) { thenDo(err, !err); });
}

module.exports.whenWorkspaceReady = whenWorkspaceReady;


// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

module.exports.stopContainersMatching = stopContainersMatching;
module.exports.findReusableContainer = findReusableContainer;
module.exports.findReusableContainers = findReusableContainers;
module.exports.fetchContainerSpecs = fetchContainerSpecs;
module.exports.fetchRunningSpecForPort = fetchRunningSpecForPort;
module.exports.createNewContainer = createNewContainer;
module.exports.startDockerSentinel = startDockerSentinel;

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

var min = 1000*60;
var reusableAge = 40*min;

var ports = lively.lang.arr.range(10080,10180);

var startCommand = "docker rm cloxp-%s  > /dev/null 2>&1; /home/lively/lively-web.org/cloxp/start.sh %s";

// function getPortForAvailableContainer(thenDo) {
//   lively.lang.fun.composeAsync(
//     findReusableContainer,
//     function(c, n) { c ? n(null,c) : createNewContainer(n); }
//   )(thenDo);
// }

/*
process.cwd()

lively.lang.fun.composeAsync(
  fetchContainerSpecs,
  // function(specs,n) { unusedContainers(ports, specs, function(err,un) { n(err,specs,un); }); },
  function(specs, n) {
    createNewContainer(specs, n)
  }
  )(function(err, c) { console.log(err||c);})

fetchContainerSpecs(function(err, specs) {
  // console.log(specs);
  specs.forEach(function(ea) { console.log(lively.lang.date.relativeTo(ea.lastActive, new Date())); });
});

stopContainersMatching(function(ea) {
  console.log(Date.now() - ea.lastActive, reusableAge, lively.lang.date.relativeTo(ea.lastActive, new Date()));
  return !ea.lastActive || (Date.now() - ea.lastActive) > reusableAge;
}, console.log); 

var m = require("./docker-manager");
m.stopContainersMatching(function(ea) { return true; }, console.log); 

*/


function whenWorkspaceReady(timeout, port, thenDo) {
  if (typeof thenDo === "undefined") {
    thenDo = port; port = timeout; timeout = 5000;
  }

  var done = false, responseSuccess = false,
      cmd = "curl -s -S -I 0.0.0.0:" + port,
      reqDelay = Math.floor(timeout/5);
  function doRequest() {
    exec(cmd, function(err) {
      debug && console.log(port + " ready? " + !err);
      if (!err) responseSuccess = true;
      else if (!done) setTimeout(doRequest, reqDelay);
    })
  }
  lively.lang.fun.waitFor(timeout,
    function() { return !!responseSuccess; },
    function(err) { done = true; thenDo(err); });
  
  doRequest();
}

function createNewContainer(runningContainers, thenDo) {
  if (typeof runningContainers === "function") {
    thenDo = runningContainers;
    runningContainers = null;
  }
  lively.lang.fun.composeAsync(
    (runningContainers ? function(n) { return n(null, runningContainers); } : fetchContainerSpecs),
    function(cs, n) {
      // "unused" are really unstarted...
      unusedContainers(ports, cs, function(err, cs) {
        debug && console.log("Unstarted containers:", cs.length);
        if (err || !cs || !cs.length || !cs[0].port)
          return n(new Error("Cannot create new cloxp container!" + err ? " "+err:""));
          
        var cmd = lively.lang.string.format(startCommand, cs[0].port, cs[0].port);
        debug && console.log("Starting docker: %s...", cmd);
        var p = exec(cmd);
        var data = "";
        p.stdout.on("data", gatherData);
        p.stderr.on("data", gatherData);
        
        var conts = lively.lang.fun.either(onErr,onStart);;
        p.once("error", conts[0]);
        lively.lang.fun.waitFor(1000, function() { return data.length>4; }, conts[1]);
        
        function gatherData(d) { data += d; }
        function onErr(err) { n(err); }
        function onStart() {
          p.stdout.removeListener("data", gatherData);
          debug && console.log("...docker started?! " + data);
          n(null, cs[0]);
        }
      });
      
    }
  )(thenDo);
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

var dockerSentinel = null;
function startDockerSentinel(time) {
  time = time || 1000*60*5;
  if (dockerSentinel) return;
  dockerSentinel = setInterval(function() {
    stopContainersMatching(function(ea) {
      // console.log(Date.now() - ea.lastActive, reusableAge, lively.lang.date.relativeTo(ea.lastActive, new Date()));
      return !ea.lastActive || (Date.now() - ea.lastActive) > reusableAge;
    }, function() {});
  }, 5*min);
}

function fetchRunningSpecForPort(port, thenDo) {
  debug && console.log("port %s running?", port);
  runningDockersCached(function(err, cs) {
    var c = !err && lively.lang.arr.detect(cs||[], function(ea) { return ea && ea.port === port; });
    debug && co
    nsole.log("port %s running? %s", port, !!c);
    thenDo(err, c);
  })
}


function fetchSpecForPort(port, thenDo) {
  lively.lang.fun.composeAsync(
    fetchContainerSpecs,
    function(specs, n) {
      var spec = lively.lang.arr.detect(specs, function(spec) { return spec.port == port; });
      n(null, spec);
    }
  )(thenDo);
}

function stopContainersMatching( matchFunc, thenDo) {
  lively.lang.fun.composeAsync(
    fetchContainerSpecs,
    function(specs, n) {
      var ma = specs.filter(matchFunc);
      // console.log(ma);
      if (!ma.length) return thenDo(null, []);
      lively.lang.arr.mapAsyncSeries(ma,
        function(c,_,n) {
          debug && console.log("Stopping container %s", (c.id || c.name));
          exec("docker stop " + (c.id || c.name), function(err, stdo, stde) {
            debug && console.log("stopped " + (c.id || c.name));
            n(null, stde+stdo); })
        }, thenDo);
    }
  )(thenDo);
}

function unusedContainers(ports, runningContainers, thenDo) {
  // fetchContainerSpecs(function(err, specs) { unusedContainers(ports, specs, function(err,un) { console.log(err||un); }); });
  thenDo(null, lively.lang.arr
    .withoutAll(ports, lively.lang.arr.pluck(runningContainers, "port"))
    .map(function(p) { return {port: p, id: null, lastActive: null}; }));
}

// function fetchRunningContainers(thenDo) {
//   fetchContainerSpecs(function(err, specs) {
//     if (err) return thenDo(err, [])
//   })
// }

function findReusableContainer(thenDo) {
  findReusableContainers(function(err, cs) { thenDo(err, cs ? cs[0] : null); });
}

function findReusableContainers(thenDo) {
  lively.lang.fun.composeAsync(
    fetchContainerSpecs,
    function(specs, n) {
      n(null, (specs || []).filter(function(s) {
        return !s.lastActive || ((Date.now() - s.lastActive) > reusableAge);
      }));
    }
  )(thenDo);
}

function fetchContainerSpecs(thenDo) {
  // fetchContainerSpecs(function(err, specs) { console.log(err||specs||"none"); })
  debug && console.log("fetching container specs...");
  lively.lang.fun.composeAsync(
    runningDockersCached,
    function(images, n) {
      if (!images || !images.length) n(null,[]);
      else lively.lang.arr.mapAsyncSeries(images,
        function(i,_,n) { addLastActivityInDockerImage(i,n); }, n);
    },
    function(images,n) {
      debug && console.log("found %s running containers", images ? images.length : "no");
      n(null, images);
    }
  )(thenDo);
}

var dockerContainerCache = null;
function runningDockersCached(thenDo) {
  if (dockerContainerCache) return thenDo(null, dockerContainerCache);
  runningDockers(function(err, cs) {
    if (err) return thenDo(err, cs);
    dockerContainerCache = cs;
    setTimeout(function() { dockerContainerCache = null; }, 800);
    thenDo(null, cs);
  });
}

function runningDockers(thenDo) {
  // runningDockers(function(err, result) { global.images= result; console.log(err||result); })
  exec("docker ps | grep \"cloxp-10\"", function(error, stdout, stderr) {
    if (error) {
      debug && console.log("found no running containers");
      return thenDo(null, []);
    }
    
    var parsed = lively.lang.arr.compact(lively.lang.string.lines(stdout).map(function(l) {
      var m = l.match(/^([^\s]+).*:([0-9]{2,6})/);
      return m ? { id: m[1], port: Number(m[2]) } : null;
    }));
    
    thenDo(null, parsed);
  });
}


function addLastActivityInDockerImage(dockerSpec, thenDo) {
  // runningDockers(function(err, result) { global.images= result; console.log(err||result); })
  // addLastActivityInDockerImage(images[1])
  exec('docker logs --tail="300" '+dockerSpec.id, function(err, stdout, stderr) {
    if (err) return thenDo(stderr, stdout);

    var m;
    lively.lang.arr.detect(lively.lang.string.lines(stdout).reverse(), function(ea) {
      // return m = ea.match(/\[([a-z\s0-9:\.]]+)\]/i); });
      m = ea.match(/\[([0-9]{4}[^\]]+)\]/i);
      if (m) return m;
      m = ea.match(/\[([0-9]+\/[a-z]+\/[0-9]+)\]/i); // "06/Jan/2015:14:25:59 +0000"
      if (m) return [m[0], m[1].replace(/:/, " ")]
    }); 
              
    var d = m && new Date(m[1]);
    
    var age = d && "Invalid Date" !== String(d) ? d : null;
    dockerSpec.lastActive = age;
    thenDo && thenDo(null, dockerSpec)
    // console.log(new Date(m[1]));
  })
}
