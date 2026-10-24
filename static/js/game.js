// All secret information stays on the server:
// this page only knows your own position until the reveal arrives.

// Defines the virtual arena's dimensions in pixels.
// W = width, H = height, TILE = size of each floor tile.
const W = 320, H = 180, TILE = 20;

// Defines the body and laser-beam colors for each player slot.
// The slot number determines which color a player uses.
// The modulo operator (%) lets colors repeat if there are more players than colors.
const COLORS = [
  { body: "#3b8cff", beam: "#2dc4ff" },   // slot 0: blue
  { body: "#ff3b6b", beam: "#ff2d55" },   // slot 1: red
  { body: "#3ddc84", beam: "#5dff9c" },   // slot 2: green
  { body: "#ffd23b", beam: "#ffe66b" },   // slot 3: yellow
  { body: "#b06bff", beam: "#c995ff" },   // slot 4: purple
  { body: "#2de0d0", beam: "#6bfff0" },   // slot 5: teal
  { body: "#ff8a3d", beam: "#ffb06b" },   // slot 6: orange
  { body: "#ff7ad9", beam: "#ffa6e8" },   // slot 7: pink
];

// Defines the player's pixel-art sprite.
// Each character represents one small square:
// X = player's body, W = white pixels, K = dark pixels, . = transparent space.
const SPR = [".XXXXXX.", "XXXXXXXX", "XWKXXWKX", "XWWXXWWX", "XXXXXXXX", "XXXXXXXX", ".XX..XX.", ".XX..XX."];

// A shortcut for finding an HTML element using its ID.
// For example, $("msg") finds the element whose id is "msg".
const $ = (id) => document.getElementById(id);

// Finds the game canvas and gets its 2D drawing context.
// cv = the canvas element; ctx = the tools used to draw on that canvas.
const cv = $("c"), ctx = cv.getContext("2d");

// Connects this browser to the server through Socket.IO.
// This allows the browser and Python backend to exchange events.
const socket = io();

// ---------- game state ----------

// Stores the current stage of the game.
// lobby = creating/joining a room; waiting = waiting for players;
// aim = choosing a target; locked = shot submitted;
// spectate = watching after elimination; fire = laser animation;
// result = displaying the outcome.
let phase = "lobby";

// Stores this player's slot, the maximum number of players,
// their names, current scores, and scores received for the next result.
// Arrays are used because the game can have more than two players.
let slot = 0, maxPlayers = 2, names = ["P1", "P2"], wins = [0, 0], pendingWins = [0, 0];

// Tracks whether this player is alive and whether they can start the next round.
let isAlive = true, needsNext = false;

// myPos = this player's own position in the arena.
// target = the coordinates they selected for their laser shot.
// mouse = the current mouse position inside the arena.
let myPos = null, target = null, mouse = null;

// reveal = round information received from the server after shots are revealed.
// t0 = starting time of the laser animation.
// resolved = prevents the hit animation from being processed more than once.
// parts = explosion particles; shake = how strongly the screen shakes.
let reveal = null, t0 = 0, resolved = false, parts = [], shake = 0;


// ---------- small UI helpers ----------

// Updates the message displayed on the webpage.
function setMsg(text) {
  $("msg").textContent = text;
}

// Updates the scoreboard with every player's name and score.
function renderScore() {
  const box = $("score");

  // Clears the old scoreboard before drawing the updated one.
  box.textContent = "";

  // Loops through every player name and its index.
  names.forEach((n, i) => {
    const span = document.createElement("span");

    // Gives each player their assigned color.
    span.style.color = COLORS[i % COLORS.length].body;

    // Adds space around each player's scoreboard entry.
    span.style.margin = "0 6px";

    // Shows the name, marks the current player, and displays their score.
    // wins[i] ?? 0 means to use 0 if that score is null or undefined.
    span.textContent = `${n}${i === slot ? " (you)" : ""} ${wins[i] ?? 0}`;

    // Adds the player's entry to the scoreboard.
    box.appendChild(span);
  });
}

