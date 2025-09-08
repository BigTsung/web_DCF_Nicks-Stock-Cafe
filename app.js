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

function renderGauge(fair, market) {
  const wrap = document.getElementById('gaugeWrap');
  if (!Number.isFinite(fair) || !Number.isFinite(market) || fair <= 0 || market <= 0) {
    if (wrap) wrap.classList.add('hidden');
    return;
  }

  const width = 900, height = 480;
  const cx = width / 2;
  const R = 250; // 外半徑
  const inner = 140; // 內半徑（較小→色帶更靠近圓心）
  const cy = R + 90; // 下移儀表，留更多上邊距避免文字被切
  const start = Math.PI; // 180°
  const end = 2 * Math.PI; // 360°

  function polar(r, a) { return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
  function ringSectorPath(Ro, Ri, a0, a1) {
    const [x0, y0] = polar(Ro, a0);
    const [x1, y1] = polar(Ro, a1);
    const [x2, y2] = polar(Ri, a1);
    const [x3, y3] = polar(Ri, a0);
    const la = (a1 - a0) > Math.PI ? 1 : 0;
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${Ro} ${Ro} 0 ${la} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)} A ${Ri} ${Ri} 0 ${la} 0 ${x3.toFixed(2)} ${y3.toFixed(2)} Z`;
  }
  function semiPath(r) {
    const [xs, ys] = polar(r, start);
    const [xe, ye] = polar(r, end);
    return `M ${xs.toFixed(2)} ${ys.toFixed(2)} A ${r} ${r} 0 0 1 ${xe.toFixed(2)} ${ye.toFixed(2)} L ${cx} ${cy} Z`;
  }

  // 分段：綠、淺綠、黃、橘、紅（5 段），均分 180°
  const colors = ['#22c55e', '#93d6a6', '#fde047', '#f59e0b', '#ef4444'];
  const segs = 5;
  const step = (end - start) / segs;
  let bands = '';
  for (let i = 0; i < segs; i++) {
    const a0 = start + i * step;
    const a1 = start + (i + 1) * step;
    bands += `<path d="${ringSectorPath(R, inner, a0, a1)}" fill="${colors[i]}" />`;
  }

  // 內部半圓（中心盤）
  const hubPath = semiPath(inner - 40);
  const hub = `<path d="${hubPath}" fill="#e6eef7" />`;

  // 針（依 Stock Price 定位）
  const ratio = (market - fair) / fair; // 正 -> 偏右（高估）
  const t = Math.max(-0.6, Math.min(0.6, ratio));
  const ang = start + (t + 0.5) * (end - start);
  const tip = polar(R - 90, ang);
  // 窄底座與小夾角，讓指針更細
  const baseRadius = 8; // 細底座
  const halfWidthAngle = 0.004; // 窄角度
  const baseLeft = polar(baseRadius, ang - Math.PI/2 + halfWidthAngle);
  const baseRight = polar(baseRadius, ang + Math.PI/2 - halfWidthAngle);
  const needle = `<polygon points="${baseLeft[0].toFixed(2)},${baseLeft[1].toFixed(2)} ${tip[0].toFixed(2)},${tip[1].toFixed(2)} ${baseRight[0].toFixed(2)},${baseRight[1].toFixed(2)}" fill="#0f172a" />`;

  // Fair Value 文字 + 小箭頭（置中向上）
  const topY = cy - R; // 色帶最上緣的位置
  const fairLabelY = Math.max(18, topY - 64); // 再往上避免與小箭頭重疊
  const fairAmountY = fairLabelY + 28;
  // 小三角：向下指到色帶外緣（尖端=色帶邊緣）
  const triBaseY = topY - 24;
  const triTipY = topY;
  const fairText = `<text x="${cx}" y="${fairLabelY}" text-anchor="middle" font-size="22" font-weight="800" fill="#0f172a">Fair Value</text>
                    <text x="${cx}" y="${fairAmountY}" text-anchor="middle" font-size="26" font-weight="800" fill="#0f172a">$ ${fmtMoney(fair)}</text>
                    <polygon points="${cx-8},${triBaseY} ${cx+8},${triBaseY} ${cx},${triTipY}" fill="#0f172a" />`;

  // Stock Price 文字：顯示在指針尖端附近
  const priceText = `<text x="${tip[0].toFixed(2)}" y="${(tip[1]-22).toFixed(2)}" text-anchor="middle" font-size="22" font-weight="800" fill="#111827">Stock Price</text>
                    <text x="${tip[0].toFixed(2)}" y="${(tip[1]+4).toFixed(2)}" text-anchor="middle" font-size="26" font-weight="800" fill="#111827">$ ${fmtMoney(market)}</text>`;

  // 左右標籤：置於綠色與紅色區塊的下方、各自居中
  const leftMid = start + step / 2;
  const rightMid = end - step / 2;
  const leftX = polar((R + inner) / 2, leftMid)[0] - 72;
  const rightX = polar((R + inner) / 2, rightMid)[0] + 72;
  const labelY = cy + 32;
  const sideText = `<text x="${leftX.toFixed(2)}" y="${labelY}" text-anchor="middle" font-size="22" font-weight="700" fill="#111827">Undervalued</text>
                    <text x="${rightX.toFixed(2)}" y="${labelY}" text-anchor="middle" font-size="22" font-weight="700" fill="#111827">Overvalued</text>`;

  const svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Gauge">
    ${bands}
    ${hub}
    ${needle}
    ${fairText}
    ${priceText}
    ${sideText}
  </svg>`;

  const mos = (fair - market) / market;
  const mosColor = mos >= 0 ? '#16a34a' : '#ef4444';
  // const caption = `<div class="caption" style="font-size:22px">Margin of Safety: <span style="color:${mosColor}">${(mos*100).toFixed(2)}%</span></div>`;

  // wrap.innerHTML = svg + caption;
  wrap.innerHTML = svg;
  wrap.classList.remove('hidden');
}

