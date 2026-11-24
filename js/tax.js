/*
 * SetAside Sheet — US federal estimated tax engine for self-employed people.
 * Pure functions, no DOM. Works in the browser (window.SetAside) and Node (require).
 * Sources: IRS Rev. Proc. 2025-32 (tax year 2026), Rev. Proc. 2026-35 (tax year 2027), SSA wage base.
 * This is an estimate, not tax advice.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SetAside = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var RATES = [0.10, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37];

  var TAX_YEARS = Object.freeze({
    2026: Object.freeze({
      standardDeduction: { single: 16100, mfj: 32200, hoh: 24150 },
      // Lower bound of brackets 12%..37% (10% starts at 0)
      brackets: {
        single: [12400, 50400, 105700, 201775, 256225, 640600],
        mfj: [24800, 100800, 211400, 403550, 512450, 768700],
        hoh: [17700, 67450, 105700, 201750, 256200, 640600]
      },
      ssWageBase: 184500,
      dueDates: ["2026-04-15", "2026-06-15", "2026-09-15", "2027-01-15"]
    }),
    2027: Object.freeze({
      standardDeduction: { single: 16600, mfj: 33200, hoh: 24925 },
      brackets: {
        single: [12800, 52025, 109125, 208325, 264550, 661375],
        mfj: [25600, 104050, 218250, 416650, 529100, 793650],
        hoh: [18250, 69650, 109100, 208300, 264550, 661350]
      },
      ssWageBase: 192300,
      dueDates: ["2027-04-15", "2027-06-15", "2027-09-15", "2028-01-18"]
    })
  });

  var SE_FACTOR = 0.9235;
  var SS_RATE = 0.124;
  var MEDICARE_RATE = 0.029;
  var ADDL_MEDICARE_RATE = 0.009;
  var ADDL_MEDICARE_THRESHOLD = { single: 200000, mfj: 250000, hoh: 200000 };
  var SE_MIN_NET = 400;
  var HIGH_AGI_SAFE_HARBOR = 150000;

  function round2(n) { return Math.round(n * 100) / 100; }

  function num(value, name) {
    var n = value === undefined || value === null || value === "" ? 0 : Number(value);
    if (!isFinite(n)) throw new Error(name + " must be a number");
    if (n < 0) throw new Error(name + " cannot be negative");
    return n;
  }

  function incomeTax(taxable, year, status) {
    var lows = [0].concat(TAX_YEARS[year].brackets[status]);
    var tax = 0;
    for (var i = 0; i < RATES.length; i++) {
      var lo = lows[i];
      var hi = i + 1 < lows.length ? lows[i + 1] : Infinity;
      if (taxable <= lo) break;
      tax += (Math.min(taxable, hi) - lo) * RATES[i];
    }
    return tax;
  }

  function marginalRate(taxable, year, status) {
    var lows = TAX_YEARS[year].brackets[status];
    var rate = RATES[0];
    for (var i = 0; i < lows.length; i++) if (taxable > lows[i]) rate = RATES[i + 1];
    return rate;
  }

  function selfEmploymentTax(netProfit, w2Wages, year, status) {
    if (netProfit < SE_MIN_NET) return { total: 0, ss: 0, medicare: 0, additional: 0, base: 0 };
    var base = netProfit * SE_FACTOR;
    var ssRoom = Math.max(0, TAX_YEARS[year].ssWageBase - w2Wages);
    var ss = Math.min(base, ssRoom) * SS_RATE;
    var medicare = base * MEDICARE_RATE;
    var addlRoom = Math.max(0, ADDL_MEDICARE_THRESHOLD[status] - w2Wages);
    var additional = Math.max(0, base - addlRoom) * ADDL_MEDICARE_RATE;
    return { total: ss + medicare + additional, ss: ss, medicare: medicare, additional: additional, base: base };
  }

  /**
   * @param {object} input
   *   year: 2026|2027, status: "single"|"mfj"|"hoh",
   *   income, expenses: self-employment gross income and business expenses (annual),
   *   w2Wages, otherIncome, w2Withholding, statePercent (0-20),
   *   priorYearTax, priorYearAgi (optional, for safe harbor),
   *   alreadyPaid (estimated payments made so far this year)
   */
  function estimate(input) {
    var year = Number(input.year);
    if (!TAX_YEARS[year]) throw new Error("Unsupported tax year: " + input.year);
    var status = input.status;
    if (status !== "single" && status !== "mfj" && status !== "hoh") throw new Error("Filing status must be single, mfj or hoh");

    var income = num(input.income, "Income");
    var expenses = num(input.expenses, "Expenses");
    var w2Wages = num(input.w2Wages, "W-2 wages");
    var otherIncome = num(input.otherIncome, "Other income");
    var withholding = num(input.w2Withholding, "W-2 withholding");
    var statePercent = num(input.statePercent, "State tax %");
    if (statePercent > 20) throw new Error("State tax % looks too high (max 20)");
    var alreadyPaid = num(input.alreadyPaid, "Already paid");

    var netProfit = Math.max(0, income - expenses);
    var se = selfEmploymentTax(netProfit, w2Wages, year, status);
    var halfSe = (se.ss + se.medicare) / 2;
    var agi = netProfit - halfSe + w2Wages + otherIncome;
    var taxable = Math.max(0, agi - TAX_YEARS[year].standardDeduction[status]);
    var fedIncomeTax = incomeTax(taxable, year, status);
    var federalTotal = fedIncomeTax + se.total;
    var stateTax = netProfit * statePercent / 100;
    var totalTax = federalTotal + stateTax;

    var federalDue = Math.max(0, federalTotal - withholding);
    var requiredFederal = federalTotal * 0.9;
    var safeHarbor = null;
    if (input.priorYearTax !== undefined && input.priorYearTax !== null && input.priorYearTax !== "") {
      var prior = num(input.priorYearTax, "Prior-year tax");
      var priorAgi = num(input.priorYearAgi, "Prior-year AGI");
      var pct = priorAgi > HIGH_AGI_SAFE_HARBOR ? 1.1 : 1.0;
      safeHarbor = prior * pct;
      requiredFederal = Math.min(requiredFederal, safeHarbor);
    }
    var requiredAfterWithholding = Math.max(0, requiredFederal - withholding);
    var remainingAfterPaid = Math.max(0, federalDue - alreadyPaid);

    return {
      year: year,
      status: status,
      netProfit: round2(netProfit),
      seTax: round2(se.total),
      seTaxDetail: { socialSecurity: round2(se.ss), medicare: round2(se.medicare), additionalMedicare: round2(se.additional) },
      halfSeDeduction: round2(halfSe),
      agi: round2(agi),
      taxableIncome: round2(taxable),
      federalIncomeTax: round2(fedIncomeTax),
      marginalRate: marginalRate(taxable, year, status),
      federalTotal: round2(federalTotal),
      stateTax: round2(stateTax),
      totalTax: round2(totalTax),
      federalDueAfterWithholding: round2(federalDue),
      quarterlyFederal: round2(federalDue / 4),
      quarterlyState: round2(stateTax / 4),
      setAsidePercent: netProfit > 0 ? round2(Math.max(0, totalTax - withholding) / netProfit * 100) : 0,
      safeHarborAmount: safeHarbor === null ? null : round2(safeHarbor),
      minimumQuarterlyToAvoidPenalty: round2(requiredAfterWithholding / 4),
      remainingAfterPaid: round2(remainingAfterPaid),
      dueDates: TAX_YEARS[year].dueDates.slice()
    };
  }

  return {
    TAX_YEARS: TAX_YEARS,
    estimate: estimate,
    incomeTax: incomeTax,
    selfEmploymentTax: selfEmploymentTax
  };
});
