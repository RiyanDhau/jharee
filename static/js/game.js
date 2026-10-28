// Browser side of Pixel Pop: Laser Duel. All secret information stays on the server:
// this page only ever knows your own position until the reveal arrives.

const W = 320, H = 180, TILE = 20, MIN_AIM = 10, MARGIN = 10;
const BASE_COLORS = [
  { body: "#3b8cff", beam: "#2dc4ff" },   // slot 0: blue
  { body: "#ff3b6b", beam: "#ff2d55" },   // slot 1: red
  { body: "#3ddc84", beam: "#5dff9c" },   // slot 2: green
  { body: "#ffd23b", beam: "#ffe66b" },   // slot 3: yellow
  { body: "#b06bff", beam: "#c995ff" },   // slot 4: purple
  { body: "#2de0d0", beam: "#6bfff0" },   // slot 5: teal
  { body: "#ff8a3d", beam: "#ffb06b" },   // slot 6: orange
  { body: "#ff7ad9", beam: "#ffa6e8" },   // slot 7: pink
];
function colorFor(slot) {
  if (slot < BASE_COLORS.length) return BASE_COLORS[slot];
  const hue = Math.round((slot * 137.508) % 360);   // spreads the extra players around the colour wheel
  return { body: `hsl(${hue}, 70%, 60%)`, beam: `hsl(${hue}, 100%, 72%)` };
}
const SPR = [".XXXXXX.", "XXXXXXXX", "XWKXXWKX", "XWWXXWWX", "XXXXXXXX", "XXXXXXXX", ".XX..XX.", ".XX..XX."];
const TOUCH = window.matchMedia("(pointer: coarse)").matches;   // phones have no Enter key

const $ = (id) => document.getElementById(id);
const cv = $("c"), ctx = cv.getContext("2d");
const socket = io();

// phase: lobby, waiting, place, aim, locked, spectate, fire, result, over
let phase = "lobby";
let slot = 0, roomCode = "", names = [], joined = [], readySlots = [], aliveSlots = null, winnerSlot = null;
let isAlive = true, canReady = false, iAmReady = false;
let arenaFrom = [0, 0, W, H], arenaTo = [0, 0, W, H], arenaT0 = -1e9;   // the playable area, shrinks over time
let pendingPos = null, myPos = null, target = null, mouse = null;
let reveal = null, t0 = 0, resolved = false, parts = [], shake = 0;
let placeDeadline = null, roundDeadline = null, lastSec = -1;   // countdowns

// ---------- the shrinking arena ----------
const area = (a) => (a[2] - a[0]) * (a[3] - a[1]);
function curArena(now) {
  const k = Math.min(1, (now - arenaT0) / 700);
  const e = 1 - Math.pow(1 - k, 3);
  return arenaFrom.map((v, i) => v + (arenaTo[i] - v) * e);
}
function setArena(a) {
  const now = performance.now();
  const shrank = area(a) < area(arenaTo) - 1;
  arenaFrom = curArena(now); arenaTo = a; arenaT0 = now;
  return shrank;
}
function clampPos(p) {   // where you can stand
  const [x0, y0, x1, y1] = arenaTo;
  return [Math.min(Math.max(p[0], x0 + MARGIN), x1 - MARGIN), Math.min(Math.max(p[1], y0 + MARGIN), y1 - MARGIN)];
}
function clampAim(p) {   // where you can aim
  const [x0, y0, x1, y1] = arenaTo;
  return [Math.min(Math.max(p[0], x0), x1), Math.min(Math.max(p[1], y0), y1)];
}

// ---------- small UI helpers ----------
function setMsg(text) { $("msg").textContent = text; }

// the players list: colour, name and a sign showing READY / IN / OUT
function renderScore() {
  const box = $("roster");
  box.textContent = "";
  const title = document.createElement("div");
  title.className = "rtitle";
  title.textContent = "PLAYERS";
  box.appendChild(title);

  names.forEach((n, i) => {
    if (!joined.includes(i)) return;
    const out = aliveSlots !== null && !aliveSlots.includes(i);
    const ready = readySlots.includes(i);
    const showReady = phase === "waiting" || phase === "result";

    let text = "IN", cls = "rtag";
    if (phase === "over") text = i === winnerSlot ? "WINNER" : out ? "OUT" : "";
    else if (out) text = "OUT";
    else if (showReady) { text = ready ? "READY" : "NOT READY"; if (ready) cls += " ready"; }

    const row = document.createElement("div");
    row.className = "rrow" + (out ? " out" : "");
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = colorFor(i).body;
    const name = document.createElement("span");
    name.className = "rname";
    name.textContent = n + (i === slot ? " (you)" : "");
    const tag = document.createElement("span");
    tag.className = cls;
    tag.textContent = text;
    row.append(dot, name, tag);
    box.appendChild(row);
  });
}
function renderButtons() {
  let html = "";
  if (phase === "waiting") {
    html = iAmReady ? '<button data-act="ready">NOT READY</button>' : '<button class="go" data-act="ready">READY</button>';
  }
  if (phase === "aim" && TOUCH) html = '<button class="go" data-act="fire">FIRE</button>';   // phones only
  if (phase === "result" && canReady && !iAmReady) html = '<button class="go" data-act="ready">READY</button>';
  $("btns").innerHTML = html;
}
function showGame() { $("lobby").hidden = true; $("game").hidden = false; }
function waitingMsg() {
  const n = joined.length;
  return `Room ${roomCode}: ${n} player${n === 1 ? "" : "s"} here. ` +
    (n < 2 ? "Share the code and wait for someone to join!"
           : "Click READY. The game starts when everyone is ready!");
}
function aimHint() {
  return TOUCH ? "Touch the arena to point the laser, then tap FIRE!"
               : "Move your mouse to point the laser, then press ENTER to fire!";
}

