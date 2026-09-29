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

  // Comissao do coanfitriao: vence no dia commission_due_day do mes seguinte.
  // PAGO | SEM_VALOR | FUTURO | EM_ANDAMENTO | A_VENCER | ATRASADO
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const commissionDue = (sheet, row) => new Date(sheet.year, row.month_num, Math.min(28, Math.max(1, toNumber(sheet.commission_due_day) || 10)));
  const paymentStatus = (row, sheet, now = new Date()) => {
    const c = calcMonth(row, sheet);
    const due = commissionDue(sheet, row);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const amount = Math.max(0, c.hostFee);
    const paidAmount = row.host_fee_paid_at ? (isEmpty(row.host_fee_paid_amount) ? amount : toNumber(row.host_fee_paid_amount)) : 0;
    let key;
    if (row.host_fee_paid_at) key = 'PAGO';
    else if (amount < 0.005) key = 'SEM_VALOR';
    else if (isFuture(sheet, row, now)) key = 'FUTURO';
    else if (sheet.year === now.getFullYear() && row.month_num === now.getMonth() + 1) key = 'EM_ANDAMENTO';
    else if (today > due) key = 'ATRASADO';
    else key = 'A_VENCER';
    const daysLate = key === 'ATRASADO' ? Math.round((today - due) / 86400000) : 0;
    return { key, amount, paidAmount, due, dueISO: ymd(due), daysLate, difference: key === 'PAGO' ? paidAmount - amount : 0 };
  };
  const paymentTotals = (sheet, months, now = new Date()) => {
    const t = { received: 0, pending: 0, overdue: 0, overdueCount: 0, pendingCount: 0, paidCount: 0 };
    (months || []).forEach((row) => {
      const p = paymentStatus(row, sheet, now);
      if (p.key === 'PAGO') { t.received += p.paidAmount; t.paidCount += 1; }
      else if (p.key === 'ATRASADO') { t.overdue += p.amount; t.overdueCount += 1; t.pending += p.amount; t.pendingCount += 1; }
      else if (p.key === 'A_VENCER' || p.key === 'EM_ANDAMENTO') { t.pending += p.amount; t.pendingCount += 1; }
    });
    return t;
  };

  window.CDEVSheetCalc = { toNumber, daysIn, autoCleaning, calcMonth, isFuture, totals, commissionDue, paymentStatus, paymentTotals };
})();
