// National Industrial Classification, the subset the coverage rule cares about.
//
// Why this file exists: Udyam registration alone does not settle whether
// s.43B(h) applies. Wholesale and retail trade were admitted to Udyam in 2021
// for priority-sector-lending purposes, while sitting outside the MSMED s.15
// delayed-payment obligation that 43B(h) hangs on. NIC divisions 45-47 are
// that trade section.
//
// This is a *prior*, not a verdict. A firm registered under a trading code may
// well have manufactured the item on a given invoice. The coverage rule reads
// this alongside evidence about what was actually supplied.

/** NIC 2008 divisions that constitute wholesale/retail trade (Section G). */
export const TRADE_DIVISIONS = [45, 46, 47];

export const NIC = {
  // -- Section C, manufacturing -------------------------------------------
  13921: 'Manufacture of made-up textile articles, except apparel',
  17021: 'Manufacture of corrugated paper and paperboard containers',
  17029: 'Manufacture of other articles of paper and paperboard',
  18112: 'Printing of books, periodicals and other printed matter',
  20119: 'Manufacture of other basic industrial chemicals',
  22199: 'Manufacture of other rubber products',
  24310: 'Casting of iron and steel',
  25113: 'Manufacture of fabricated structural metal products',
  25931: 'Manufacture of hand tools and general hardware',
  25999: 'Manufacture of other fabricated metal products n.e.c.',
  27900: 'Manufacture of other electrical equipment',
  28299: 'Manufacture of other special-purpose machinery',

  // -- Section G, wholesale and retail trade -------------------------------
  46209: 'Wholesale of other agricultural raw materials',
  46510: 'Wholesale of computers and peripheral equipment',
  46630: 'Wholesale of construction materials and hardware',
  46721: 'Wholesale of metals and metal ores',
  46909: 'Non-specialised wholesale trade',
  47521: 'Retail sale of hardware, paints and glass',
  47630: 'Retail sale of stationery and office supplies',
  47730: 'Retail sale of other new goods in specialised stores',

  // -- Section H, transport and storage ------------------------------------
  49231: 'Freight transport by road',
  52221: 'Service activities incidental to water transportation',

  // -- Section M, professional and technical -------------------------------
  71100: 'Architectural and engineering activities and related consultancy',
};

/** Division is the first two digits of the NIC code. */
export function division(code) {
  return Math.floor(Number(code) / 1000);
}

/** Is this registration a trading activity on its face? */
export function isTradeCode(code) {
  return TRADE_DIVISIONS.includes(division(code));
}

export function describe(code) {
  return NIC[code] || `NIC ${code}`;
}
