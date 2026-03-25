import { cancelComfyRequest, runComfy } from "./api";
// import { getWebcamVideo, isWebcamReady } from "./webcam";
export default class renderCanvas {
  constructor(canvas, prompt = "default", onFirstImage = null) {
    this.canvas = canvas;
    this.ctx = this.canvas.getContext("2d");
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.ctx = this.canvas.getContext("2d");

    this.captureSize = 512;
    this.captureCanvas = document.createElement("canvas");
    this.captureCanvas.width = this.captureSize;
    this.captureCanvas.height = this.captureSize;
    this.captureCtx = this.captureCanvas.getContext("2d");

    this.isRendering = false;
    this.lastRenderTime = 0;
    this.renderIntervalMs = 500;
    this.generatedImage = null;
    this.seed = Math.floor(Math.random() * 2 ** 32);
    this.defaultPrompt = prompt || "default";
    this.onFirstImage = onFirstImage;
    this.hasNotifiedFirstImage = false;
    this.frameId = null;
    this.isDisposed = false;

    this.draw();
  }
  draw() {
    if (this.isDisposed) {
      return;
    }

    this.frameId = requestAnimationFrame(() => this.draw());
    this.queueRender();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.isRendering && !this.generatedImage) {
      this.waitScreen();
      return;
    }

    this.displayGeneratedImage();
  }
  getPrompt() {
    const promptEl = document.getElementById("prompt");
    return promptEl?.value?.trim() || this.defaultPrompt;
  }
  loadImage(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }
  async requestRender() {
    if (!this.captureCtx || this.isDisposed) {
      return;
    }

    this.isRendering = true;

    try {
      // Webcam reference disabled for now (kept commented, not deleted).
      // this.captureCtx.drawImage(video, 0, 0, this.captureSize, this.captureSize);
      this.captureCtx.fillStyle = "#000";
      this.captureCtx.fillRect(0, 0, this.captureSize, this.captureSize);
      const inputDataUrl = this.captureCanvas.toDataURL("image/png");
      const currentSeed = Math.floor(Math.random() * 2 ** 32);
      this.seed = currentSeed;
      const result = await runComfy(
        inputDataUrl,
        this.getPrompt(),
        currentSeed,
      );

      if (this.isDisposed) {
        return;
      }

      if (result?.ok && result.firstImage) {
        const img = await this.loadImage(result.firstImage);
        if (img && !this.isDisposed) {
          this.generatedImage = img;
          if (!this.hasNotifiedFirstImage) {
            this.hasNotifiedFirstImage = true;
            if (typeof this.onFirstImage === "function") {
              this.onFirstImage();
            }
          }
        }
      } else if (result && !result.ok && !result.aborted) {
        console.error("Comfy render failed:", result.error || "unknown error");
      }
    } catch (error) {
      console.error("Error while rendering with Comfy:", error);
    } finally {
      this.isRendering = false;
    }
  }
  queueRender() {
    if (this.isDisposed) {
      return;
    }

    const now = performance.now();

    if (this.isRendering || now - this.lastRenderTime < this.renderIntervalMs) {
      return;
    }

    this.lastRenderTime = now;
    this.requestRender();
  }
  displayGeneratedImage() {
    if (this.isDisposed) {
      return;
    }

    if (this.generatedImage) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.fillStyle = "#000";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(
        this.generatedImage,
        this.canvas.width / 2 - this.canvas.height / 2,
        0,
        this.canvas.height,
        this.canvas.height,
      );
    }

    /*
    const video = getWebcamVideo();

    if (!isWebcamReady() || !video) {
      return;
    }

    this.ctx.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);
    this.queueRender(video);
    */
  }

  dispose() {
    this.isDisposed = true;
    cancelComfyRequest();
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }
  waitScreen() {
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "#fff";
    this.ctx.font = "30px Arial";
    this.ctx.textAlign = "center";
    this.ctx.fillText(
      "Generating image, please wait...",
      this.canvas.width / 2,
      this.canvas.height / 2,
    );
  }
}
