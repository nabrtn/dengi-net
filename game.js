/* ============================================================
   ДЕНЕГ НЕТ, НО ВЫ ДЕРЖИТЕСЬ — game core
   3 режима / 10 раундов / до 100 очков за раунд / localStorage
   ============================================================ */
(() => {
"use strict";

const L = window.LISTINGS || [];
const ROUNDS = 10;
const SLIDER_MIN = 1000, SLIDER_MAX = 15000, SLIDER_STEP = 50, SLIDER_START = 3500;

const $ = (s) => document.querySelector(s);
const stateKey = "dng_state_v1", bestKey = "dng_best_v1";

/* ---------- утилиты ---------- */
const fmt = (n) => n.toLocaleString("ru-RU").replace(/,/g, " ");
const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sample = (arr, n) => shuffle(arr).slice(0, n);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.hidden = true; }, 2200);
}

/* ---------- состояние ---------- */
let S = null; // {mode, idx, score, deck, history}

function loadJSON(k, fb) { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } }
function saveState() { if (S && S.idx < ROUNDS) localStorage.setItem(stateKey, JSON.stringify(S)); }
function clearState() { localStorage.removeItem(stateKey); }
function getBest() { return loadJSON(bestKey, {}); }
function setBest(mode, score) { const b = getBest(); if (!(mode in b) || score > b[mode]) { b[mode] = score; localStorage.setItem(bestKey, JSON.stringify(b)); } }

/* ---------- подсчёт очков (основной режим) ---------- */
function pricePoints(diffPct) {
  const a = Math.abs(diffPct);
  if (a <= 5) return 100;
  if (a <= 10) return 80;
  if (a <= 20) return 60;
  if (a <= 35) return 30;
  return 0;
}
function priceVerdict(diffPct) {
  const a = Math.abs(diffPct);
  if (a <= 5) return ["ИМБА. ПОЧТИ В ЯБЛОЧКО", "v-good", "ты и прайс — одна клетка. экстрасенсорика уровня «смахнул и угадал»."];
  if (a <= 10) return ["ЭТО БАЗА", "v-good", "чуть-чуть мимо, но рынок ты чувствуешь."];
  if (a <= 20) return ["НОРМ ЧЕК", "v-mid", "не идеально, но за прайс ты держишься."];
  if (a <= 35) return ["ПРОМАЗ", "v-mid", "калининград тебя немного разнёс."];
  return ["РАЗНОС", "", "цена тебя не ждала. и мы тоже."];
}
function directionNote(diffPct) {
  if (Math.abs(diffPct) < 0.5) return "ты назвал прайс почти точно. тревожно и красиво.";
  return diffPct > 0
    ? `перебор на ${fmt(Math.abs(Math.round(diffPct)))}% — ты думал, хозяин жаднее.`
    : `недобор на ${fmt(Math.abs(Math.round(diffPct)))}% — ты не верил в этот прайс.`;
}

/* ---------- колоды ---------- */
function buildDeck1() { return sample(L, ROUNDS); }

function buildPairs() {
  const ls = shuffle(L.filter((l) => l.price > 0));
  const pairs = [];
  const used = new Set();
  for (let i = 0; i < ls.length && pairs.length < ROUNDS; i++) {
    for (let j = i + 1; j < ls.length; j++) {
      if (used.has(ls[i].id) || used.has(ls[j].id)) continue;
      if (Math.abs(ls[i].price - ls[j].price) >= 50) {
        pairs.push([ls[i], ls[j]]);
        used.add(ls[i].id); used.add(ls[j].id);
        break;
      }
    }
  }
  // если уникальных не хватило — добираем парами из любого пула
  while (pairs.length < ROUNDS) {
    const p = sample(L, 2);
    if (p[0].id === p[1].id) continue;
    pairs.push(p);
  }
  return pairs;
}

