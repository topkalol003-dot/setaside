// Points every [data-buy] link at the Gumroad product once SA_CONFIG.GUMROAD_URL is set.
// Until then the buttons are hidden and [data-buy-note] ("launching soon") is shown, so there are no dead links.
(function () {
  "use strict";
  var url = (window.SA_CONFIG && window.SA_CONFIG.GUMROAD_URL) || "";
  document.querySelectorAll("[data-buy]").forEach(function (a) {
    if (url) { a.href = url; a.rel = "noopener"; } else { a.hidden = true; }
  });
  document.querySelectorAll("[data-buy-note]").forEach(function (n) { n.hidden = Boolean(url); });
})();
