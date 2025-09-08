// DCF Calculator logic — matches the sheet-style workflow
// 假設：
// - 起始 FCF = TTM Revenue * FCF Margin
// - 1~5 年用 g15 成長，6~10 年用 g610 成長
// - 終值 = FCF10 * (1 + gPerp) / (wacc - gPerp)
// - 現值 = 折現率 wacc 折現到今天
// - 企業價值 EV = 10 年 FCF 現值總和 + 終值現值
// - 股權價值 = EV + 現金 - 負債
// - 每股價格 = 股權價值 / 股數（若提供）

const $ = (sel) => document.querySelector(sel);

function pctToFloat(v) {
  if (v === '' || v === undefined || v === null) return NaN; // 空值視為未填
  const n = Number(v);
  if (!Number.isFinite(n)) return NaN;
  return n / 100;
}

function fmtMoney(n) {
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);
}

function buildProjectionTable(rows, terminal) {
  const headers = ['Year', '自由現金流', '終值 (Terminal Value)', '總和', 'FCF Margin'];
  let html = '<table class="proj">\n<thead><tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr></thead><tbody>';
  rows.forEach((r, idx) => {
    const isLast = idx === rows.length - 1;
    const tv = isLast ? terminal : 0;
    const sum = r.fcf + tv;
    html += `<tr><td>${r.year}</td><td>${fmtMoney(r.fcf)}</td><td>${fmtMoney(tv)}</td><td>${fmtMoney(sum)}</td><td>${(r.margin*100).toFixed(2)}%</td></tr>`;
  });
  html += '</tbody></table>';
  return html;
}

function syncGrowthInputs() {
  // 應用方要求：四個成長率欄位互不連動，保持獨立手動輸入。
  return;
}

