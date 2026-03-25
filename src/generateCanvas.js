//import { runComfy } from "./api";
//import { createSketch } from "./sketch";
import render from "./render";
export default class generateCanvas {
  constructor(
    environnemental,
    info = null,
    revealOrigin = null,
    onBack = null,
    onFinish = null,
    autoReveal = true,
    finishedSnapshotDataUrl = null,
  ) {
    if (
      typeof info === "function" &&
      revealOrigin === null &&
      onBack === null
    ) {
      onBack = info;
      info = null;
    }

    if (typeof revealOrigin === "function" && onBack === null) {
      onBack = revealOrigin;
      revealOrigin = null;
    }

    this.environnemental = environnemental;
    this.info = info;
    this.revealOrigin = revealOrigin;
    this.onBack = onBack;
    this.onFinish = onFinish;
    this.autoReveal = autoReveal;
    this.finishedSnapshotDataUrl = finishedSnapshotDataUrl;
    this.finishedSnapshotImage = null;
    this.hasGeneratedImage = Boolean(finishedSnapshotDataUrl);
    this.transitionDuration = 200;
    this.isActive = true;
    this.isRevealStarted = false;
    this.frameId = null;
    this.renderInstance = null;
    this.opacity = 1;
    this.handleResize = () => this.resizeCanvas();

    this.earthCanvas = document.getElementById("canvas");
    this.previousEarthCanvasVisibility =
      this.earthCanvas?.style.visibility ?? "";
    this.previousEarthCanvasPointerEvents =
      this.earthCanvas?.style.pointerEvents ?? "";

    this.canvas = document.getElementById("generated-canvas");
    this.environmentPrompt = this.displayEnvironment(environnemental, info);
    this.img = new Image();
    this.img.onload = () => {
      if (this.autoReveal) {
        this.startReveal();
      }
    };
    this.img.onerror = () => {
      if (this.autoReveal) {
        this.startReveal();
      }
    };
    this.img.src = "data:,";

    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.canvas.id = "generated-canvas";
      this.canvas.style.position = "fixed";
      this.canvas.style.inset = "0";
      this.canvas.style.zIndex = "10000";
      this.canvas.style.pointerEvents = "none";
      this.canvas.style.opacity = "0";
      this.canvas.style.transformOrigin = "center center";
      document.body.appendChild(this.canvas);
    }

    this.canvas.style.transformOrigin = this.getTransformOrigin();

    this.backButton = document.getElementById("generated-canvas-back-button");
    if (!this.backButton) {
      this.backButton = document.createElement("button");
      this.backButton.id = "generated-canvas-back-button";
      this.backButton.textContent = "Back";
      document.body.appendChild(this.backButton);
    }
    this.finishButton = document.getElementById(
      "generated-canvas-finish-button",
    );
    if (!this.finishButton) {
      this.finishButton = document.createElement("button");
      this.finishButton.id = "generated-canvas-finish-button";
      this.finishButton.textContent = "Finish";
      document.body.appendChild(this.finishButton);
    }

    this.backButton.style.display = "none";
    this.finishButton.style.display = "none";

    this.backButton.onclick = () => {
      this.backButton.style.display = "none";
      this.finishButton.style.display = "none";
      if (typeof this.onBack === "function") {
        this.onBack();
      }
      this.toggleEarthCanvas(true);
      this.fadeOutCanvas(() => {
        this.dispose();
      });
    };
    this.finishButton.onclick = () => {
      this.backButton.style.display = "none";
      this.finishButton.style.display = "none";
      const snapshotDataUrl = this.captureSnapshot();
      if (typeof this.onFinish === "function") {
        this.onFinish(snapshotDataUrl);
      }
      if (typeof this.onBack === "function") {
        this.onBack();
      }
      this.toggleEarthCanvas(true);

      this.fadeOutCanvas(() => {
        this.dispose();
      });
    };

