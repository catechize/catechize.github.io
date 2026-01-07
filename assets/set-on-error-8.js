// globalThis polyfill: https://mathiasbynens.be/notes/globalthis
(function () {
  if (typeof globalThis === "object") return;
  try {
    Object.defineProperty(Object.prototype, "__magic__", {
      get: function () {
        return this;
      },
      configurable: true,
    });
    // eslint-disable-next-line no-undef
    __magic__.globalThis = __magic__;
    // The previous line should have made `globalThis` globally
    // available, but it fails in Internet Explorer 10 and older.
    // Detect this failure and fall back.
    if (typeof globalThis === "undefined") {
      // Assume `window` exists.
      window.globalThis = window;
    }
    delete Object.prototype.__magic__;
    console.log("globalThis polyfilled!");
  } catch (error) {
    // In IE8, Object.defineProperty only works on DOM objects.
    // If we hit this code path, assume `window` exists.
    window.globalThis = window;
    console.log("globalThis polyfilled!");
  }
})();

// set on error in AppDataContext happens post render. This introduces it earlier in the cycle,
//to be replaced post-render by a version that actually uses our log client

var stacksAlreadySeen = [];
window.errorCache = [];

var ignoreKeywords = [
  "script error",
  "The play() request was interrupted by a call to pause()",
  "Failed to read the 'localStorage' property from 'Window': Access is denied for this document.",
];

function errorShouldBeIgnored(msg) {
  const msgString = msg.toLowerCase();
  return ignoreKeywords.some((keyword) => msgString.indexOf(keyword) > -1);
  // const scriptError = "script error";
  // return msgString.indexOf(scriptError) > -1;
}

function logException(msg, url, lineNo, colNo, error) {
  if (url && !/classdojo/gi.test(url)) {
    return;
  }

  if (errorShouldBeIgnored(msg)) {
    return;
  }

  var context = "script: " + url + ", lineNo: " + lineNo + ", colNo: " + colNo;
  if (!error) {
    error = {
      message: msg,
      status: "unknown",
      method: "unknown",
      url: url,
      stack: context,
    };
  }

  if (stacksAlreadySeen.indexOf(error.stack || "") != -1) {
    return;
  }

  window.errorCache.push(arguments);

  stacksAlreadySeen.push(error.stack || "");

  // https://github.com/visionmedia/superagent/blob/ccecb4e94fc08b4555da9dbd9b96fa93678bc1f9/lib/client.js#L623-L632
  // add some extra data for these kinds of errors
  // eslint-disable-next-line no-prototype-builtins
  if (error.hasOwnProperty("crossDomain")) {
    var responseError = error;
    error.message =
      responseError.message +
      " – status: " +
      responseError.status +
      ", method: " +
      responseError.method +
      ", url: " +
      responseError.url;
  }

  var match = /dojo_log_session_id=([^;]*)/.exec(document.cookie);
  var sessionId = match ? match[1] : "unknown";

  var data = JSON.stringify({
    site: "external",
    buildNumber: "",
    deployGroup: "",
    entityId: "",
    location: window.location ? window.location.href : undefined,
    message:
      "error logged before log client initiated. error:" + JSON.stringify(error) + " + message: " + JSON.stringify(msg),
    stack: error.stack,
    history: [],
    context: context,
    productArea: "unknown",
    sessionId: sessionId,
    extraAttributes: {
      isBrowserSupported: window.isBrowserSupported ?? true,
    },
  });

  try {
    return send(data);
  } catch (err) {
    console.error("unable to send error to logs backend", err);
  }
}

function send(data) {
  var url = "https://logs.classdojo.com/frontendException";
  if (window.navigator.sendBeacon) {
    return window.navigator.sendBeacon(url, data);
  } else if (window.XMLHttpRequest) {
    var xhr = new XMLHttpRequest();
    if ("withCredentials" in xhr) {
      // XHR for Chrome/Firefox/Opera/Safari/IE10+.
      xhr.open("POST", url, true);
    } else {
      throw new Error("CORS not supported by browser");
    }
    // blogs claim the timeout helps to reduce IE aborted request errors
    setTimeout(function () {
      xhr.send(data);
    }, 0);
  } else {
    throw new Error("No applicable way to send data -- define a `send` method in init");
  }
}

window.onerror = logException;

function stringifyElement(el) {
  var attrs = {};
  el.getAttributeNames().forEach(function (name) {
    attrs[name] = el.getAttribute(name);
  });
  return el.tagName + JSON.stringify(attrs);
}

var removeChild = Node.prototype.removeChild;
Node.prototype.removeChild = function (child) {
  try {
    return removeChild.call(this, child);
  } catch (e) {
    var path = [];
    path.push(stringifyElement(child));

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    var parent = this;
    while (parent) {
      path.push(stringifyElement(parent));
      parent = parent.parentElement;
    }

    throw new Error("Failed to removeChild:\n" + path.join("\n"));
  }
};
