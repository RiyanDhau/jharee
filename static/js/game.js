 // All secret information stays on the server:
// this page only ever knows your own position until the reveal arrives.

//defines the virtual arena's dimensions
const W = 320, H = 180, TILE = 20; 
const COLORS = [
  { body: "#3b8cff", beam: "#2dc4ff" },   // side 0: P1, blue, left half
  { body: "#ff3b6b", beam: "#ff2d55" },   // side 1: P2, red, right half
];
const SPR = [".XXXXXX.", "XXXXXXXX", "XWKXXWKX", "XWWXXWWX", "XXXXXXXX", "XXXXXXXX", ".XX..XX.", ".XX..XX."];

//connection between JavaScript and the webpage's HTML elements
const $ = (id) => document.getElementById(id);
const cv = $("c"), ctx = cv.getContext("2d");
const socket = io();

let phase = "lobby";   // lobby, waiting, aim, locked, fire, result, waitnext
let side = 0, names = ["P1", "P2"], wins = [0, 0], pendingWins = [0, 0];
let myPos = null, target = null, mouse = null;
let reveal = null, t0 = 0, resolved = false, parts = [], shake = 0;

// ---------- small UI helpers ----------
function setMsg(text) { $("msg").textContent = text; }
function renderScore() { $("score").textContent = `${names[0]} ${wins[0]} : ${wins[1]} ${names[1]}`; }
function renderButtons() {
  let html = "";
  if (phase === "aim") html = '<button class="go" data-act="lock">LOCK IN</button>';
  if (phase === "result") html = '<button class="go" data-act="next">NEXT ROUND</button>';
  $("btns").innerHTML = html;
}
function showGame() { $("lobby").hidden = true; $("game").hidden = false; }
function showLobby() { $("lobby").hidden = false; $("game").hidden = true; }

// ---------- lobby buttons ----------
$("create").onclick = () => socket.emit("create_room", { name: $("name").value });
$("join").onclick = () => socket.emit("join_game", { name: $("name").value, code: $("code").value });
$("code").addEventListener("input", (e) => { e.target.value = e.target.value.toUpperCase(); });

// ---------- actions ----------
function lock() {
  if (phase !== "aim") return;
  if (!target) { setMsg("Click the arena to pick a target first!"); return; }
  socket.emit("submit_target", { x: target[0], y: target[1] });
}
function next() {
  if (phase !== "result") return;
  socket.emit("ready_next");
  phase = "waitnext";
  setMsg("Waiting for the other player...");
  renderButtons();
}
$("btns").addEventListener("click", (e) => {
  const act = e.target.dataset.act;
  if (act === "lock") lock();
  if (act === "next") next();
});
addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && document.activeElement.tagName !== "BUTTON" &&
      document.activeElement.tagName !== "INPUT") {
    if (phase === "aim") lock(); else if (phase === "result") next();
    e.preventDefault();
  }
});

// ---------- cursor aiming ----------
function pos(e) {
  const r = cv.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H];
}
cv.addEventListener("pointermove", (e) => { mouse = pos(e); });
cv.addEventListener("pointerleave", () => { mouse = null; });
cv.addEventListener("pointerdown", (e) => {
  if (phase !== "aim") return;
  target = pos(e);
  mouse = target;
});

// ---------- messages from the server ----------
socket.on("room_joined", (d) => {
  side = d.side;
  phase = "waiting";
  showGame();
  renderButtons();
  setMsg(`Room ${d.code}. Share this code with your opponent!`);
  renderScore();
});

socket.on("lobby_update", (d) => {
  names = ["P1", "P2"];
  d.players.forEach((p) => { names[p.side] = p.name; });
  renderScore();
  if (phase !== "lobby" && d.players.length < 2) {
    phase = "waiting";
    myPos = null; reveal = null;
    wins = [0, 0];
    renderScore();
    renderButtons();
    setMsg(`Room ${d.code}: waiting for an opponent. Share the code!`);
  }
});

socket.on("round_start", (d) => {
  phase = "aim";
  side = d.side;
  myPos = [d.x, d.y];
  target = null;
  reveal = null;
  parts = [];
  wins = d.wins;
  renderScore();
  renderButtons();
  setMsg(`Round ${d.round}: you are ${side === 0 ? "blue" : "red"}. Click to aim, then lock in!`);
});