function buildBudgetRounds() {
  const rounds = [];
  const used = new Set();
  let guard = 0;
  while (rounds.length < ROUNDS && guard++ < 500) {
    const three = sample(L, 3);
    const prices = three.map((x) => x.price);
    if (new Set(prices).size !== 3) continue;
    if (three.some((x) => used.has(x.id))) continue;
    const [p1, p2, p3] = [...prices].sort((a, b) => a - b);
    // бюджет: либо влезает только самый дешёвый, либо два
    const twoFit = Math.random() < 0.45;
    const lo = twoFit ? p2 + 50 : p1 + 50;
    const hi = twoFit ? p3 - 50 : p2 - 50;
    if (hi < lo) continue;
    let budget = Math.round((lo + Math.random() * (hi - lo)) / 50) * 50;
    budget = Math.max(budget, p1); // гарантия решаемости
    three.forEach((x) => used.add(x.id));
    rounds.push({ options: three, budget });
  }
  return rounds;
}

/* ---------- изображения ---------- */
const PH_IMG = "data:image/svg+xml," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#171717"/><text x="400" y="300" font-family="monospace" font-size="28" fill="#F2EFE8" text-anchor="middle">ФОТО НЕ ВЫВЕЗЛО</text></svg>`
);

function imgTag(src, alt, eager) {
  return `<img src="${esc(src)}" alt="${esc(alt)}" loading="${eager ? "eager" : "lazy"}" decoding="async" referrerpolicy="no-referrer"
    onerror="this.onerror=null;this.src='${PH_IMG}'">`;
}

function galleryHTML(listing, eagerFirst) {
  const imgs = listing.images.slice(0, 5);
  const main = imgTag(imgs[0], listing.title, eagerFirst);
  const thumbs = imgs.length > 1
    ? `<div class="gallery__thumbs">${imgs.map((u, i) => `<button data-i="${i}" aria-label="Фото ${i + 1}">${imgTag(u, "", false)}</button>`).join("")}</div>`
    : "";
  return `
  <div class="gallery">
    <div class="gallery__main" data-main>${main}
      <span class="gallery__counter" data-counter>1/${imgs.length}</span>
      ${listing.badge ? `<span class="gallery__flag">${esc(listing.badge)}</span>` : ""}
    </div>
    ${thumbs}
  </div>`;
}

function bindGallery(root) {
  const main = root.querySelector("[data-main]");
  if (!main) return;
  const imgEl = main.querySelector("img");
  const counter = root.querySelector("[data-counter]");
  const srcs = [...root.querySelectorAll(".gallery__thumbs img")].map((i) => i.getAttribute("src"));
  root.querySelectorAll(".gallery__thumbs button").forEach((b) => {
    b.addEventListener("click", (e) => {
      e.stopPropagation(); // клик по миниатюре — просмотр фото, а не выбор карточки
      const i = +b.dataset.i;
      imgEl.src = srcs[i];
      if (counter) counter.textContent = `${i + 1}/${srcs.length}`;
      root.querySelectorAll(".gallery__thumbs button").forEach((x) => x.classList.toggle("on", x === b));
    });
  });
}

/* ---------- экраны ---------- */
function show(id) {
  ["#screenMenu", "#screenGame", "#screenFinal"].forEach((s) => $(s).classList.add("hidden"));
  $(id).classList.remove("hidden");
  window.scrollTo(0, 0);
}

/* ---------- меню ---------- */
function renderMenu() {
  const b = getBest();
  [1, 2, 3].forEach((m) => {
    $(`#best${m}`).textContent = b[m] != null ? `РЕКОРД ${b[m]}` : "";
  });
  const saved = loadJSON(stateKey, null);
  const btn = $("#btnResume");
  if (saved && saved.idx < ROUNDS && saved.mode) {
    btn.hidden = false;
    btn.classList.remove("hidden");
    btn.textContent = `ПРОДОЛЖИТЬ: РАУНД ${saved.idx + 1}/10 · ${saved.score} ОЧКОВ`;
  } else {
    btn.classList.add("hidden");
  }
}

