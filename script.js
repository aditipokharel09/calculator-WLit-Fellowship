/* Touch Calculator for blind users
 * Explore: touch or slide over keys. Each key is spoken, nothing is typed.
 * Confirm: tap the same key a second time. (Keyboard: arrows move, Enter types.)
 * Guide mode: say or type a sum and the app tells you which key is next and where it is. */
(() => {
  const $ = (id) => document.getElementById(id);
  const grid = $("grid"), out = $("out"), exprEl = $("expr"), statusEl = $("status");

  // ---- Keys: id, label, spoken name, style ----
  const LAYOUT = [
    [["clear","Clear","Clear","util"],["back","⌫","Backspace","util"],["read","Read","Read display","util"],["guide","Guide","Guide me","util"]],
    [["7"],["8"],["9"],["÷","÷","divided by","op"]],
    [["4"],["5"],["6"],["×","×","times","op"]],
    [["1"],["2"],["3"],["−","−","minus","op"]],
    [["0"],[".",".","point"],["=","=","equals","eq"],["+","+","plus","op"]],
  ];
  const pos = {}, nameOf = {};
  LAYOUT.forEach((row, r) => row.forEach(([id, t = id, say = id, cls = ""], c) => {
    pos[id] = { r, c }; nameOf[id] = say;
    const b = document.createElement("button");
    b.type = "button"; b.className = "key " + cls; b.dataset.id = id; b.textContent = t;
    b.setAttribute("aria-label", say);
    grid.appendChild(b);
  }));
  const btn = (id) => grid.querySelector(`[data-id="${CSS.escape(id)}"]`);

  // ---- Speech + haptics ----
  let rate = 1;
  function speak(text) {
    statusEl.textContent = text;
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    speechSynthesis.speak(u);
  }
  const buzz = (p) => navigator.vibrate && navigator.vibrate(p);

  // ---- Calculator state (no eval) ----
  let cur = "0", stored = null, op = null, fresh = false;
  const OPS = { "+": (a,b)=>a+b, "−": (a,b)=>a-b, "×": (a,b)=>a*b, "÷": (a,b)=>a/b };
  const SAY = { "+":"plus", "−":"minus", "×":"times", "÷":"divided by" };
  const tidy = (n) => String(parseFloat(n.toPrecision(12)));
  const num = (s) => String(s).replace("-", "minus ").replace(".", " point ");
  const calc = () => (op === "÷" && parseFloat(cur) === 0) ? null : tidy(OPS[op](stored, parseFloat(cur)));
  function reset() { cur = "0"; stored = null; op = null; fresh = false; }
  function render() { out.textContent = cur; exprEl.textContent = op ? `${tidy(stored)} ${op}` : "\u00a0"; }

  function doKey(id) {
    let msg;
    if (/^[0-9]$/.test(id)) {
      if (fresh) { cur = id; fresh = false; }
      else if (cur.replace(/[-.]/g, "").length < 15) cur = cur === "0" ? id : cur + id;
      msg = `Typed ${id}. Now ${num(cur)}.`;
    } else if (id === ".") {
      if (fresh) { cur = "0."; fresh = false; } else if (!cur.includes(".")) cur += ".";
      msg = `Point. Now ${num(cur)}.`;
    } else if (OPS[id]) {
      if (op && !fresh) {
        const r = calc();
        if (r === null) { reset(); render(); return "Cannot divide by zero. Cleared."; }
        stored = parseFloat(r); cur = r;
      } else if (!op) stored = parseFloat(cur);
      op = id; fresh = true;
      msg = `${SAY[id]}. Waiting for the next number.`;
    } else if (id === "=") {
      if (!op) return `Display is ${num(cur)}.`;
      const r = calc(), b = cur;
      if (r === null) { reset(); render(); return "Cannot divide by zero. Cleared."; }
      msg = `${num(tidy(stored))} ${SAY[op]} ${num(b)} equals ${num(r)}.`;
      cur = r; stored = null; op = null; fresh = true;
    } else if (id === "back") {
      if (fresh) return "Nothing to delete.";
      cur = cur.length > 1 ? cur.slice(0, -1) : "0";
      msg = `Deleted. Now ${num(cur)}.`;
    } else if (id === "clear") {
      reset(); guide = null; clearTargets(); msg = "Cleared.";
    } else if (id === "read") {
      msg = `${op ? num(tidy(stored)) + " " + SAY[op] + ". " : ""}Display is ${num(cur)}.`;
    }
    render();
    return msg;
  }

  // ---- Guide mode ----
  let guide = null, lastTouched = null;
  const plural = (n, w) => `${n} ${w}${n > 1 ? "s" : ""}`;
  function route(from, to) {
    const t = nameOf[to];
    if (!from) return `${t} is in row ${pos[to].r + 1}, column ${pos[to].c + 1}.`;
    const dx = pos[to].c - pos[from].c, dy = pos[to].r - pos[from].r;
    if (!dx && !dy) return `${t} is right here.`;
    const p = [];
    if (dy) p.push(`${plural(Math.abs(dy), "key")} ${dy < 0 ? "up" : "down"}`);
    if (dx) p.push(`${plural(Math.abs(dx), "key")} ${dx < 0 ? "left" : "right"}`);
    return `${t} is ${p.join(" and ")} from ${nameOf[from]}.`;
  }
  function markTarget() {
    clearTargets();
    if (guide) btn(guide.seq[guide.i]).classList.add("target");
  }
  function clearTargets() { grid.querySelectorAll(".target").forEach((k) => k.classList.remove("target")); }

  function parseSum(text) {
    const s = text.toLowerCase()
      .replace(/multiplied by|times|into|\bx\b/g, "*").replace(/divided by|over/g, "/")
      .replace(/plus|add/g, "+").replace(/minus|subtract|less/g, "-")
      .replace(/point|dot/g, ".").replace(/equals?|is|what/g, "").replace(/[\s,?]/g, "");
    if (!/^[0-9.]+([+\-*/][0-9.]+)*$/.test(s)) return null;
    const map = { "-": "−", "*": "×", "/": "÷" };
    return [...s].map((ch) => map[ch] || ch).concat("=");
  }
  function startGuide(text) {
    const seq = parseSum(text);
    if (!seq) { buzz([60, 40, 60]); speak("Sorry, I could not understand that sum. Try something like 12 plus 3."); return; }
    reset(); render();
    guide = { seq, i: 0 };
    markTarget();
    const said = seq.slice(0, -1).map((k) => nameOf[k]).join(" ");
    speak(`Okay, ${said}. I will guide you key by key. First, ${route(lastTouched, seq[0])}`);
  }
  function toggleGuide() {
    if (guide) { guide = null; clearTargets(); return "Guide off."; }
    if (SR) { listen(); return "Listening. Say a sum, like twelve plus three."; }
    $("sumInput").focus();
    return "Type a sum in the text box, then press Enter.";
  }

  const SRClass = window.SpeechRecognition || window.webkitSpeechRecognition;
  const SR = !!SRClass;
  function listen() {
    if (!SR) { $("sumInput").focus(); return; }
    const rec = new SRClass();
    rec.lang = "en-US";
    rec.onresult = (e) => { const t = e.results[0][0].transcript; $("sumInput").value = t; startGuide(t); };
    rec.onerror = () => speak("I could not hear you. Try again, or type the sum.");
    try { rec.start(); } catch { /* already listening */ }
  }

  // ---- Touch exploring ----
  let hints = 0;
  function announce(id) {
    let msg = nameOf[id];
    if (guide) {
      const exp = guide.seq[guide.i];
      msg += id === exp ? ". Correct. Tap again to type it." : `. Not that one. ${route(id, exp)}`;
    } else if (hints++ < 3) msg += ". Tap again to type it.";
    speak(msg);
    buzz(12);
  }
  function activate(id) {
    lastTouched = id;
    if (guide && !["clear", "guide", "read"].includes(id)) {
      const exp = guide.seq[guide.i];
      if (id !== exp) { buzz([60, 40, 60]); speak(`That is ${nameOf[id]}, not ${nameOf[exp]}. ${route(id, exp)}`); return; }
    }
    buzz(40);
    let msg = id === "guide" ? toggleGuide() : doKey(id);
    if (guide && id === guide.seq[guide.i]) {
      guide.i++;
      if (guide.i >= guide.seq.length) { guide = null; msg += " Guide complete."; }
      else msg += ` Next, ${route(id, guide.seq[guide.i])}`;
      markTarget();
    }
    speak(msg);
  }

  const idAt = (e) => { const el = document.elementFromPoint(e.clientX, e.clientY); const k = el && el.closest(".key"); return k ? k.dataset.id : null; };
  // First tap on a key announces and "arms" it. A second tap on that same key types it.
  let hover = null, armed = null, slid = false;
  function setHot(id) { grid.querySelectorAll(".hot").forEach((k) => k.classList.remove("hot")); if (id) btn(id).classList.add("hot"); }

  grid.addEventListener("pointerdown", (e) => {
    const id = idAt(e); if (!id) return;
    hover = id; slid = false; lastTouched = id; setHot(id);
    if (id !== armed) announce(id);
  });
  grid.addEventListener("pointermove", (e) => {
    if (hover === null) return;
    const id = idAt(e);
    if (id && id !== hover) { hover = id; slid = true; lastTouched = id; setHot(id); announce(id); }
  });
  grid.addEventListener("pointerup", () => {
    if (!hover) return;
    const id = hover;
    hover = null; setHot(null);
    if (id === armed && !slid) { armed = null; activate(id); }
    else armed = id;
  });
  grid.addEventListener("pointercancel", () => { hover = null; setHot(null); });

  // Clicks from a screen reader (VoiceOver/TalkBack double-tap) or keyboard arrive with detail 0.
  grid.addEventListener("click", (e) => {
    const k = e.target.closest(".key");
    if (k && e.detail === 0) { armed = null; activate(k.dataset.id); }
  });

  // ---- Keyboard ----
  const KEYS = { "+": "+", "-": "−", "*": "×", x: "×", "/": "÷", ".": ".", ",": ".", "=": "=", "%": null };
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.id === "sumInput") return;
    const onKey = document.activeElement && document.activeElement.classList.contains("key");
    let id = null;
    if (/^[0-9]$/.test(e.key)) id = e.key;
    else if (KEYS[e.key]) id = KEYS[e.key];
    else if (e.key === "Backspace") id = "back";
    else if (e.key === "Escape") id = "clear";
    else if (e.key === "Enter" && !onKey) id = "=";
    if (id) { e.preventDefault(); activate(id); return; }

    const d = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
    if (d) {
      e.preventDefault();
      const from = onKey ? pos[document.activeElement.dataset.id] : { r: 0, c: -1 };
      const r = Math.min(4, Math.max(0, from.r + d[0])), c = Math.min(3, Math.max(0, from.c + d[1]));
      const id2 = LAYOUT[r][c][0];
      btn(id2).focus(); lastTouched = id2; announce(id2);
    }
  });

  // ---- Top controls ----
  $("help").addEventListener("click", () => speak(
    "Touch a key to hear its name. Slide your finger to explore. Nothing is typed until you tap the same key a second time. " +
    "The grid has five rows of four. The top row has Clear, Backspace, Read and Guide. Below are the digits with divide, times, minus and plus on the right. " +
    "The bottom row has zero, point, equals and plus. Tap Guide twice, then say a sum, and I will lead you to each key."));
  $("slower").addEventListener("click", () => { rate = Math.max(0.6, rate - 0.2); speak(`Speed ${rate.toFixed(1)}`); });
  $("faster").addEventListener("click", () => { rate = Math.min(2, rate + 0.2); speak(`Speed ${rate.toFixed(1)}`); });
  $("mic").addEventListener("click", listen);
  $("sumForm").addEventListener("submit", (e) => { e.preventDefault(); startGuide($("sumInput").value); document.activeElement.blur(); });

  render();
})();
