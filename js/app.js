(function () {
  "use strict";
  var form = document.getElementById("calc-form");
  var errorBox = document.getElementById("calc-error");
  var usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  function byId(id) { return document.getElementById(id); }

  function formatDate(iso) {
    var p = iso.split("-");
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  }

  function readInput() {
    var input = {};
    new FormData(form).forEach(function (value, key) { input[key] = value; });
    if (input.priorYearTax === "") delete input.priorYearTax;
    return input;
  }

  function render(r) {
    byId("r-percent").textContent = r.setAsidePercent.toFixed(1) + "%";
    byId("r-quarterly").textContent = usd.format(r.quarterlyFederal);
    byId("r-state-line").hidden = r.quarterlyState <= 0;
    byId("r-quarterly-state").textContent = usd.format(r.quarterlyState);
    byId("r-profit").textContent = usd.format(r.netProfit);
    byId("r-se").textContent = usd.format(r.seTax);
    byId("r-income").textContent = usd.format(r.federalIncomeTax);
    byId("r-fedtotal").textContent = usd.format(r.federalTotal);
    byId("r-marginal").textContent = Math.round(r.marginalRate * 100) + "%";
    byId("r-safe-row").hidden = r.safeHarborAmount === null;
    byId("r-safe").textContent = usd.format(r.minimumQuarterlyToAvoidPenalty);
    byId("r-remaining").textContent = usd.format(r.remainingAfterPaid);
    var list = byId("r-dates");
    list.replaceChildren();
    r.dueDates.forEach(function (d, i) {
      var li = document.createElement("li");
      li.textContent = "Q" + (i + 1) + ": " + formatDate(d) + " · " + usd.format(r.quarterlyFederal);
      list.appendChild(li);
    });
  }

  function update() {
    try {
      var result = window.SetAside.estimate(readInput());
      errorBox.hidden = true;
      render(result);
    } catch (err) {
      errorBox.textContent = err instanceof Error ? err.message : "Please check your numbers.";
      errorBox.hidden = false;
    }
  }

  form.addEventListener("input", update);
  form.addEventListener("submit", function (e) { e.preventDefault(); update(); });
  update();
})();
