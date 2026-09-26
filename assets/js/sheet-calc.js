/* CDEV - calculo das planilhas de imoveis (fonte unica usada por /dashboard e /admin)
 *
 * Por mes:
 *   faturamento bruto = pago pelos hospedes + extras
 *   limpeza           = valor informado, ou reservas x taxa de limpeza (se vazio)
 *   coanfitriao       = valor informado, ou (bruto - limpeza) x comissao (se vazio)
 *   receita liquida   = bruto - limpeza - coanfitriao
 *   lucro liquido     = receita liquida - fixas (gas+luz+internet+condominio) - variaveis
 */
(function () {
  const toNumber = (value) => { const n = Number(value); return Number.isFinite(n) ? n : 0; };
  const isEmpty = (v) => v === null || v === undefined || v === '';
  const daysIn = (year, month) => new Date(year, month, 0).getDate();

  const autoCleaning = (row, sheet) => toNumber(row.clients_count) * toNumber(sheet.cleaning_fee_per_client);

  const calcMonth = (row, sheet) => {
    const gross = toNumber(row.paid_clients) + toNumber(row.paid_extra);
    const cleaning = isEmpty(row.cleaning_laundry) ? autoCleaning(row, sheet) : toNumber(row.cleaning_laundry);
    const autoHost = (gross - cleaning) * toNumber(sheet.commission_rate);
    const hostFee = isEmpty(row.host_fee_override) ? autoHost : toNumber(row.host_fee_override);
    const revenueTotal = gross - cleaning - hostFee;
    const fixedTotal = toNumber(row.fixed_gas) + toNumber(row.fixed_electricity) + toNumber(row.fixed_internet) + toNumber(row.fixed_condo);
    const variableTotal = toNumber(row.variable_total) || toNumber(row.variable_cost);
    const netProfit = revenueTotal - fixedTotal - variableTotal;
    const nights = toNumber(row.nights_count);
    const days = daysIn(sheet.year, row.month_num);
    return {
      gross, cleaning, hostFee, autoHost, revenueTotal, fixedTotal, variableTotal, netProfit,
      nights, occupancy: days ? Math.min(nights / days, 1) : 0,
      adr: nights ? toNumber(row.paid_clients) / nights : 0,
      bookings: toNumber(row.clients_count),
      hasActivity: gross > 0 || nights > 0
    };
  };

  const isFuture = (sheet, row, now = new Date()) =>
    sheet.year > now.getFullYear() || (sheet.year === now.getFullYear() && row.month_num > now.getMonth() + 1);

  const totals = (sheet, months) => {
    const t = { gross: 0, cleaning: 0, host: 0, revenue: 0, fixed: 0, variable: 0, net: 0, nights: 0, days: 0, bookings: 0, paid: 0, activeMonths: 0 };
    (months || []).forEach((row) => {
      const c = calcMonth(row, sheet);
      t.gross += c.gross; t.cleaning += c.cleaning; t.host += c.hostFee; t.revenue += c.revenueTotal;
      t.fixed += c.fixedTotal; t.variable += c.variableTotal; t.net += c.netProfit;
      t.nights += c.nights; t.bookings += c.bookings; t.paid += toNumber(row.paid_clients);
      if (!isFuture(sheet, row)) t.days += daysIn(sheet.year, row.month_num);
      if (c.hasActivity) t.activeMonths += 1;
    });
    t.occupancy = t.days ? Math.min(t.nights / t.days, 1) : 0;
    t.adr = t.nights ? t.paid / t.nights : 0;
    t.margin = t.gross ? t.net / t.gross : 0;
    return t;
  };

  window.CDEVSheetCalc = { toNumber, daysIn, autoCleaning, calcMonth, isFuture, totals };
})();
