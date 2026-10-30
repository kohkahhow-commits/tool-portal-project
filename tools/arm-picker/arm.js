// Robot Arm Picker: a 2D side view of a two-joint arm that picks up a block
// and drops it in a bin. All world measurements are in cm, with the arm's
// base at (0, 0) on the floor and y pointing up.
(function () {
  var L1 = 12; // upper arm length
  var L2 = 9; // forearm length
  var T1_MIN = 0, T1_MAX = 180; // shoulder limits (degrees)
  var T2_MIN = -160, T2_MAX = 160; // elbow limits (degrees)
  var BLOCK = 2; // block side length
  var BIN_W = 6, BIN_H = 3; // bin width and wall height
  var GRAB_DIST = 1.5; // how close the tip must be to the top of the block
  var START = { t1: 90, t2: -90 };
  // The elbow can't fold flat, so the tip can't get all the way back to the base.
  var MIN_REACH = Math.sqrt(L1 * L1 + L2 * L2 + 2 * L1 * L2 * Math.cos(T2_MAX * Math.PI / 180));
  // Floor positions where the block can always be picked up.
  var BLOCK_MIN_X = 6, BLOCK_MAX_X = 18;

  // Visible part of the world: x from -23 to 23, y from -2 to 23.
  var VIEW = { left: -23, right: 23, top: 23, bottom: -2 };

  var state = {
    t1: START.t1,
    t2: START.t2,
    mode: "sliders",
    gripping: false,
    placed: false,
    block: { x: 10, y: 0 }, // x = center, y = bottom
    bin: { x: -12 },
    target: null // last clicked point in click-target mode
  };

  var canvas, ctx, colors = {}, animation = null;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function $(id) { return document.getElementById(id); }
  function rad(deg) { return deg * Math.PI / 180; }
  function deg(r) { return r * 180 / Math.PI; }

  // Forward kinematics: joint angles -> elbow and tip positions.
  function forward(t1, t2) {
    var a = rad(t1), b = rad(t1 + t2);
    var elbow = { x: L1 * Math.cos(a), y: L1 * Math.sin(a) };
    return {
      elbow: elbow,
      tip: { x: elbow.x + L2 * Math.cos(b), y: elbow.y + L2 * Math.sin(b) }
    };
  }

  // Inverse kinematics: tip position -> joint angles, or an error message.
  // Uses the law of cosines; prefers the solution with the higher elbow.
  function inverse(x, y) {
    var d = Math.hypot(x, y);
    if (y < 0) return { error: "That point is below the floor. Pick a spot above it." };
    if (d > L1 + L2 + 1e-9) return { error: "Too far — the arm can reach at most " + (L1 + L2) + " cm from its base." };
    if (d < MIN_REACH) return { error: "Too close — the elbow can't fold enough to bring the tip nearer than " + MIN_REACH.toFixed(1) + " cm to the base." };

    var c = (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2);
    c = Math.max(-1, Math.min(1, c));
    var bend = deg(Math.acos(c));
    var options = [bend, -bend].map(function (t2) {
      var t1 = deg(Math.atan2(y, x) - Math.atan2(L2 * Math.sin(rad(t2)), L1 + L2 * Math.cos(rad(t2))));
      if (t1 < -180) t1 += 360;
      if (t1 > 180) t1 -= 360;
      return { t1: t1, t2: t2 };
    }).filter(function (s) {
      return s.t1 >= T1_MIN - 1e-6 && s.t1 <= T1_MAX + 1e-6 && s.t2 >= T2_MIN && s.t2 <= T2_MAX;
    });
    if (!options.length) return { error: "The joints can't bend far enough to reach that point." };
    options.sort(function (p, q) { return Math.sin(rad(q.t1)) - Math.sin(rad(p.t1)); });
    var best = options[0];
    best.t1 = Math.max(T1_MIN, Math.min(T1_MAX, best.t1));
    return best;
  }

  function randomBetween(min, max) { return min + Math.random() * (max - min); }
  function randomSide(min, max) { return (Math.random() < 0.5 ? -1 : 1) * randomBetween(min, max); }

  function newRound() {
    var block, bin;
    do {
      block = randomSide(BLOCK_MIN_X, BLOCK_MAX_X);
      bin = randomSide(6, 16);
    } while (Math.abs(block - bin) < BLOCK / 2 + BIN_W / 2 + 5);
    setLayout(block, bin);
    setStatus("New round: grab the block and drop it in the bin.", "");
  }

  function setLayout(blockX, binX) {
    stopAnimation();
    state.block = { x: blockX, y: 0 };
    state.bin = { x: binX };
    state.gripping = false;
    state.placed = false;
    state.target = null;
    state.t1 = START.t1;
    state.t2 = START.t2;
    update();
  }

  // While gripped, the block hangs from the tip.
  function attachBlock() {
    if (!state.gripping) return;
    var tip = forward(state.t1, state.t2).tip;
    state.block.x = tip.x;
    state.block.y = tip.y - BLOCK;
  }

  function grip() {
    if (state.gripping) return release();
    var tip = forward(state.t1, state.t2).tip;
    var dist = Math.hypot(tip.x - state.block.x, tip.y - (state.block.y + BLOCK));
    if (dist > GRAB_DIST) {
      setStatus("Nothing to grab here — move the tip closer to the top of the block.", "warn");
      return;
    }
    state.gripping = true;
    state.placed = false;
    attachBlock();
    setStatus("Got it! Now move the block over the bin and release.", "ok");
    update();
  }

  function release() {
    state.gripping = false;
    var dx = state.block.x - state.bin.x;
    var inside = Math.abs(dx) <= BIN_W / 2 - BLOCK / 2;
    var touchesBin = Math.abs(dx) < BIN_W / 2 + BLOCK / 2;
    if (inside) {
      state.block.y = 0;
      state.placed = true;
      setStatus("Placed! ✓ Press New round to try again.", "ok");
    } else {
      state.block.x = landingSpot(state.block.x);
      state.block.y = 0;
      if (touchesBin) setStatus("The block hit the edge of the bin and fell outside. Try again.", "warn");
      else setStatus("The block fell to the floor. Grab it again.", "");
    }
    update();
  }

  // Where a dropped block ends up on the floor: always somewhere the arm can
  // reach again, and never on top of the bin.
  function landingSpot(x) {
    var side = Math.sign(x) || 1;
    x = side * Math.min(BLOCK_MAX_X, Math.max(BLOCK_MIN_X, Math.abs(x)));
    var clear = BIN_W / 2 + BLOCK / 2 + 0.2;
    if (Math.abs(x - state.bin.x) >= clear) return x;
    return [state.bin.x - clear, state.bin.x + clear]
      .filter(function (c) { return Math.abs(c) >= BLOCK_MIN_X && Math.abs(c) <= BLOCK_MAX_X; })
      .sort(function (a, b) { return Math.abs(a - x) - Math.abs(b - x); })[0];
  }

  function setAngles(t1, t2) {
    state.t1 = t1;
    state.t2 = t2;
    attachBlock();
    update();
  }

  function moveTo(target) {
    stopAnimation();
    if (reduceMotion) return setAngles(target.t1, target.t2);
    var from = { t1: state.t1, t2: state.t2 };
    var startTime = null;
    function step(now) {
      if (startTime === null) startTime = now;
      var p = Math.min(1, (now - startTime) / 600);
      var e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // ease in-out
      setAngles(from.t1 + (target.t1 - from.t1) * e, from.t2 + (target.t2 - from.t2) * e);
      animation = p < 1 ? requestAnimationFrame(step) : null;
    }
    animation = requestAnimationFrame(step);
  }

  function stopAnimation() {
    if (animation !== null) cancelAnimationFrame(animation);
    animation = null;
  }

  function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll(".mode-switch button").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
    });
    $("slider-controls").hidden = mode !== "sliders";
    $("target-hint").hidden = mode !== "target";
    document.querySelectorAll(".how-it-works [data-for]").forEach(function (el) {
      el.hidden = el.dataset.for !== mode;
    });
    canvas.classList.toggle("clickable", mode === "target");
    if (mode === "sliders") state.target = null;
    update();
  }

  function setStatus(text, kind) {
    var el = $("status");
    el.textContent = text;
    el.className = "status" + (kind ? " " + kind : "");
  }

  // Number formatting: one decimal place, with a real minus sign.
  function fmt(n) {
    var s = (Math.abs(n) < 0.05 ? 0 : n).toFixed(1);
    return s.replace("-", "−");
  }

  function update() {
    var pos = forward(state.t1, state.t2);
    var tip = pos.tip;

    $("theta1").value = Math.round(state.t1);
    $("theta2").value = Math.round(state.t2);
    $("theta1-value").textContent = fmt(state.t1) + "°";
    $("theta2-value").textContent = fmt(state.t2) + "°";
    $("out-theta1").textContent = fmt(state.t1) + "°";
    $("out-theta2").textContent = fmt(state.t2) + "°";
    $("out-x").textContent = fmt(tip.x) + " cm";
    $("out-y").textContent = fmt(tip.y) + " cm";
    $("out-grip").textContent = state.gripping ? "Closed (holding the block)" : "Open";
    $("grip").textContent = state.gripping ? "Release" : "Grip";

    var a = fmt(state.t1) + "°", b = "(" + fmt(state.t2) + "°)";
    $("formula-x").textContent = "x = 12·cos(" + a + ") + 9·cos(" + a + " + " + b + ") = " + fmt(tip.x);
    $("formula-y").textContent = "y = 12·sin(" + a + ") + 9·sin(" + a + " + " + b + ") = " + fmt(tip.y);

    var warning = "";
    if (tip.y < 0) warning = "The tip is below the floor — a real arm would crash here.";
    else if (state.gripping && state.block.y < 0) warning = "The block is going through the floor — lift the arm up.";
    $("floor-warning").textContent = warning;
    $("floor-warning").hidden = !warning;

    draw(pos);
  }

  // ---- Drawing ----

  function readColors() {
    var css = getComputedStyle(document.documentElement);
    ["--arm", "--block", "--bin", "--grid", "--warn", "--ok", "--text", "--text-muted", "--focus", "--surface"].forEach(function (name) {
      colors[name] = css.getPropertyValue(name).trim();
    });
  }

  function resizeCanvas() {
    var ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvas.clientWidth * ratio);
    canvas.height = Math.round(canvas.clientHeight * ratio);
    update();
  }

  function scale() { return canvas.width / (VIEW.right - VIEW.left); }
  function toPx(p) {
    var s = scale();
    return { x: (p.x - VIEW.left) * s, y: (VIEW.top - p.y) * s };
  }
  function fromPx(px, py) {
    var s = scale();
    return { x: px / s + VIEW.left, y: VIEW.top - py / s };
  }

  function line(a, b, color, width) {
    var p = toPx(a), q = toPx(b);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
  }

  function dot(c, radiusCm, color) {
    var p = toPx(c);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radiusCm * scale(), 0, Math.PI * 2);
    ctx.fill();
  }

  function draw(pos) {
    if (!ctx || !canvas.width) return;
    var s = scale();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Grid every 5 cm
    for (var gx = -20; gx <= 20; gx += 5) line({ x: gx, y: 0 }, { x: gx, y: VIEW.top }, colors["--grid"], 1);
    for (var gy = 5; gy <= 20; gy += 5) line({ x: VIEW.left, y: gy }, { x: VIEW.right, y: gy }, colors["--grid"], 1);

    // Reach circle (dashed)
    var base = toPx({ x: 0, y: 0 });
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = colors["--text-muted"];
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(base.x, base.y, (L1 + L2) * s, Math.PI, 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);

    // Floor
    line({ x: VIEW.left, y: 0 }, { x: VIEW.right, y: 0 }, colors["--text"], 2);

    // Bin: a U shape
    var bx = state.bin.x, hw = BIN_W / 2;
    var w = Math.max(2, 0.35 * s);
    line({ x: bx - hw, y: BIN_H }, { x: bx - hw, y: 0 }, colors["--bin"], w);
    line({ x: bx - hw, y: 0 }, { x: bx + hw, y: 0 }, colors["--bin"], w);
    line({ x: bx + hw, y: 0 }, { x: bx + hw, y: BIN_H }, colors["--bin"], w);

    // Block
    var bl = toPx({ x: state.block.x - BLOCK / 2, y: state.block.y + BLOCK });
    ctx.fillStyle = colors["--block"];
    ctx.fillRect(bl.x, bl.y, BLOCK * s, BLOCK * s);

    // Click target marker
    if (state.target) {
      var t = state.target, r = 0.8;
      line({ x: t.x - r, y: t.y }, { x: t.x + r, y: t.y }, colors["--focus"], 2);
      line({ x: t.x, y: t.y - r }, { x: t.x, y: t.y + r }, colors["--focus"], 2);
    }

    // Arm
    var armColor = pos.tip.y < 0 ? colors["--warn"] : colors["--arm"];
    var armWidth = Math.max(5, 1.1 * s);
    line({ x: 0, y: 0 }, pos.elbow, armColor, armWidth);
    line(pos.elbow, pos.tip, armColor, armWidth);
    dot({ x: 0, y: 0 }, 0.9, armColor);
    // Elbow: a hollow ring
    var e = toPx(pos.elbow);
    ctx.fillStyle = colors["--surface"];
    ctx.strokeStyle = armColor;
    ctx.lineWidth = Math.max(2, 0.3 * s);
    ctx.beginPath();
    ctx.arc(e.x, e.y, 0.7 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Gripper: two fingers hanging from the tip, open or closed
    var tip = pos.tip, spread = state.gripping ? BLOCK / 2 + 0.15 : BLOCK / 2 + 0.6;
    var fw = Math.max(2, 0.25 * s);
    line({ x: tip.x - spread, y: tip.y }, { x: tip.x + spread, y: tip.y }, armColor, fw);
    line({ x: tip.x - spread, y: tip.y }, { x: tip.x - spread, y: tip.y - 1.2 }, armColor, fw);
    line({ x: tip.x + spread, y: tip.y }, { x: tip.x + spread, y: tip.y - 1.2 }, armColor, fw);
  }

  // ---- Setup ----

  function onCanvasPointer(e) {
    if (state.mode !== "target") return;
    // Measure from inside the canvas border, where the drawing starts.
    var rect = canvas.getBoundingClientRect();
    var ratio = canvas.width / canvas.clientWidth;
    var px = e.clientX - rect.left - canvas.clientLeft;
    var py = e.clientY - rect.top - canvas.clientTop;
    var p = fromPx(px * ratio, py * ratio);
    state.target = p;
    var result = inverse(p.x, p.y);
    if (result.error) {
      setStatus(result.error, "warn");
      update();
      return;
    }
    setStatus("Moving the tip to (" + fmt(p.x) + ", " + fmt(p.y) + ") cm: θ1 = " + fmt(result.t1) + "°, θ2 = " + fmt(result.t2) + "°.", "");
    moveTo(result);
  }

  document.addEventListener("DOMContentLoaded", function () {
    canvas = $("arm-canvas");
    ctx = canvas.getContext("2d");
    readColors();

    $("theta1").addEventListener("input", function (e) { stopAnimation(); setAngles(Number(e.target.value), state.t2); });
    $("theta2").addEventListener("input", function (e) { stopAnimation(); setAngles(state.t1, Number(e.target.value)); });
    $("grip").addEventListener("click", grip);
    $("new-round").addEventListener("click", newRound);
    document.querySelectorAll(".mode-switch button").forEach(function (b) {
      b.addEventListener("click", function () { setMode(b.dataset.mode); });
    });
    canvas.addEventListener("pointerdown", onCanvasPointer);

    // Redraw when the theme changes or the canvas changes size.
    new MutationObserver(function () { readColors(); update(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    new ResizeObserver(resizeCanvas).observe(canvas);

    newRound();
  });

  // Small hook for automated tests: read the state or set a fixed layout.
  window.armPicker = { state: state, setLayout: setLayout, forward: forward, inverse: inverse };
})();