// Shows the appropriate button for the current game phase.
function renderButtons() {
  let html = "";

  // During aiming, the player can lock in their target.
  if (phase === "aim") html = '<button class="go" data-act="lock">LOCK IN</button>';

  // After the result, eligible players can request the next round.
  if (phase === "result" && needsNext) html = '<button class="go" data-act="next">NEXT ROUND</button>';

  // Replaces the existing buttons with the appropriate button or none.
  $("btns").innerHTML = html;
}

// Hides the lobby and displays the game area.
function showGame() {
  $("lobby").hidden = true;
  $("game").hidden = false;
}


// ---------- lobby buttons ----------

// When Create Room is clicked, sends the player's name and chosen room size.
// Number(...) converts the player-count input from text into a number.
$("create").onclick = () => socket.emit("create_room", {
  name: $("name").value,
  max_players: Number($("players").value),
});

// When Join Game is clicked, sends the player's name and room code.
$("join").onclick = () => socket.emit("join_game", {
  name: $("name").value,
  code: $("code").value
});

// Automatically converts the room code to uppercase as the user types.
$("code").addEventListener("input", (e) => {
  e.target.value = e.target.value.toUpperCase();
});


// ---------- actions ----------

// Submits the chosen target to the server.
function lock() {
  // A player can only lock a shot during the aiming phase.
  if (phase !== "aim") return;

  // Stops the player from locking in without choosing a target.
  if (!target) {
    setMsg("Click the arena to pick a target first!");
    return;
  }

  // Sends the target coordinates to the Python backend.
  // The server is responsible for validating and storing the secret target.
  socket.emit("submit_target", { x: target[0], y: target[1] });
}

// Requests the next round when the player is allowed to continue.
function next() {
  if (phase !== "result" || !needsNext) return;

  // Tells the server that this player is ready for the next round.
  socket.emit("ready_next");

  // Prevents repeatedly requesting the next round from this client.
  needsNext = false;

  // Updates the message and removes the next-round button.
  setMsg("Waiting for the other players...");
  renderButtons();
}

// Handles clicks on buttons inside the btns container.
// data-act tells us which action a button represents.
$("btns").addEventListener("click", (e) => {
  const act = e.target.dataset.act;

  if (act === "lock") lock();
  if (act === "next") next();
});

// Allows keyboard shortcuts for locking a shot or requesting the next round.
addEventListener("keydown", (e) => {
  const tag = document.activeElement.tagName;

  // Enter and Space work as shortcuts, except while typing in an input
  // or interacting with a button.
  if ((e.key === "Enter" || e.key === " ") &&
      tag !== "BUTTON" && tag !== "INPUT") {

    if (phase === "aim") lock();
    else if (phase === "result") next();

    // Prevents the browser's default action for that key.
    e.preventDefault();
  }
});


// ---------- cursor aiming ----------

// Converts a browser mouse/pointer position into arena coordinates.
function pos(e) {
  const r = cv.getBoundingClientRect();

  // Converts the pointer's screen position into the canvas's
  // internal 320 x 180 coordinate system.
  return [
    (e.clientX - r.left) / r.width * W,
    (e.clientY - r.top) / r.height * H
  ];
}

// Updates the stored mouse position as the pointer moves.
cv.addEventListener("pointermove", (e) => {
  mouse = pos(e);
});

// Stops showing the cursor marker when the pointer leaves the arena.
cv.addEventListener("pointerleave", () => {
  mouse = null;
});

// Selects a target when the player clicks the arena.
cv.addEventListener("pointerdown", (e) => {
  // Target selection is only allowed during aiming.
  if (phase !== "aim") return;

  // Saves the clicked coordinates as the laser target.
  target = pos(e);

  // Updates the cursor position so the marker matches the selected target.
  mouse = target;
});


// ---------- messages from the server ----------

// Runs when the server confirms that the player has joined a room.
socket.on("room_joined", (d) => {
  // Stores this player's assigned slot and the current game stage.
  slot = d.slot;
  phase = "waiting";

  // Displays the game and updates the interface.
  showGame();
  renderButtons();

  // Tells the player their room code so they can share it.
  setMsg(`Room ${d.code}. Share this code with the other players!`);
});