    this.ctx = this.canvas.getContext("2d");
    if (!this.ctx) {
      return;
    }
    this.resizeCanvas();
    this.draw();
    if (this.img.complete && this.autoReveal) {
      this.startReveal();
    }
    window.addEventListener("resize", this.handleResize);
    console.log(info);
  }
  captureSnapshot() {
    if (!this.canvas) {
      return null;
    }

    try {
      return this.canvas.toDataURL("image/png");
    } catch (error) {
      console.error("Failed to capture canvas snapshot:", error);
      return null;
    }
  }
  startReveal() {
    if (this.isRevealStarted) {
      return;
    }

    this.isRevealStarted = true;
    this.fadeInCanvas();
  }
  getTransformOrigin() {
    const xPercent = this.revealOrigin?.xPercent;
    const yPercent = this.revealOrigin?.yPercent;

    if (
      typeof xPercent !== "number" ||
      typeof yPercent !== "number" ||
      Number.isNaN(xPercent) ||
      Number.isNaN(yPercent)
    ) {
      return "center center";
    }

    const clampedX = Math.min(100, Math.max(0, xPercent));
    const clampedY = Math.min(100, Math.max(0, yPercent));
    return `${clampedX}% ${clampedY}%`;
  }
  fadeInCanvas() {
    if (!this.canvas) {
      return;
    }

    this.canvas.style.transition = `opacity ${this.transitionDuration}ms cubic-bezier(0.16, 1, 0.3, 1)`;
    this.canvas.style.opacity = "0";

    requestAnimationFrame(() => {
      this.canvas.style.opacity = "1";
    });

    window.setTimeout(() => {
      this.toggleEarthCanvas(false);
      this.updateButtonsVisibility();
    }, this.transitionDuration);
  }
  fadeOutCanvas(onComplete = null) {
    if (!this.canvas) {
      if (typeof onComplete === "function") {
        onComplete();
      }
      return;
    }

    this.canvas.style.transition = `opacity ${this.transitionDuration}ms cubic-bezier(0.16, 1, 0.3, 1)`;
    this.canvas.style.opacity = "0";

    window.setTimeout(() => {
      if (typeof onComplete === "function") {
        onComplete();
      }
    }, this.transitionDuration);
  }
  toggleEarthCanvas(isVisible) {
    if (!this.earthCanvas) {
      return;
    }

    if (isVisible) {
      if (this.backButton) {
        this.backButton.style.display = "none";
      }
      if (this.finishButton) {
        this.finishButton.style.display = "none";
      }
      this.earthCanvas.style.visibility = this.previousEarthCanvasVisibility;
      this.earthCanvas.style.pointerEvents =
        this.previousEarthCanvasPointerEvents;
      return;
    }

    this.updateButtonsVisibility();

    this.earthCanvas.style.visibility = "hidden";
    this.earthCanvas.style.pointerEvents = "none";
  }
  dispose() {
    this.isActive = false;
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
    this.renderInstance?.dispose?.();
    this.renderInstance = null;
    window.removeEventListener("resize", this.handleResize);
    this.canvas?.remove();
    this.backButton?.remove();
    this.finishButton?.remove();
  }
  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    if (this.finishedSnapshotImage) {
      this.drawFinishedSnapshot();
    }
  }
  draw() {
    if (!this.isActive || !this.ctx) {
      return;
    }

    /*

    this.frameId = requestAnimationFrame(() => this.draw());
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(this.img, 0, 0, this.canvas.width, this.canvas.height);
    */

    if (this.finishedSnapshotDataUrl) {
      this.drawFinishedSnapshot();
      this.hasGeneratedImage = true;
      this.updateButtonsVisibility();
      return;
    }

    this.renderInstance?.dispose?.();
    this.renderInstance = new render(
      this.canvas,
      this.environmentPrompt,
      () => {
        this.hasGeneratedImage = true;
        this.updateButtonsVisibility();
      },
    );
  }

  updateButtonsVisibility() {
    if (!this.backButton || !this.finishButton) {
      return;
    }

    if (this.finishedSnapshotDataUrl) {
      this.backButton.style.display = "block";
      this.finishButton.style.display = "none";
      return;
    }

    if (!this.hasGeneratedImage) {
      this.backButton.style.display = "none";
      this.finishButton.style.display = "none";
      return;
    }

    this.backButton.style.display = "block";
    this.finishButton.style.display =
      typeof this.onFinish === "function" ? "block" : "none";
  }

  drawFinishedSnapshot() {
    if (!this.ctx || !this.isActive || !this.finishedSnapshotDataUrl) {
      return;
    }

    if (this.finishedSnapshotImage?.complete) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(
        this.finishedSnapshotImage,
        0,
        0,
        this.canvas.width,
        this.canvas.height,
      );
      return;
    }

    const img = new Image();
    img.onload = () => {
      if (!this.isActive || !this.ctx) {
        return;
      }

      this.finishedSnapshotImage = img;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
    };
    img.onerror = () => {
      console.error("Failed to load finished snapshot image");
    };
    img.src = this.finishedSnapshotDataUrl;
  }

  /*
  displayEnvironment(environnemental, info = null) {
    const environmentValue =
      environnemental ?? info?.environnemental ?? "default";

    switch (environmentValue) {
      default:
      case "default":
        return "stars.png";
      case "Desert":
        return "desert.jpeg";
      case "Rainforest":
        return "rainforest.jpeg";
      case "Polar":
        return "polar.jpeg";
    }
  }
    */
  displayEnvironment(environnemental, info = null) {
    const environmentValue =
      environnemental ?? info?.environnemental ?? "default";

    switch (environmentValue) {
      default:
      case "default":
        return "space, stars, galaxy, nebula, cosmic";
      case "Desert":
        return "cinematic desert landscape, sand dunes, dramatic lighting, epic composition";
      case "Rainforest":
        return "tropical rainforest, lush vegetation, vibrant colors, misty atmosphere, cinematic composition";
      case "Polar":
        return "arctic polar landscape, icy terrain, snow-covered mountains, cold atmosphere, dramatic lighting, cinematic composition";
    }
  }
}
