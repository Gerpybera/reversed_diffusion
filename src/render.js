import { cancelComfyRequest, runComfy } from "./api";
import { getWebcamVideo, initWebcam, isWebcamReady } from "./webcam";
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
    this.baseSeed = 12345;
    this.seed = this.computeSeedForPrompt(prompt || "default");
    this.defaultPrompt = prompt || "default";
    this.onFirstImage = onFirstImage;
    this.hasNotifiedFirstImage = false;
    this.frameId = null;
    this.isDisposed = false;
    this.webcamInitAttempted = false;

    this.ensureWebcam();
    this.draw();
  }
  computeSeedForPrompt(promptText) {
    const text = String(promptText || "default");
    let hash = 2166136261;

    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    const mixed = (hash ^ this.baseSeed) >>> 0;
    return mixed === 0 ? 1 : mixed;
  }
  ensureWebcam() {
    if (this.webcamInitAttempted) {
      return;
    }

    this.webcamInitAttempted = true;
    initWebcam().catch((error) => {
      this.webcamInitAttempted = false;
      console.error("Unable to initialize webcam:", error);
    });
  }
  drawVideoCover(ctx, video, targetWidth, targetHeight) {
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;

    if (!sourceWidth || !sourceHeight) {
      return false;
    }

    const sourceRatio = sourceWidth / sourceHeight;
    const targetRatio = targetWidth / targetHeight;

    let cropWidth = sourceWidth;
    let cropHeight = sourceHeight;
    let offsetX = 0;
    let offsetY = 0;

    if (sourceRatio > targetRatio) {
      cropWidth = Math.floor(sourceHeight * targetRatio);
      offsetX = Math.floor((sourceWidth - cropWidth) / 2);
    } else {
      cropHeight = Math.floor(sourceWidth / targetRatio);
      offsetY = Math.floor((sourceHeight - cropHeight) / 2);
    }

    ctx.drawImage(
      video,
      offsetX,
      offsetY,
      cropWidth,
      cropHeight,
      0,
      0,
      targetWidth,
      targetHeight,
    );

    return true;
  }
  draw() {
    if (this.isDisposed) {
      return;
    }

    this.frameId = requestAnimationFrame(() => this.draw());
    this.queueRender();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.displayGeneratedImage();

    if (this.isRendering && !this.generatedImage) {
      this.waitScreen();
    }
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

    this.ensureWebcam();

    this.isRendering = true;

    try {
      const video = getWebcamVideo();

      if (!isWebcamReady() || !video) {
        return;
      }

      this.captureCtx.clearRect(0, 0, this.captureSize, this.captureSize);
      this.drawVideoCover(
        this.captureCtx,
        video,
        this.captureSize,
        this.captureSize,
      );

      const inputDataUrl = this.captureCanvas.toDataURL("image/png");
      const promptText = this.getPrompt();
      const currentSeed = this.computeSeedForPrompt(promptText);
      this.seed = currentSeed;
      const result = await runComfy(
        inputDataUrl,
        promptText,
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
      return;
    }

    const video = getWebcamVideo();

    if (!isWebcamReady() || !video) {
      this.ctx.fillStyle = "#000";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      return;
    }

    this.drawVideoCover(this.ctx, video, this.canvas.width, this.canvas.height);
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
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
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