// Runs when the server sends updated lobby information.
socket.on("lobby_update", (d) => {
  // Updates the maximum number of players allowed in this room.
  maxPlayers = d.max_players;

  // Creates a placeholder name for every possible player slot.
  names = Array.from({ length: maxPlayers }, (_, i) => `P${i + 1}`);

  // Replaces placeholders with the names of players who have joined.
  d.players.forEach((p) => {
    names[p.slot] = p.name;
  });

  // Resizes the score array if the room's player count has changed.
  if (wins.length !== maxPlayers) wins = new Array(maxPlayers).fill(0);

  renderScore();

  // If the server says the room is waiting, reset the client for the lobby.
  // This can happen while the room is filling up or after someone leaves.
  if (phase !== "lobby" && d.phase === "waiting") {
    phase = "waiting";
    myPos = null;
    reveal = null;
    needsNext = false;

    // Resets the displayed scores for the waiting room.
    wins = new Array(maxPlayers).fill(0);

    renderScore();
    renderButtons();

    // Shows how many players have joined so far.
    setMsg(`Room ${d.code}: ${d.players.length}/${maxPlayers} players. Share the code!`);
  }
});

// Runs when the server starts a new round for this player.
socket.on("round_start", (d) => {
  // Stores this player's slot, alive status, and current scores.
  slot = d.slot;
  isAlive = d.alive;
  wins = d.wins;

  // Clears the previous target, reveal, and explosion effects.
  target = null;
  reveal = null;
  parts = [];
  needsNext = false;

  renderScore();

  if (d.alive) {
    // Living players can aim and submit a shot.
    phase = "aim";
    myPos = [d.x, d.y];

    setMsg(`Round ${d.round}: ${d.alive_count} players left. Click to aim, then lock in!`);
  } else {
    // Eliminated players watch the round instead of aiming.
    phase = "spectate";
    myPos = null;

    setMsg(`You are out! Watching round ${d.round}...`);
  }

  renderButtons();
});

// Runs when the server confirms that this player's shot has been locked in.
socket.on("target_locked", () => {
  phase = "locked";
  renderButtons();
  setMsg("Locked in! Waiting for the others...");
});

// Updates the player with the number of shots that have been submitted.
socket.on("lock_count", (d) => {
  if (phase === "aim") {
    setMsg(`${d.locked}/${d.total} locked in. Click to aim, then lock in!`);
  } else if (phase === "locked") {
    setMsg(`Locked in! ${d.locked}/${d.total} ready...`);
  } else if (phase === "spectate") {
    setMsg(`Watching... ${d.locked}/${d.total} locked in.`);
  }
});

// Runs when the server reveals the submitted shots and round results.
socket.on("reveal", (d) => {
  // Stores the revealed information for the animation.
  reveal = d;
  pendingWins = d.wins;

  // Starts the laser animation.
  phase = "fire";
  t0 = performance.now();
  resolved = false;

  // Resets each player's local animation state.
  d.players.forEach((p) => {
    p.dead = false;
  });

  renderButtons();
  setMsg("FIRE!");
});

// Displays a message when a player leaves the room.
socket.on("player_left", () => {
  setMsg("A player left the room.");
});

// Displays errors sent by the server.
socket.on("error_msg", (d) => {
  if (phase === "lobby") {
    $("lobbyErr").textContent = d.message;
  } else {
    setMsg(d.message);
  }
});


// ---------- drawing ----------

// Draws the pixel-art sprite at a given position.
function sprite(x, y, body, bob) {
  // Loops through every row of the sprite pattern.
  SPR.forEach((row, r) => {

    // Loops through every character in that row.
    [...row].forEach((ch, c) => {
      // Dots are transparent, so nothing is drawn for them.
      if (ch === ".") return;

      // Chooses the color based on the sprite character.
      ctx.fillStyle = ch === "X" ? body : ch === "W" ? "#fff" : "#14062e";

      // Draws one 2 x 2 pixel square.
      // x and y are the sprite's centre; c and r select a pixel.
      // bob adds a tiny vertical movement for animation.
      ctx.fillRect(
        Math.round(x - 8 + c * 2),
        Math.round(y - 8 + r * 2 + bob),
        2,
        2
      );
    });
  });
}