function calculateDCF() {
  const company = $('#company').value.trim();
  const revenue = Number($('#revenue').value);
  const fcfMargin = pctToFloat($('#fcfMargin').value);
  const fcfYear1Input = Number($('#fcfYear1').value);

  const g15 = pctToFloat($('#g15').value || $('#revG15').value);
  const g610 = pctToFloat($('#g610').value || $('#revG610').value);
  const gPerp = pctToFloat($('#gperp').value);
  const waccInput = pctToFloat($('#wacc').value);
  const reqReturn = pctToFloat($('#reqReturn').value);
  const disc = Number.isFinite(waccInput) ? waccInput : (Number.isFinite(reqReturn) ? reqReturn : 0.10);

  const cash = Number($('#cash').value || 0);
  const debt = Number($('#debt').value || 0);
  const shares = Number($('#shares').value || 0);
  const market = Number($('#marketPrice').value || 0);
  const startYearInput = Number($('#startYear').value || 0);
  const startYear = Number.isFinite(startYearInput) && startYearInput > 1900 ? startYearInput : new Date().getFullYear();

  // 基本驗證
  const required = [revenue, fcfMargin, g15, g610, gPerp, fcfYear1Input];
  if (required.some((v) => !Number.isFinite(v))) {
    alert('請完整填寫：TTM 營收、FCF 率、自由現金流(第一年)、1~5年成長、6~10年成長、永久成長');
    return;
  }
  if (disc <= gPerp) {
    alert('折現率（WACC）必須大於永久成長率，否則無法計算終值。');
    return;
  }

  // 2024 視為 Y0（基準年）：
  // - FCF(Year0) 由使用者手動提供（fcfYear1Input）
  // - Revenue Y0 使用 TTM Revenue
  const rev = [revenue];
  const gRev15 = pctToFloat($('#revG15').value);
  const gRev610 = pctToFloat($('#revG610').value);
  for (let year = 1; year <= 10; year++) {
    const gRev = year <= 5 ? (Number.isFinite(gRev15) ? gRev15 : 0) : (Number.isFinite(gRev610) ? gRev610 : 0);
    rev.push(rev[year - 1] * (1 + gRev));
  }

  const fcf0 = fcfYear1Input; // 使用者手動輸入的第一年（基準年）FCF

  // 10 年投射（以年末 FCF 折現）
  const rows = [];
  let pvSum = 0;
  const flowsForNPV = []; // 對應表格 D13:M13（每年 FCF，加第10年含終值）
  // 按你提供的公式推導 FCF Margin 序列
  const marginArr = [fcf0 / rev[0]]; // C14 = C11 / F2

  // 先推入基準年（顯示用，不納入 NPV）
  rows.push({
    year: startYear,
    revenue: rev[0],
    margin: marginArr[0],
    fcf: fcf0,
    df: 1,
    pv: 0,
  });

  for (let year = 1; year <= 10; year++) {
    const gFcf = year <= 5 ? g15 : g610; // $C$3/$C$8
    const gRev = year <= 5 ? (Number.isFinite(gRev15) ? gRev15 : 0) : (Number.isFinite(gRev610) ? gRev610 : 0); // $F$4/$F$5
    const margin = marginArr[year - 1] * (1 + gFcf) / (1 + gRev);
    marginArr.push(margin);
    const fcf = margin * rev[year];
    const df = 1 / Math.pow(1 + disc, year);
    const pv = fcf * df;
    pvSum += pv;
    rows.push({ year: startYear + year, revenue: rev[year], margin, fcf, df, pv });
    flowsForNPV.push(fcf); // 暫存，終值稍後加到最後一年
  }

  // 終值（第10年後）
  const fcf10 = rows[rows.length - 1].fcf;
  const terminal = (fcf10 * (1 + gPerp)) / (disc - gPerp);
  const terminalPV = terminal / Math.pow(1 + disc, 10);

  // 企業價值與股權價值
  // 依你的表：EV = NPV(WACC, D13:M13)，其中最後一年加上 Terminal
  flowsForNPV[flowsForNPV.length - 1] += terminal;
  const EV = flowsForNPV.reduce((acc, cf, i) => acc + cf / Math.pow(1 + disc, i + 1), 0);
  const equity = EV + cash - debt;
  const price = shares > 0 ? equity / shares : NaN;

  // 顯示
  $('#results').classList.remove('hidden');
  $('#projectionTable').innerHTML = buildProjectionTable(rows, terminal);

  if (company) document.title = `${company} — DCF 估值`;

  // Cards
  $('#resFairCard').textContent = Number.isFinite(price) ? `$ ${fmtMoney(price)}` : '—';
  $('#resMarketCard').textContent = market ? `$ ${fmtMoney(market)}` : '—';
  if (market && Number.isFinite(price) && market !== 0) {
    const mos = (price - market) / market; // =(C22-C23)/C23
    $('#resMOS').textContent = (mos * 100).toFixed(2) + '%';
    const action = mos > 0 ? 'BUY' : 'SELL'; // IF(C24>0,"BUY","SELL")
    const node = $('#resAction');
    node.textContent = action;
    node.style.borderColor = action === 'BUY' ? '#16a34a' : '#dc2626';
  } else {
    $('#resMOS').textContent = '—';
    $('#resAction').textContent = '—';
  }

  // 計算後自動展開明細並滾動至該區
  const det = document.getElementById('projectionsDetails');
  if (det) {
    det.open = true;
    det.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function resetAll() {
  document.querySelectorAll('input').forEach((el) => (el.value = ''));
  $('#results').classList.add('hidden');
  $('#projectionTable').innerHTML = '';
}

window.addEventListener('DOMContentLoaded', () => {
  $('#calcBtn').addEventListener('click', calculateDCF);
  $('#resetBtn').addEventListener('click', resetAll);
  syncGrowthInputs();

  const ex = $('#exampleBtn');
  if (ex) {
    ex.addEventListener('click', () => {
      // GOOGL 範例（依你提供的截圖數字）
      $('#company').value = 'GOOGL';
      $('#g15').value = '15';
      $('#g610').value = '15';
      $('#gperp').value = '4';
      $('#reqReturn').value = '10';
      $('#wacc').value = '';
      $('#hist5').value = '';
      $('#revenue').value = '371399';
      $('#revG15').value = '12';
      $('#revG610').value = '12';
      $('#fcfMargin').value = '27.45';
      $('#fcfYear1').value = '74881';
      $('#cash').value = '95148';
      $('#debt').value = '41668';
      $('#shares').value = '12198';
      $('#startYear').value = '2024';
      $('#marketPrice').value = '235';
      calculateDCF();
    });
  }
});
