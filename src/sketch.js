//Exemple de Mattieu
import p5 from "p5";
import { runComfy } from "./api";

const SIZE = 512;
const DIAMETER = SIZE * 0.2;
const RADIUS = DIAMETER / 2;
const DEFAULT_PROMPT = "Sun in sky simple landscape";

export function createSketch(container) {
  return new p5((p) => {
    let rendering = false;
    let loopEnabled = false;
    let seed = Math.floor(Math.random() * 2 ** 32);

    let x = SIZE / 2;
    let y = SIZE / 2;

    let dragging = false;
    let moved = false;
    let offsetX = 0;
    let offsetY = 0;

    let bgLayer;
    let maskLayer;

    let promptEl;
    let loopEl;
    let shuffleEl;

    async function render() {
      if (rendering) return;
      rendering = true;

      const prompt = promptEl?.value?.trim() || DEFAULT_PROMPT;

      const result = await runComfy(
        maskLayer.elt.toDataURL("image/png"),
        prompt,
        seed,
      );

      if (result?.ok && result.firstImage) {
        const img = await new Promise((resolve) => {
          p.loadImage(result.firstImage, resolve, () => resolve(null));
        });

        if (img) {
          bgLayer.clear();
          bgLayer.image(img, 0, 0, SIZE, SIZE);
        }
      }

      rendering = false;

      if (loopEnabled) {
        setTimeout(render, 150);
      }
    }

    p.setup = () => {
      p.createCanvas(SIZE, SIZE).parent(container);

      bgLayer = p.createGraphics(SIZE, SIZE);
      maskLayer = p.createGraphics(SIZE, SIZE);

      promptEl = document.getElementById("prompt");
      loopEl = document.getElementById("loop-realtime");
      shuffleEl = document.getElementById("shuffle-seed");

      if (promptEl) {
        promptEl.placeholder = DEFAULT_PROMPT;
        promptEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !rendering) render();
        });
      }

      if (loopEl) {
        loopEl.addEventListener("change", () => {
          loopEnabled = loopEl.checked;
          if (loopEnabled && !rendering) render();
        });
      }

      if (shuffleEl) {
        shuffleEl.addEventListener("click", () => {
          seed = Math.floor(Math.random() * 2 ** 32);
          if (!rendering) render();
        });
      }
    };

    p.draw = () => {
      p.background(0);
      p.image(bgLayer, 0, 0);

      // Masquer cette ligne pour dessin continu
      maskLayer.clear();
      maskLayer.noStroke();
      maskLayer.fill(
        255,
        rendering ? 180 + Math.sin(p.millis() * 0.005) * 75 : 255,
      );
      maskLayer.ellipse(x, y, DIAMETER, DIAMETER);

      p.image(maskLayer, 0, 0);
    };

    p.mousePressed = () => {
      const dx = p.mouseX - x;
      const dy = p.mouseY - y;
      const insideCircle = dx * dx + dy * dy <= RADIUS * RADIUS;

      moved = false;
      if (!insideCircle) return;

      maskLayer.clear();

      dragging = true;
      offsetX = p.mouseX - x;
      offsetY = p.mouseY - y;
    };

    p.mouseDragged = () => {
      if (!dragging) return;

      x = p.constrain(p.mouseX - offsetX, RADIUS, p.width - RADIUS);
      y = p.constrain(p.mouseY - offsetY, RADIUS, p.height - RADIUS);
      moved = true;
    };

    p.mouseReleased = () => {
      if (!dragging) return;

      dragging = false;

      if (moved) {
        render();
      }
    };
  });
}