// Draws a player's shadow and animated sprite.
function drawPlayer(x, y, s, now) {
  // Draws a small shadow below the player.
  ctx.fillStyle = "rgba(0,0,0,.35)";
  ctx.fillRect(x - 7, y + 8, 14, 3);

  // Draws the sprite using the color for that player's slot.
  // Math.sin creates a gentle up-and-down bobbing animation.
  sprite(
    x,
    y,
    COLORS[s % COLORS.length].body,
    Math.round(Math.sin(now / 220 + s * 2))
  );
}

// Draws the tiled arena floor and its border.
function floor() {
  // Loops over the arena's columns and rows.
  for (let x = 0; x < W / TILE; x++) {
    for (let y = 0; y < H / TILE; y++) {

      // Alternates between two colors to create a checkerboard floor.
      ctx.fillStyle = (x + y) % 2 ? "#2d1557" : "#241046";

      // Draws one square floor tile.
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    }
  }

  // Draws the glowing border around the arena.
  ctx.strokeStyle = "#ff4fd8";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);
}

// Draws a small square marking the selected target.
function mark(tx, ty, s) {
  // Uses the player's laser color for the target marker.
  ctx.strokeStyle = COLORS[s % COLORS.length].beam;
  ctx.lineWidth = 1;

  // Draws a 6 x 6 outline centred on the target coordinates.
  ctx.strokeRect(Math.round(tx) - 3, Math.round(ty) - 3, 6, 6);
}

// Draws a cross-shaped cursor at the current mouse position.
function cross(x, y, c) {
  ctx.fillStyle = c;

  // Draws the four short arms of the cross.
  ctx.fillRect(x - 7, y, 4, 1);
  ctx.fillRect(x + 4, y, 4, 1);
  ctx.fillRect(x, y - 7, 1, 4);
  ctx.fillRect(x, y + 4, 1, 4);
}

// Draws all players' laser beams during the reveal animation.
function beams(el) {
  // Controls how far each laser has travelled.
  // It grows from 0 to 1 over 350 milliseconds.
  const grow = Math.min(1, el / 350);

  // Draws a beam for every player whose shot was revealed.
  reveal.players.forEach((p) => {
    // Calculates the direction from the player's position to their target.
    const dx = p.tx - p.x;
    const dy = p.ty - p.y;

    // Calculates the straight-line distance to the target.
    // || 1 avoids division by zero if the coordinates are identical.
    const L = Math.hypot(dx, dy) || 1;

    // Calculates the current end of the growing laser beam.
    const len = L * grow;
    const x1 = p.x + dx / L * len;
    const y1 = p.y + dy / L * len;

    // Chooses the beam color for the shooting player.
    const c = COLORS[p.slot % COLORS.length].beam;

    // Saves drawing settings so they can be restored afterwards.
    ctx.save();

    // Draws the glowing colored outer beam.
    ctx.shadowColor = c;
    ctx.shadowBlur = 14;
    ctx.strokeStyle = c;
    ctx.lineWidth = 4 + Math.random();

    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    // Draws a thin white line inside the colored beam.
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    // Restores the previous drawing settings.
    ctx.restore();
  });
}

// Creates explosion particles when a player is hit.
function boom(p) {
  // Creates 36 particles starting at the eliminated player's position.
  for (let i = 0; i < 36; i++) {
    parts.push({
      x: p.x,
      y: p.y,

      // Gives each particle a slightly different direction.
      vx: (Math.random() - .5) * 3.5,
      vy: (Math.random() - .5) * 3.5,

      // Mostly uses the player's color, with some white particles.
      c: i % 3 ? COLORS[p.slot % COLORS.length].body : "#fff",

      // l represents the particle's remaining life.
      l: 1
    });
  }

  // Starts the screen-shake effect.
  shake = 7;
}