/* ---------- запуск режима ---------- */
function startMode(mode, restore) {
  S = restore || {
    mode,
    idx: 0,
    score: 0,
    deck: mode === 1 ? buildDeck1() : mode === 2 ? buildPairs() : buildBudgetRounds(),
    history: [],
  };
  S.idx = S.idx ?? 0;
  $("#gameModeName").textContent =
    mode === 1 ? "01 / УГАДАЙ ПРАЙС" : mode === 2 ? "02 / ЧТО ДОРОЖЕ?" : "03 / ВЛЕЗЕШЬ В БЮДЖЕТ?";
  show("#screenGame");
  renderRound();
}

function updateBar() {
  $("#gameRoundNow").textContent = Math.min(S.idx + 1, ROUNDS);
  $("#gameScore").textContent = S.score;
  const plate = $("#gamePlate");
  if (S.mode === 3 && S.deck[S.idx]) {
    plate.hidden = false;
    plate.className = "game-plate";
    plate.innerHTML = `ТВОЙ БЮДЖЕТ НА НОЧЬ — <b>${fmt(S.deck[S.idx].budget)} ₽</b>. ЦЕНЫ СПРЯТАНЫ: ЧЕКНИ ФОТО И ВЫБИРАЙ`;
  } else if (S.mode === 2) {
    plate.hidden = false;
    plate.className = "game-plate game-plate--ink";
    plate.innerHTML = `ОДНА ИЗ ДВУХ СТОИТ ДОРОЖЕ. <b>ТЫКАЙ СМЕЛЕЕ</b>`;
  } else {
    plate.hidden = true;
  }
}

/* ---------- раунд: режим 1 ---------- */
function renderRound1() {
  const it = S.deck[S.idx];
  const stage = $("#stage");
  stage.innerHTML = `
    <article class="card">
      ${galleryHTML(it, S.idx === 0)}
      <div class="info">
        <div class="info__row">
          <h2 class="info__title">${esc(it.title)}</h2>
          <span class="info__area">${esc(it.title.split(",")[1] || "")}</span>
        </div>
        <p class="info__addr">${esc(it.address.replace(/^Калининград,\s*/, ""))}</p>
        <div class="info__meta">
          ${it.rating ? `<span class="chip chip--star">★ ${String(it.rating).replace(".", ",")}</span>` : `<span class="chip">БЕЗ РЕЙТИНГА</span>`}
          ${it.reviews ? `<span class="chip">${it.reviews} отз.</span>` : ""}
          ${it.seller ? `<span class="chip chip--dark">${esc(it.seller)}</span>` : ""}
        </div>
        ${it.desc ? `<p class="info__desc">${esc(it.desc)}</p>` : ""}
      </div>

      <div class="bid" data-bid>
        <div class="bid__label"><span>ТВОЯ СТАВКА ЗА НОЧЬ</span><i>ЧЕКНИ И ВЫБИРАЙ</i></div>
        <div class="bid__value"><span data-val>${fmt(SLIDER_START)}</span> <small>₽</small></div>
        <input type="range" min="${SLIDER_MIN}" max="${SLIDER_MAX}" step="${SLIDER_STEP}" value="${SLIDER_START}" aria-label="Твоя ставка за ночь">
        <div class="bid__scale"><span>${fmt(SLIDER_MIN)}</span><span>${fmt(SLIDER_MAX)}</span></div>
        <button class="btn btn--lime" data-check>ЗАЧЕКАТЬ →</button>
      </div>

      <div class="reveal hidden" data-reveal></div>
    </article>`;
  bindGallery(stage);

  const input = stage.querySelector("input[type=range]");
  const val = stage.querySelector("[data-val]");
  const paint = () => {
    val.textContent = fmt(+input.value);
    input.style.setProperty("--fill", ((input.value - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN) * 100) + "%");
  };
  input.addEventListener("input", paint);
  paint();

  stage.querySelector("[data-check]").addEventListener("click", () => {
    const guess = +input.value;
    const diff = (guess - it.price) / it.price * 100;
    const pts = pricePoints(diff);
    const [vTitle, vClass, vNote] = priceVerdict(diff);
    S.score += pts;
    S.history.push({ n: S.idx + 1, id: it.id, title: it.title, guess, price: it.price, diffPct: Math.round(diff), pts });
    S.idx++;
    saveState();
    stage.querySelector("[data-bid]").classList.add("hidden");
    const rev = stage.querySelector("[data-reveal]");
    rev.classList.remove("hidden");
    rev.innerHTML = `
      <div class="reveal__head"><span>ПРАЙС РАСКРЫТ</span><span>РАУНД ${S.history.length}/10</span></div>
      <div class="reveal__body">
        <div class="reveal__nums">
          <div class="rn rn--real"><div class="rn__k">Реальная цена</div><div class="rn__v">${fmt(it.price)} <small>₽</small></div></div>
          <div class="rn rn--mine"><div class="rn__k">Твоя ставка</div><div class="rn__v">${fmt(guess)} <small>₽</small></div></div>
          <div class="rn rn--diff ${diff > 0 ? "rn--over" : ""}"><div class="rn__k">Разбег</div><div class="rn__v">${diff > 0 ? "▲" : "▼"} ${fmt(Math.abs(Math.round(diff)))}<small>%</small></div></div>
          <div class="rn rn--pts"><div class="rn__k">Очки</div><div class="rn__v">+${pts}</div></div>
        </div>
        <div class="reveal__verdict ${vClass}">${vTitle}</div>
        <p class="reveal__note">${directionNote(diff)}</p>
        <a class="reveal__link" href="${esc(it.url)}" target="_blank" rel="noopener">ЧЕКНИ ОРИГИНАЛ ↗</a>
        <button class="btn ${S.idx >= ROUNDS ? "btn--coral" : "btn--ultra"}" data-next>${S.idx >= ROUNDS ? "К ИТОГАМ →" : "СЛЕДУЮЩАЯ КВАРТИРА →"}</button>
      </div>`;
    rev.querySelector("[data-next]").addEventListener("click", nextOrFinish);
    updateBar();
    preloadNext();
  });
}

