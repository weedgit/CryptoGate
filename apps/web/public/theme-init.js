/** Apply the saved color mode before first paint (no light/dark flash). */
(function () {
  try {
    var m = localStorage.getItem("paymentgate.colorMode");
    if (m === "light" || m === "dark") {
      document.documentElement.setAttribute("data-theme", m);
    } else {
      document.documentElement.setAttribute("data-theme", "light");
    }
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();

/** Font stylesheet loads as media=print (non-blocking), then applies; no inline onload (CSP). */
(function () {
  var links = document.querySelectorAll("link[data-defer-style]");
  for (var i = 0; i < links.length; i += 1) {
    (function (link) {
      if (link.sheet) link.media = "all";
      else link.addEventListener("load", function () { link.media = "all"; });
    })(links[i]);
  }
})();