// ---------- lobby buttons ----------
$("create").onclick = () => socket.emit("create_room", { name: $("name").value });
$("join").onclick = () => socket.emit("join_game", { name: $("name").value, code: $("code").value });
$("code").addEventListener("input", (e) => { e.target.value = e.target.value.toUpperCase(); });

// ---------- actions ----------
function fire() {
  if (phase !== "aim" || !myPos) return;
  if (!mouse) { setMsg(TOUCH ? "Touch the arena to aim first!" : "Move your mouse over the arena to aim first!"); return; }
  const p = clampAim(mouse);
  if (Math.hypot(p[0] - myPos[0], p[1] - myPos[1]) < MIN_AIM) {
    setMsg("Aim a bit further away from yourself.");
    return;
  }
  target = p;
  socket.emit("submit_target", { x: p[0], y: p[1] });
}
function toggleReady() {
  if (phase === "waiting") {
    iAmReady = !iAmReady;
    socket.emit("toggle_ready");
    renderButtons();
  } else if (phase === "result" && canReady && !iAmReady) {
    iAmReady = true;
    socket.emit("toggle_ready");
    setMsg("You are ready! Waiting for the others...");
    renderButtons();
  }
}
document.addEventListener("click", (e) => {
  const act = e.target.dataset ? e.target.dataset.act : null;
  if (act === "ready") toggleReady();
  if (act === "fire") fire();
  if (act === "home") location.reload();   // leaves the room and goes back to the start page
});
addEventListener("keydown", (e) => {
  const tag = document.activeElement.tagName;
  if ((e.key === "Enter" || e.key === " ") && tag !== "BUTTON" && tag !== "INPUT") {
    if (phase === "aim") fire(); else toggleReady();
    e.preventDefault();
  }
});

// ---------- mouse: click to stand somewhere, then move the mouse to point the laser ----------
function pos(e) {
  const r = cv.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H];
}
cv.addEventListener("pointermove", (e) => { mouse = pos(e); });
cv.addEventListener("pointerdown", (e) => {
  mouse = pos(e);
  if (phase === "place") {
    // clicking picks your spot (kept inside the glowing area) and locks it straight away
    pendingPos = clampPos(mouse);
    socket.emit("submit_position", { x: pendingPos[0], y: pendingPos[1] });
  }
});

// ---------- messages from the server ----------
socket.on("room_joined", (d) => {
  slot = d.slot;
  roomCode = d.code;
  phase = "waiting";
  showGame();
  renderButtons();
  setMsg(waitingMsg());
});

socket.on("lobby_update", (d) => {
  roomCode = d.code;
  names = [];
  d.players.forEach((p) => { names[p.slot] = p.name; });
  joined = d.players.map((p) => p.slot);
  readySlots = d.ready_slots;
  iAmReady = readySlots.includes(slot);
  if (phase === "waiting") setMsg(waitingMsg());
  renderScore();
  renderButtons();
});

socket.on("round_start", (d) => {
  slot = d.slot;
  isAlive = d.alive;
  aliveSlots = d.alive_slots;
  readySlots = d.ready_slots || [];
  iAmReady = false; canReady = false;
  const shrank = setArena(d.arena);
  target = null; reveal = null; parts = []; myPos = null; pendingPos = null;
  placeDeadline = performance.now() + (d.place_seconds || 40) * 1000;
  roundDeadline = performance.now() + (d.round_seconds || 70) * 1000;
  if (d.alive) {
    phase = "place";
    setMsg(`${shrank ? "The room shrank! " : ""}Round ${d.round}: ${d.alive_count} players left. Click where you want to stand.`);
  } else {
    phase = "spectate";
    setMsg(`You are out! Watching round ${d.round}...`);
  }
  renderScore();
  renderButtons();
});