socket.on("target_locked", () => {
  phase = "locked";
  renderButtons();
  setMsg("Locked in! Waiting for the other player...");
});

socket.on("opponent_locked", () => {
  if (phase === "aim") setMsg("The other player is locked in. Your turn!");
});

socket.on("reveal", (d) => {
  reveal = d;
  pendingWins = d.wins;
  phase = "fire";
  t0 = performance.now();
  resolved = false;
  d.players.forEach((p) => { p.dead = false; });
  renderButtons();
  setMsg("FIRE!");
});

socket.on("opponent_left", () => { setMsg("The other player left the room."); });

socket.on("error_msg", (d) => {
  if (phase === "lobby") $("lobbyErr").textContent = d.message; else setMsg(d.message);
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
  sprite(x, y, COLORS[s].body, Math.round(Math.sin(now / 220 + s * 2)));
}
function floor() {
  for (let x = 0; x < W / TILE; x++) for (let y = 0; y < H / TILE; y++) {
    ctx.fillStyle = (x + y) % 2 ? "#2d1557" : "#241046";
    ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
  }
  ctx.fillStyle = "rgba(45,155,255,.12)"; ctx.fillRect(0, 0, W / 2, H);
  ctx.fillStyle = "rgba(255,59,92,.12)"; ctx.fillRect(W / 2, 0, W / 2, H);
  ctx.fillStyle = "#ffe14f";
  for (let y = 4; y < H; y += 12) ctx.fillRect(W / 2 - 1, y, 2, 6);
  ctx.strokeStyle = "#ff4fd8"; ctx.lineWidth = 2; ctx.strokeRect(1, 1, W - 2, H - 2);
}
function mark(tx, ty, s) {
  ctx.strokeStyle = COLORS[s].beam; ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(tx) - 3, Math.round(ty) - 3, 6, 6);
}
function cross(x, y, c) {
  ctx.fillStyle = c;
  ctx.fillRect(x - 7, y, 4, 1); ctx.fillRect(x + 4, y, 4, 1);
  ctx.fillRect(x, y - 7, 1, 4); ctx.fillRect(x, y + 4, 1, 4);
}
function beams(el) {
  const grow = Math.min(1, el / 350);
  reveal.players.forEach((p) => {
    const dx = p.tx - p.x, dy = p.ty - p.y, L = Math.hypot(dx, dy) || 1;
    const len = L * grow, x1 = p.x + dx / L * len, y1 = p.y + dy / L * len;
    const c = COLORS[p.side].beam;
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
                 c: i % 3 ? COLORS[p.side].body : "#fff", l: 1 });
  }
  shake = 7;
}
function finish() {
  phase = "result";
  wins = pendingWins;
  renderScore();
  if (reveal.outcome === "double") setMsg("DOUBLE KO! Nobody scores.");
  else if (reveal.outcome === "win") setMsg(reveal.winner === side ? "YOU WIN THE ROUND!" : "YOU GOT HIT!");
  else setMsg("BOTH MISSED! Everyone shuffles a little.");
  renderButtons();
}

function loop(now) {
  ctx.save();
  if (shake > .3) { ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake); shake *= .9; }
  floor();

  if ((phase === "aim" || phase === "locked") && myPos) {
    // while aiming you only see yourself, never the opponent
    drawPlayer(myPos[0], myPos[1], side, now);
    if (target) mark(target[0], target[1], side);
    if (phase === "aim" && mouse) cross(Math.round(mouse[0]), Math.round(mouse[1]), COLORS[side].beam);
  } else if ((phase === "fire" || phase === "result" || phase === "waitnext") && reveal) {
    const el = phase === "fire" ? now - t0 : 9999;
    reveal.players.forEach((p) => { if (!p.dead) drawPlayer(p.x, p.y, p.side, now); mark(p.tx, p.ty, p.side); });
    beams(el);
    reveal.players.forEach((p) => { if (!p.dead) drawPlayer(p.x, p.y, p.side, now); });
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