// Finishes the laser animation and displays the round result.
function finish() {
  phase = "result";

  // Updates scores with the values sent by the server.
  wins = pendingWins;
  renderScore();

  // Collects the slot numbers of all players hit in this round.
  const hitSlots = reveal.players
    .filter((p) => p.hit)
    .map((p) => p.slot);

  // Checks whether this player's slot appears among the hit players.
  const iWasHit = hitSlots.includes(slot);

  // Updates this client's alive status if the player was hit.
  if (iWasHit) isAlive = false;

  let text;

  // Displays the overall match outcome if the match has ended.
  if (reveal.match_over) {
    if (reveal.winner === null) {
      text = "EVERYONE FELL! Nobody wins this match.";
    } else if (reveal.winner === slot) {
      text = "YOU WIN THE MATCH!";
    } else {
      text = `${names[reveal.winner]} WINS THE MATCH!`;
    }
  } else if (hitSlots.length === 0) {
    // No players were hit, so the surviving players continue.
    text = "EVERYONE MISSED! Survivors shuffle a little.";
  } else {
    // Displays how many players were eliminated and how many remain.
    text = `${hitSlots.length} knocked out, ${reveal.alive_count} left.`;
  }

  // Adds a personal message if this player was hit.
  if (iWasHit) text = "YOU GOT HIT! " + text;

  // Players still alive can request the next round.
  // If the match ended, the interface also allows the next-match flow.
  needsNext = reveal.match_over || isAlive;

  setMsg(text);
  renderButtons();
}


// ---------- main animation loop ----------

// Runs repeatedly to redraw the arena and animate the game.
function loop(now) {
  // Saves the current drawing settings before applying effects.
  ctx.save();

  // Applies a small random screen movement while the arena is shaking.
  if (shake > .3) {
    ctx.translate(
      (Math.random() - .5) * shake,
      (Math.random() - .5) * shake
    );

    // Gradually reduces the shake strength.
    shake *= .9;
  }

  // Redraws the floor at the beginning of each frame.
  floor();

  // During aiming or after locking, only draw this player's position.
  // This keeps opponents' positions hidden until the reveal.
  if ((phase === "aim" || phase === "locked") && myPos) {
    drawPlayer(myPos[0], myPos[1], slot, now);

    // Shows the selected target marker, if one exists.
    if (target) mark(target[0], target[1], slot);

    // Shows the moving cursor while the player is aiming.
    if (phase === "aim" && mouse) {
      cross(
        Math.round(mouse[0]),
        Math.round(mouse[1]),
        COLORS[slot % COLORS.length].beam
      );
    }

  // Once shots are revealed, draw the players and laser effects.
  } else if ((phase === "fire" || phase === "result") && reveal) {
    // During firing, elapsed time controls the laser animation.
    // Afterwards, use a large value so the beams are fully extended.
    const el = phase === "fire" ? now - t0 : 9999;

    // Draws each player's sprite and target marker.
    reveal.players.forEach((p) => {
      if (!p.dead) drawPlayer(p.x, p.y, p.slot, now);
      mark(p.tx, p.ty, p.slot);
    });

    // Animates all the laser beams.
    beams(el);

    // Draws surviving sprites again so they appear above the beams.
    reveal.players.forEach((p) => {
      if (!p.dead) drawPlayer(p.x, p.y, p.slot, now);
    });

    // After 450 ms, processes hits and creates explosions once.
    if (phase === "fire" && el > 450 && !resolved) {
      resolved = true;

      reveal.players.forEach((p) => {
        if (p.hit) {
          p.dead = true;
          boom(p);
        }
      });
    }

    // After 1.7 seconds, finish the animation and show the result.
    if (phase === "fire" && el > 1700) finish();
  }

  // Updates and draws every explosion particle.
  parts.forEach((q) => {
    q.x += q.vx;
    q.y += q.vy;

    // Adds a small downward acceleration, like gravity.
    q.vy += .05;

    // Gradually fades the particle.
    q.l -= .014;

    ctx.fillStyle = q.c;
    ctx.globalAlpha = Math.max(0, q.l);

    // The | 0 operation converts the position to an integer.
    ctx.fillRect(q.x | 0, q.y | 0, 2, 2);
  });

  // Restores full opacity after drawing translucent particles.
  ctx.globalAlpha = 1;

  // Removes particles whose life has run out.
  parts = parts.filter((q) => q.l > 0);

  // Restores the drawing settings saved at the beginning of this frame.
  ctx.restore();

  // Requests another animation frame, keeping the game running smoothly.
  requestAnimationFrame(loop);
}


// ---------- start the frontend ----------

// Draws the initial scoreboard.
renderScore();

// Starts the repeating animation loop.
requestAnimationFrame(loop);