/* ---------- раунд: режим 2 ---------- */
function renderRound2() {
  const [a, b] = S.deck[S.idx];
  const stage = $("#stage");
  // div вместо button: внутри карточки есть кнопки галереи, а button в button вкладывать нельзя
  const card = (l, pos) => `
    <div class="duel-card" role="button" tabindex="0" data-l="${pos}">
      ${galleryHTML(l, false)}
      <div class="duel-card__info">
        <span>
          <span class="duel-card__t">${esc(l.title)}</span>
          <span class="duel-card__a" style="display:block">${esc(l.address.replace(/^Калининград,\s*/, ""))}</span>
        </span>
        <span class="duel-card__pick">ВЫБРАТЬ</span>
        <span class="duel-card__price hidden" data-price></span>
      </div>
    </div>`;
  stage.innerHTML = `
    <div class="duel">
      ${card(a, "a")}
      <div class="duel__vs">VS</div>
      ${card(b, "b")}
      <div class="reveal hidden" data-reveal></div>
    </div>`;
  stage.querySelectorAll(".gallery__thumbs").forEach((g) => g.remove()); // в дуэли — одно фото
  stage.querySelectorAll(".duel-card").forEach((c) => {
    c.querySelector(".gallery__counter").remove();
    const pickCard = () => {
      const pick = c.dataset.l;
      const chosen = pick === "a" ? a : b;
      const correct = chosen.price >= (pick === "a" ? b.price : a.price);
      const pts = correct ? 100 : 0;
      S.score += pts;
      S.history.push({ n: S.idx + 1, title: chosen.title, correct, pts });
      S.idx++;
      saveState();
      stage.querySelectorAll(".duel-card").forEach((k) => {
        k.style.pointerEvents = "none";
        const l = k.dataset.l === "a" ? a : b;
        const win = l.price > (k.dataset.l === "a" ? b.price : a.price);
        const p = k.querySelector("[data-price]");
        p.textContent = fmt(l.price) + " ₽";
        p.classList.remove("hidden");
        k.querySelector(".duel-card__pick").classList.add("hidden");
        k.classList.add(win ? "duel-card--win" : "duel-card--lose");
        if (k === c) k.classList.add("duel-card--picked");
      });
      const rev = stage.querySelector("[data-reveal]");
      rev.classList.remove("hidden");
      rev.innerHTML = `
        <div class="reveal__body" style="border-top:var(--border)">
          <div class="reveal__verdict ${correct ? "v-good" : ""}">${correct ? "ЭТО БАЗА. ТЫ ЧУЕШЬ ПРАЙС" : "НЕ ВЫВЕЗ. ДОРОЖЕ БЫЛО ДРУГОЕ"}</div>
          <p class="reveal__note">${correct ? `+100 очков. разница между прайсами — ${fmt(Math.abs(a.price - b.price))} ₽.` : "дорогая квартира отмечена салатовым прайсом."}</p>
          <a class="reveal__link" href="${esc(chosen.url)}" target="_blank" rel="noopener">ЧЕКНИ ОРИГИНАЛ ↗</a>
          <button class="btn ${S.idx >= ROUNDS ? "btn--coral" : "btn--ultra"}" data-next>${S.idx >= ROUNDS ? "К ИТОГАМ →" : "СЛЕДУЮЩАЯ ПАРА →"}</button>
        </div>`;
      rev.querySelector("[data-next]").addEventListener("click", nextOrFinish);
      updateBar();
      preloadNext();
    };
    c.addEventListener("click", pickCard, { once: true });
    c.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickCard(); }
    });
  });
  updateBar();
}