// you chose your spot: you can aim straight away, you don't wait for the others
socket.on("position_locked", () => {
  myPos = pendingPos;
  phase = "aim";
  renderButtons();
  setMsg(aimHint());
});

// time ran out while placing: the server put you at a random spot
socket.on("position_assigned", (d) => {
  myPos = [d.x, d.y];
  phase = "aim";
  renderButtons();
  setMsg("Time ran out! You were placed at a random spot. " + aimHint());
});

socket.on("target_locked", () => {
  phase = "locked";
  renderButtons();
  setMsg("Fired! Waiting for the others...");
});

socket.on("lock_count", (d) => {
  const placed = `${d.placed}/${d.total} placed`, fired = `${d.fired}/${d.total} fired`;
  if (phase === "place") setMsg(`${placed}. Click where you want to stand.`);
  else if (phase === "aim") setMsg(`${fired}. ${aimHint()}`);
  else if (phase === "locked") setMsg(`Fired! ${fired}...`);
  else if (phase === "spectate") setMsg(`Watching... ${placed}, ${fired}.`);
});

socket.on("reveal", (d) => {
  reveal = d;
  phase = "fire";
  t0 = performance.now();
  resolved = false;
  placeDeadline = null; roundDeadline = null;
  d.players.forEach((p) => { p.dead = false; });
  renderButtons();
  setMsg("FIRE!");
});

// everyone else left, so the game ended early
socket.on("game_over", (d) => showEnd(d.winner, d.winner_name));

socket.on("error_msg", (d) => {
  if (phase === "lobby") { $("lobbyErr").textContent = d.message; return; }
  if (phase === "place") pendingPos = null;   // that spot was rejected: pick another
  setMsg(d.message);
});

// ---------- drawing ----------
function sprite(x, y, body, bob) {
  SPR.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch === ".") return;
      ctx.fillStyle = ch === "X" ? body : ch === "W" ? "#fff" : "#14062e";
      ctx.fillRect(Math.round(x - 8 + c * 2), Math.round(y - 8 + r * 2 + bob), 2, 2);
    });
  });
}
function drawPlayer(x, y, s, now) {
  ctx.fillStyle = "rgba(0,0,0,.35)";
  ctx.fillRect(x - 7, y + 8, 14, 3);
  sprite(x, y, colorFor(s).body, Math.round(Math.sin(now / 220 + s * 2)));
}
function floor() {
  for (let x = 0; x < W / TILE; x++) for (let y = 0; y < H / TILE; y++) {
    ctx.fillStyle = (x + y) % 2 ? "#2d1557" : "#241046";
    ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
  }
}
function drawArena(a) {
  // everything outside the glowing border is out of bounds
  const [x0, y0, x1, y1] = a;
  ctx.fillStyle = "rgba(8,2,20,.88)";
  ctx.fillRect(0, 0, W, y0); ctx.fillRect(0, y1, W, H - y1);
  ctx.fillRect(0, y0, x0, y1 - y0); ctx.fillRect(x1, y0, W - x1, y1 - y0);
  ctx.save();
  ctx.shadowColor = "#ff4fd8"; ctx.shadowBlur = 8;
  ctx.strokeStyle = "#ff4fd8"; ctx.lineWidth = 2;
  ctx.strokeRect(x0 + 1, y0 + 1, x1 - x0 - 2, y1 - y0 - 2);
  ctx.restore();
}
function mark(tx, ty, s) {
  ctx.strokeStyle = colorFor(s).beam; ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(tx) - 3, Math.round(ty) - 3, 6, 6);
}
function cross(x, y, c) {
  ctx.fillStyle = c;
  ctx.fillRect(x - 7, y, 4, 1); ctx.fillRect(x + 4, y, 4, 1);
  ctx.fillRect(x, y - 7, 1, 4); ctx.fillRect(x, y + 4, 1, 4);
}
function previewBeam(from, to, s) {
  // your own aiming beam: only drawn in your browser, nobody else ever sees it
  const c = colorFor(s).beam;
  ctx.save();
  ctx.shadowColor = c; ctx.shadowBlur = 8; ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.globalAlpha = .85;
  ctx.beginPath(); ctx.moveTo(from[0], from[1]); ctx.lineTo(to[0], to[1]); ctx.stroke();
  ctx.restore();
}
function beams(el) {
  const grow = Math.min(1, el / 350);
  reveal.players.forEach((p) => {
    const dx = p.tx - p.x, dy = p.ty - p.y, L = Math.hypot(dx, dy) || 1;
    if (dx === 0 && dy === 0) return;   // this player ran out of time and did not shoot
    const len = L * grow, x1 = p.x + dx / L * len, y1 = p.y + dy / L * len;
    const c = colorFor(p.slot).beam;
    ctx.save();
    ctx.shadowColor = c; ctx.shadowBlur = 14; ctx.strokeStyle = c; ctx.lineWidth = 4 + Math.random();
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.restore();
  });
}
function boom(p) {
  for (let i = 0; i < 36; i++) {
    parts.push({ x: p.x, y: p.y, vx: (Math.random() - .5) * 3.5, vy: (Math.random() - .5) * 3.5,
                 c: i % 3 ? colorFor(p.slot).body : "#fff", l: 1 });
  }
  shake = 7;
}