function renderSingleLineChart(elId, years, series, options) {
  const el = document.getElementById(elId);
  if (!el) return;
  const w = 960, h = 300;
  const isPct = options?.percent === true;

  const maxVal = Math.max(...series) * 1.1;
  const minVal = Math.min(0, Math.min(...series) * 0.9);

  // 預先計算 Y 軸刻度文字，據此估算左側邊距
  const ticks = 4;
  const yTickLabels = [];
  for (let i = 0; i <= ticks; i++) {
    const v = minVal + (maxVal - minVal) * (i / ticks);
    const label = isPct ? `${v.toFixed(1)}%` : fmtMoney(v);
    yTickLabels.push(label);
  }
  const approxCharW = 7.2; // 12px 字體的估算字寬
  const maxLabelLen = Math.max(...yTickLabels.map(s => String(s).length));
  const marginLeft = Math.max(56, 20 + maxLabelLen * approxCharW);

  const m = { l: marginLeft, r: 56, t: 16, b: 32 };
  const iw = w - m.l - m.r, ih = h - m.t - m.b;

  // X 軸在最前端預留 1 個資料點的空間
  const xStep = iw / (years.length);
  const x = (i) => m.l + (i + 1) * xStep;
  const y = (v) => m.t + ih - (v - minVal) / (maxVal - minVal) * ih;
  const toPath = (values) => values.map((v, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(' ');

  let yGrid = '';
  for (let i = 0; i <= ticks; i++) {
    const v = minVal + (maxVal - minVal) * (i / ticks);
    const yy = y(v);
    const label = yTickLabels[i];
    yGrid += `<line x1=\"${m.l}\" y1=\"${yy}\" x2=\"${m.l + iw}\" y2=\"${yy}\" stroke=\"#eee\" />` +
             `<text x=\"${m.l - 6}\" y=\"${yy+4}\" text-anchor=\"end\" font-size=\"12\">${label}</text>`;
  }

  let xLabels = '';
  years.forEach((yr, i) => {
    const xx = x(i);
    xLabels += `<text x=\"${xx}\" y=\"${m.t + ih + 16}\" text-anchor=\"middle\" font-size=\"12\">${yr}</text>`;
  });

  const color = options?.color || '#2563eb';
  const dots = series.map((v,i)=>{
    const xi = x(i).toFixed(2);
    const yi = y(v).toFixed(2);
    const label = isPct ? `${v.toFixed(2)}%` : fmtMoney(v);
    return `<g>
      <circle cx='${xi}' cy='${yi}' r='3.5' fill='white' stroke='${color}' stroke-width='2'>
        <title>${years[i]}: ${label}</title>
      </circle>
      <text x='${xi}' y='${(y(v)-8).toFixed(2)}' text-anchor='middle' font-size='11' fill='#111827'>${label}</text>
    </g>`;
  }).join('');

  const svg = `
  <svg viewBox=\"0 0 ${w} ${h}\">`
    +`<rect x=\"1\" y=\"1\" width=\"${w-2}\" height=\"${h-2}\" rx=\"6\" ry=\"6\" fill=\"white\" stroke=\"#eee\" />`
    + yGrid + xLabels
    + `<path d=\"${toPath(series)}\" fill=\"none\" stroke=\"${color}\" stroke-width=\"2\" />`
    + dots
  + `</svg>`;

  el.innerHTML = svg;
}

function renderCharts(rows, terminal) {
  const years = rows.map(r => r.year);
  const fcf = rows.map(r => r.fcf);
  const sum = rows.map((r, i) => i === rows.length - 1 ? (r.fcf + terminal) : r.fcf);
  const margin = rows.map(r => r.margin * 100);

  renderSingleLineChart('chart-fcf', years, fcf, { color: '#2563eb' });
  renderSingleLineChart('chart-sum', years, sum, { color: '#0ea5e9' });
  renderSingleLineChart('chart-margin', years, margin, { color: '#16a34a', percent: true });
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
  renderCharts(rows, terminal);

  if (company) document.title = `${company} — DCF 估值`;

  // Cards
  $('#resFairCard').textContent = Number.isFinite(price) ? `$ ${fmtMoney(price)}` : '—';
  $('#resMarketCard').textContent = market ? `$ ${fmtMoney(market)}` : '—';
  $('#resEVCard').textContent = `$ ${fmtMoney(EV)}`;
  $('#resEquityCard').textContent = `$ ${fmtMoney(equity)}`;
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

  // 畫儀表圖（需每股合理價與市價）
  if (Number.isFinite(price) && market > 0) {
    renderGauge(price, market);
  } else {
    const wrap = document.getElementById('gaugeWrap');
    if (wrap) wrap.classList.add('hidden');
  }

  // 計算後自動捲動到「結果」區塊頂部
  const resultsEl = document.getElementById('results');
  if (resultsEl) resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  //（已回退：不提供每列配色控制）

  // 下載儀表圖（將 SVG 轉 PNG）
  function companySlug() {
    const el = document.getElementById('company');
    const raw = (el && el.value ? el.value : 'company').trim();
    const slug = raw ? raw.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') : 'company';
    return slug || 'company';
  }
  function downloadGaugePng() {
    const wrap = document.getElementById('gaugeWrap');
    const svg = wrap ? wrap.querySelector('svg') : null;
    if (!svg) { alert('請先計算，產生儀表圖後再下載'); return; }
    const xml = new XMLSerializer().serializeToString(svg);
    const svg64 = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    const img = new Image();
    img.onload = () => {
      // 以 viewBox 解析原始尺寸
      let w = 900, h = 480;
      const vb = svg.getAttribute('viewBox');
      if (vb) { const p = vb.split(/\s+/); if (p.length === 4) { w = +p[2]; h = +p[3]; } }
      const scale = Math.max(1200 / w, 2); // 至少 1.2K 或 2x
      const canW = Math.round(w * scale), canH = Math.round(h * scale);
      const canvas = document.createElement('canvas');
      canvas.width = canW; canvas.height = canH;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,canW,canH);
      ctx.drawImage(img, 0, 0, canW, canH);
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a'); a.href = url; a.download = `${companySlug()}_gauge.png`; a.click();
    };
    img.src = svg64;
  }

  // 將任意 DOM 轉為 PNG（使用 foreignObject 包裝成 SVG）
  function downloadNodePng(node, filename) {
    const rect = node.getBoundingClientRect();
    const w = Math.ceil(rect.width), h = Math.ceil(rect.height);
    const scale = Math.max(1200 / w, 2);
    const style = `
      <style>
        *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans TC',Arial,sans-serif;}
        table{border-collapse:collapse;width:100%;}
        th,td{padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-size:12px;}
        th:first-child,td:first-child{text-align:left;}
        tbody tr:nth-child(odd){background:#f9fafb;}
        tbody tr:nth-child(even){background:#ffffff;}
      </style>`;
    const data = `<?xml version="1.0" encoding="UTF-8"?>
      <svg xmlns="http://www.w3.org/2000/svg" width="${w*scale}" height="${h*scale}">
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml" style="background:#fff;width:${w*scale}px;height:${h*scale}px;">
            ${style}
            <div style="transform:scale(${scale});transform-origin:top left;width:${w}px;height:${h}px;">
              ${node.outerHTML}
            </div>
          </div>
        </foreignObject>
      </svg>`;
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(data);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w*scale); canvas.height = Math.round(h*scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const out = canvas.toDataURL('image/png');
      const a = document.createElement('a'); a.href = out; a.download = filename; a.click();
    };
    img.src = url;
  }

  const btnGauge = document.getElementById('btnSaveGauge');
  if (btnGauge) btnGauge.addEventListener('click', downloadGaugePng);
  const btnTable = document.getElementById('btnSaveTable');
  if (btnTable) btnTable.addEventListener('click', () => {
    const node = document.getElementById('projectionTable');
    if (!node || !node.firstElementChild) { alert('請先計算生成表格'); return; }
    downloadNodePng(node.firstElementChild, `${companySlug()}_fcf-table.png`);
  });
});