/* ---------- раунд: режим 3 (цены скрыты — выбор по фото) ---------- */
function renderRound3() {
  const r = S.deck[S.idx];
  const stage = $("#stage");
  stage.innerHTML = `
    <div class="budget-list">
      ${r.options.map((l, i) => `
        <div class="b-card" role="button" tabindex="0" data-i="${i}">
          ${galleryHTML(l, i === 0)}
          <span class="b-card__row">
            <span>
              <span class="b-card__t">${esc(l.title)}</span>
              <span class="b-card__a" style="display:block">${esc(l.address.replace(/^Калининград,\s*/, ""))}</span>
            </span>
            <span class="b-card__p b-card__p--hidden" data-price>ПРАЙС СКРЫТ</span>
          </span>
        </div>`).join("")}
      <div class="reveal hidden" data-reveal></div>
    </div>`;
  stage.querySelectorAll(".gallery__counter").forEach((c) => c.remove());
  stage.querySelectorAll(".b-card").forEach((c) => bindGallery(c));
  stage.querySelectorAll(".b-card").forEach((c) => {
    const pickBudget = (e) => {
      // клик по миниатюре галереи — это просмотр фото, а не выбор квартиры
      if (e && e.target.closest(".gallery__thumbs")) return;
      const l = r.options[+c.dataset.i];
      const fit = l.price <= r.budget;
      const pts = fit ? 100 : 0;
      const rest = r.budget - l.price;
      S.score += pts;
      S.history.push({ n: S.idx + 1, title: l.title, fit, pts });
      S.idx++;
      saveState();
      stage.querySelectorAll(".b-card").forEach((k) => {
        k.style.pointerEvents = "none";
        const o = r.options[+k.dataset.i];
        const p = k.querySelector("[data-price]");
        p.textContent = fmt(o.price) + " ₽";
        p.classList.remove("b-card__p--hidden");
        k.classList.add(o.price <= r.budget ? "b-card--fit" : "b-card--over");
        if (k === c) k.style.outline = "4px solid var(--ultra)";
      });
      const rev = stage.querySelector("[data-reveal]");
      rev.classList.remove("hidden");
      rev.innerHTML = `
        <div class="reveal__body" style="border-top:var(--border)">
          <div class="reveal__verdict ${fit ? "v-good" : ""}">${fit ? "ВЛЕЗ. ЭКОНОМИЯ — ТВОЯ БАЗА" : "РАЗНОС. ВЫЛЕЗ ЗА БЮДЖЕТ"}</div>
          <p class="reveal__note">${fit
            ? `сдача с бюджета: ${fmt(rest)} ₽. можно и на пиццу.` 
            : `перебор: ${fmt(-rest)} ₽. бюджет не вывез такой прайс.`}</p>
          <a class="reveal__link" href="${esc(l.url)}" target="_blank" rel="noopener">ЧЕКНИ ОРИГИНАЛ ↗</a>
          <button class="btn ${S.idx >= ROUNDS ? "btn--coral" : "btn--ultra"}" data-next>${S.idx >= ROUNDS ? "К ИТОГАМ →" : "СЛЕДУЮЩИЙ БЮДЖЕТ →"}</button>
        </div>`;
      rev.querySelector("[data-next]").addEventListener("click", nextOrFinish);
      updateBar();
      preloadNext();
    };
    c.addEventListener("click", pickBudget);
    c.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickBudget(); }
    });
  });
  updateBar();
}

