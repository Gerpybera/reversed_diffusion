const cursorCanvas = document.createElement("canvas");
const cursorContext = cursorCanvas.getContext("2d");

cursorCanvas.width = window.innerWidth;
cursorCanvas.height = window.innerHeight;
cursorCanvas.id = "cursor-canvas";

cursorCanvas.style.position = "fixed";
cursorCanvas.style.top = "0";
cursorCanvas.style.left = "0";
cursorCanvas.style.width = "100vw";
cursorCanvas.style.height = "100vh";
cursorCanvas.style.pointerEvents = "none";
cursorCanvas.style.zIndex = "2147483647";

document.body.appendChild(cursorCanvas);

let isLineLong = false;
let isOverButton = false;
let isInGeneratedCanvas = false;
let isOverPing = false;

let expansionProgress = 0;
let isExpanding = false;
let lastCursorX = 0;
let lastCursorY = 0;
const expansionDuration = 200; // milliseconds for full expansion
let expansionStartTime = 0;
let animationFrameId = null;

let displayDesign = true; // This variable is declared but not used in the provided code snippet. It may be used elsewhere in the application.

function updateLineMode() {
  const wasLineLong = isLineLong;
  isLineLong = isOverButton || isInGeneratedCanvas || isOverPing;

  // Trigger expansion animation when transitioning from short to long
  if (isLineLong && !wasLineLong) {
    isExpanding = true;
    expansionStartTime = Date.now();
    expansionProgress = 0;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animateExpansion();
  }
}

function animateExpansion() {
  const elapsed = Date.now() - expansionStartTime;
  expansionProgress = Math.min(elapsed / expansionDuration, 1);

  drawCursor(lastCursorX, lastCursorY);

  if (expansionProgress < 1) {
    animationFrameId = requestAnimationFrame(animateExpansion);
  } else {
    isExpanding = false;
  }
}

function drawCursor(x, y) {
  lastCursorX = x;
  lastCursorY = y;

  cursorContext.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
  cursorContext.lineWidth = 0.5;
  cursorContext.strokeStyle = "rgba(255, 255, 255, 1)";

  if (isLineLong) {
    const progress = isExpanding ? expansionProgress : 1;

    // Horizontal line expanding
    cursorContext.beginPath();
    const expandedLeft = x - x * progress;
    const expandedRight = x + (cursorCanvas.width - x) * progress;
    cursorContext.moveTo(expandedLeft, y);
    cursorContext.lineTo(expandedRight, y);

    // Vertical line expanding
    const expandedTop = y - y * progress;
    const expandedBottom = y + (cursorCanvas.height - y) * progress;
    cursorContext.moveTo(x, expandedTop);
    cursorContext.lineTo(x, expandedBottom);

    cursorContext.stroke();
  } else {
    cursorContext.beginPath();
    cursorContext.moveTo(x - 10, y);
    cursorContext.lineTo(x - 10, y);
    cursorContext.lineTo(x + 10, y);
    cursorContext.moveTo(x, y - 10);
    cursorContext.lineTo(x, y + 10);
    cursorContext.stroke();
  }

  cursorContext.lineWidth = 2;
  cursorContext.beginPath();
  cursorContext.moveTo(x - 10, y);
  cursorContext.lineTo(x - 10, y);
  cursorContext.lineTo(x + 10, y);
  cursorContext.moveTo(x, y - 10);
  cursorContext.lineTo(x, y + 10);
  cursorContext.stroke();

  addCorner(cursorCanvas.width * 0.01, cursorCanvas.height * 0.01, 25, 180);
  addCorner(cursorCanvas.width * 0.99, cursorCanvas.height * 0.01, 25, 270);
  addCorner(cursorCanvas.width * 0.01, cursorCanvas.height * 0.9, 25, 90);
  addCorner(cursorCanvas.width * 0.99, cursorCanvas.height * 0.9, 25, 0);
}

window.addEventListener("mousemove", (event) => {
  const hoveredElement = document.elementFromPoint(
    event.clientX,
    event.clientY,
  );
  isOverButton = Boolean(hoveredElement?.closest?.("button"));
  updateLineMode();
  drawCursor(event.clientX, event.clientY);

  // If we're currently expanding and user moves, update the animation from the new position
  if (isExpanding) {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animationFrameId = requestAnimationFrame(animateExpansion);
  }
});

window.addEventListener("mouseleave", () => {
  isOverButton = false;
  isOverPing = false;
  updateLineMode();
});

window.addEventListener("generated-canvas-opened", () => {
  isInGeneratedCanvas = true;
  updateLineMode();
});

window.addEventListener("generated-canvas-closed", () => {
  isInGeneratedCanvas = false;
  updateLineMode();
});

window.addEventListener("ping-hover-changed", (event) => {
  isOverPing = Boolean(event.detail?.isHovering);
  updateLineMode();
});

window.addEventListener("resize", () => {
  cursorCanvas.width = window.innerWidth;
  cursorCanvas.height = window.innerHeight;
  drawCursor(lastCursorX, lastCursorY);
});

function addCorner(x, y, size = 10, rotation = 0) {
  cursorContext.save();
  cursorContext.lineWidth = 2;
  cursorContext.translate(x, y);
  cursorContext.rotate(rotation * (Math.PI / 180));
  cursorContext.beginPath();
  cursorContext.moveTo(-size, 0);
  cursorContext.lineTo(0, 0);
  cursorContext.lineTo(0, -size);
  cursorContext.stroke();
  cursorContext.restore();
}