// the game is over: show who won
function showEnd(winner, name) {
  phase = "over";
  winnerSlot = winner;
  canReady = false;
  placeDeadline = null; roundDeadline = null;
  $("endText").textContent = winner === null ? "NOBODY WINS!" : winner === slot ? "YOU WON!" : `${name} WINS!`;
  $("end").hidden = false;
  setMsg("Game over!");
  renderScore();
  renderButtons();
}

function finish() {
  aliveSlots = reveal.alive_slots;
  readySlots = [];
  iAmReady = false;

  const hitSlots = reveal.players.filter((p) => p.hit).map((p) => p.slot);
  const iWasHit = hitSlots.includes(slot);
  if (iWasHit) isAlive = false;

  if (reveal.match_over) { showEnd(reveal.winner, reveal.winner_name); return; }

  phase = "result";
  let text = hitSlots.length === 0
    ? `Round ${reveal.round}: nobody was hit.`
    : `Round ${reveal.round}: eliminated - ${hitSlots.map((s) => names[s]).join(", ")}`;
  if (reveal.shrinking) text += " The room is shrinking!";
  if (iWasHit) text = "YOU GOT HIT! " + text;

  // only the survivors click READY for the next round
  canReady = isAlive;
  setMsg(text);
  renderScore();
  renderButtons();
}

// seconds left, red in the last 10: choosing a spot has its own limit, then the whole round has one
function updateTimer(now) {
  const el = $("timer");
  const deadline = phase === "place" ? placeDeadline
    : (phase === "aim" || phase === "locked" || phase === "spectate") ? roundDeadline : null;
  if (deadline === null) {
    if (lastSec !== -2) { el.textContent = ""; lastSec = -2; }
    return;
  }
  const s = Math.max(0, Math.ceil((deadline - now) / 1000));
  if (s !== lastSec) {
    lastSec = s;
    el.textContent = s + "s";
    el.classList.toggle("low", s <= 10);
  }
}

function loop(now) {
  updateTimer(now);
  ctx.save();
  if (shake > .3) { ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake); shake *= .9; }
  floor();
  drawArena(curArena(now));

  const col = colorFor(slot);
  if (phase === "place") {
    // a see-through version of you follows the mouse: click to stand there
    if (mouse) {
      const g = clampPos(mouse);
      ctx.globalAlpha = .6;
      drawPlayer(g[0], g[1], slot, now);
      ctx.globalAlpha = 1;
    }
  } else if ((phase === "aim" || phase === "locked") && myPos) {
    // you only ever see yourself, never the others
    drawPlayer(myPos[0], myPos[1], slot, now);
    if (phase === "aim" && mouse) {
      const a = clampAim(mouse);
      previewBeam(myPos, a, slot);
      cross(Math.round(a[0]), Math.round(a[1]), col.beam);
    }
    if (phase === "locked" && target) { previewBeam(myPos, target, slot); mark(target[0], target[1], slot); }
  } else if ((phase === "fire" || phase === "result" || phase === "over") && reveal) {
    const el = phase === "fire" ? now - t0 : 9999;
    reveal.players.forEach((p) => {
      if (!p.dead) drawPlayer(p.x, p.y, p.slot, now);
      if (p.tx !== p.x || p.ty !== p.y) mark(p.tx, p.ty, p.slot);
    });
    beams(el);
    reveal.players.forEach((p) => { if (!p.dead) drawPlayer(p.x, p.y, p.slot, now); });
    if (phase === "fire" && el > 450 && !resolved) {
      resolved = true;
      reveal.players.forEach((p) => { if (p.hit) { p.dead = true; boom(p); } });
    }
    if (phase === "fire" && el > 1700) finish();
  }

  parts.forEach((q) => {
    q.x += q.vx; q.y += q.vy; q.vy += .05; q.l -= .014;
    ctx.fillStyle = q.c; ctx.globalAlpha = Math.max(0, q.l); ctx.fillRect(q.x | 0, q.y | 0, 2, 2);
  });
  ctx.globalAlpha = 1;
  parts = parts.filter((q) => q.l > 0);
  ctx.restore();
  requestAnimationFrame(loop);
}
renderScore();
requestAnimationFrame(loop);