function renderRound() {
  updateBar();
  if (S.mode === 1) renderRound1();
  else if (S.mode === 2) renderRound2();
  else renderRound3();
}

function nextOrFinish() {
  if (S.idx >= ROUNDS) finishGame();
  else renderRound();
}

function preloadNext() {
  const nxt = S.mode === 1 ? S.deck[S.idx] : S.mode === 2 ? (S.deck[S.idx] || [])[0] : (S.deck[S.idx] || {}).options?.[0];
  if (nxt && nxt.images[0]) new Image().src = nxt.images[0];
}

/* ---------- итоги ---------- */
function finalStatus() {
  if (S.mode === 1) {
    const diffs = S.history.map((h) => h.diffPct);
    const avg = diffs.reduce((s, d) => s + d, 0) / diffs.length;
    if (avg < -5) return ["ЭКОНОМ НА МАКСАЛКАХ", "ты стабильно занижал прайсы. рынок Калининграда оказался наглее твоей интуиции."];
    if (avg > 5) return ["ДЕНЬГИ НЕ ПРОБЛЕМА", "ты стабильно завышал. для тебя цена на жильё — понятие растяжимое."];
    return ["ЦЕНОВОЙ ЭКСТРАСЕНС", "ты угадывал прайсы с хирургической точностью. это база."];
  }
  const correct = S.history.filter((h) => h.pts > 0).length;
  if (correct >= 8) return ["ЦЕНОВОЙ ЭКСТРАСЕНС", "прайсы подчиняются тебе. покажи этот результат хозяевам квартир."];
  if (correct >= 5) return ["ЭКОНОМ НА МАКСАЛКАХ", "чувство экономии развито, но рынок иногда вывозит тебя в разнос."];
  return ["ДЕНЬГИ НЕ ПРОБЛЕМА", "бюджет — условность. к сожалению, это игра, а не твоя карта."];
}

function finishGame() {
  clearState();
  setBest(S.mode, S.score);
  const total = S.score;
  let accuracy;
  if (S.mode === 1) {
    const avgAbs = S.history.reduce((s, h) => s + Math.abs(h.diffPct), 0) / S.history.length;
    accuracy = Math.max(0, Math.round(100 - avgAbs));
  } else {
    accuracy = Math.round(S.history.filter((h) => h.pts > 0).length / ROUNDS * 100);
  }
  const [status, statusNote] = finalStatus();

  const modeName = S.mode === 1 ? "УГАДАЙ ПРАЙС" : S.mode === 2 ? "ЧТО ДОРОЖЕ?" : "ВЛЕЗЕШЬ В БЮДЖЕТ?";

  $("#finalContent").innerHTML = `
    <div class="final__tag">
      <span class="tag">ИТОГИ</span>
      <span class="tag" style="background:var(--lime)">РЕЖИМ: ${modeName}</span>
    </div>
    <div class="final__scorewrap">
      <div class="final__score">${total}<small> очк.</small></div>
      <span class="final__max">МАКСИМУМ 1000</span>
    </div>
    <div class="final__status"><span>ТВОЙ СТАТУС</span>${status}</div>
    <p class="masthead__sub" style="margin-top:14px">${statusNote}</p>
    <div class="final__stats">
      <div class="fs"><div class="fs__k">Точность</div><div class="fs__v">${accuracy}%</div></div>
      <div class="fs"><div class="fs__k">${S.mode === 1 ? "Ср. разбег" : "В точку"}</div><div class="fs__v">${S.mode === 1 ? fmt(Math.round(S.history.reduce((s, h) => s + Math.abs(h.diffPct), 0) / ROUNDS)) + "%" : S.history.filter((h) => h.pts > 0).length + "/10"}</div></div>
      <div class="fs"><div class="fs__k">Рекорд</div><div class="fs__v">${Math.max(total, getBest()[S.mode] ?? 0)}</div></div>
    </div>
    <div class="final__actions">
      <button class="btn btn--lime" data-share>ПОДЕЛИТЬСЯ РЕЗУЛЬТАТОМ</button>
      <div class="row">
        <button class="btn btn--ultra" data-replay>ЕЩЁ РАЗ</button>
        <button class="btn btn--ghost" data-menu>В МЕНЮ</button>
      </div>
    </div>`;

  $("#finalContent [data-share]").addEventListener("click", shareResult);
  $("#finalContent [data-replay]").addEventListener("click", () => startMode(S.mode));
  $("#finalContent [data-menu]").addEventListener("click", () => { renderMenu(); show("#screenMenu"); });
  show("#screenFinal");
}

function shareResult() {
  const [status] = finalStatus();
  let accuracy;
  if (S.mode === 1) {
    const avgAbs = S.history.reduce((s, h) => s + Math.abs(h.diffPct), 0) / S.history.length;
    accuracy = Math.max(0, Math.round(100 - avgAbs));
  } else {
    accuracy = Math.round(S.history.filter((h) => h.pts > 0).length / ROUNDS * 100);
  }
  const text = `ДЕНЕГ НЕТ, НО ВЫ ДЕРЖИТЕСЬ // Калининград\nСчёт: ${S.score}/1000 · Точность: ${accuracy}%\nСтатус: ${status}\nЧекни прайсы и ты:`;
  const url = location.origin + location.pathname;
  if (navigator.share) {
    navigator.share({ title: "ДЕНЕГ НЕТ, НО ВЫ ДЕРЖИТЕСЬ", text, url }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text + " " + url)
      .then(() => toast("РЕЗУЛЬТАТ СКОПИРОВАН — КИДАЙ ДРУЗЬЯМ"))
      .catch(() => toast("НЕ СМОГ СКОПИРОВАТЬ, НО ТЫ ДЕРЖИСЬ"));
  }
}

/* ---------- глобальные обработчики ---------- */
$("#modesBlock").addEventListener("click", (e) => {
  const m = e.target.closest(".mode");
  if (m) startMode(+m.dataset.mode);
});
$("#btnResume").addEventListener("click", () => {
  const saved = loadJSON(stateKey, null);
  if (saved && saved.idx < ROUNDS) startMode(saved.mode, saved);
});
$("#btnExit").addEventListener("click", () => { renderMenu(); show("#screenMenu"); });

/* ---------- бегущая строка ---------- */
(function ticker() {
  const items = ["АРЕНДА КАЛИНИНГРАД", "ЦЕНЫ НЕ ДЛЯ СЛАБОНЕРВНЫХ", "СУТКИ ОТ 1 850 ₽", "ЧЕКНИ ПРАЙС", "ЭТО БАЗА ИЛИ РАЗНОС", "50 РЕАЛЬНЫХ ОБЪЯВЛЕНИЙ", "ДЕРЖИСЬ"];
  const half = items.map((t) => `<span>${t} <i>●</i></span>`).join("");
  $("#tickerTrack").innerHTML = half + half;
})();

renderMenu();
show("#screenMenu");

})();
