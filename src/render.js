import { cancelComfyRequest, runComfy } from "./api";
import { getWebcamVideo, initWebcam, isWebcamReady } from "./webcam";
export default class renderCanvas {
  constructor(
    canvas,
    prompt = "default",
    seedKey = "",
    onFirstImage = null,
    initialImageDataUrl = null,
  ) {
    this.canvas = canvas;
    this.ctx = this.canvas.getContext("2d");
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.ctx = this.canvas.getContext("2d");

    this.captureSize = 800;
    this.captureCanvas = document.createElement("canvas");
    this.captureCanvas.width = this.captureSize;
    this.captureCanvas.height = this.captureSize;
    this.captureCtx = this.captureCanvas.getContext("2d");

    this.isRendering = false;
    this.lastGeneratedImageDataUrl = null;
    this.lastRenderTime = 0;
    this.renderIntervalMs = 500;
    this.generatedImage = null;
    this.displayImage = null;
    this.transitionFromImage = null;
    this.transitionToImage = null;
    this.transitionStartTime = 0;
    this.transitionDurationMs = 700;
    this.baseSeed = 12345;
    this.seedKey = String(seedKey || "");
    this.seed = this.computeSeedForPrompt(prompt || "default", this.seedKey);
    this.defaultPrompt = prompt || "default";
    this.onFirstImage = onFirstImage;
    this.hasNotifiedFirstImage = false;
    this.frameId = null;
    this.isDisposed = false;
    this.webcamInitAttempted = false;

    this.ensureWebcam();
    this.setInitialDisplayImage(initialImageDataUrl);
    this.draw();
  }
  async setInitialDisplayImage(imageDataUrl) {
    if (!imageDataUrl || this.isDisposed) {
      return;
    }

    const image = await this.loadImage(imageDataUrl);
    if (!image || this.isDisposed) {
      return;
    }

    this.displayImage = image;
  }
  computeSeedForPrompt(promptText, seedKeyText = "") {
    const text = `${String(promptText || "default")}|${String(seedKeyText || "")}`;
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
      const currentSeed = this.computeSeedForPrompt(promptText, this.seedKey);
      this.seed = currentSeed;
      const result = await runComfy(inputDataUrl, promptText, currentSeed);

      if (this.isDisposed) {
        return;
      }

      if (result?.ok && result.firstImage) {
        const img = await this.loadImage(result.firstImage);
        if (img && !this.isDisposed) {
          this.lastGeneratedImageDataUrl = result.firstImage;
          this.startImageTransition(img);
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
  startImageTransition(nextImage) {
    if (!nextImage || this.isDisposed) {
      return;
    }

    const currentImage =
      this.transitionToImage || this.displayImage || this.generatedImage;

    if (!currentImage) {
      this.displayImage = nextImage;
      this.transitionFromImage = null;
      this.transitionToImage = null;
      this.transitionStartTime = 0;
      return;
    }

    this.transitionFromImage = currentImage;
    this.transitionToImage = nextImage;
    this.transitionStartTime = performance.now();
    this.displayImage = nextImage;
  }
  drawGeneratedImage(image, alpha = 1) {
    if (!image || alpha <= 0 || this.isDisposed) {
      return;
    }

    // Scale image to 75% of available space, maintaining square aspect ratio
    const maxSize = Math.min(this.canvas.width, this.canvas.height) * 0.75;
    const displaySize = Math.max(512, maxSize);
    const drawX = (this.canvas.width - displaySize) * 0.5;
    const drawY = (this.canvas.height - displaySize) * 0.5;

    this.ctx.save();
    this.ctx.globalAlpha = Math.min(1, Math.max(0, alpha));
    this.ctx.drawImage(image, drawX, drawY, displaySize, displaySize);
    this.ctx.restore();
  }
  displayGeneratedImage() {
    if (this.isDisposed) {
      return;
    }

    if (this.transitionToImage && this.transitionFromImage) {
      const elapsed = performance.now() - this.transitionStartTime;
      const progress = Math.min(elapsed / this.transitionDurationMs, 1);

      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.fillStyle = "#000";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      this.drawGeneratedImage(this.transitionToImage, 1);
      this.drawGeneratedImage(this.transitionFromImage, 1 - progress);

      if (progress >= 1) {
        this.transitionFromImage = null;
        this.transitionToImage = null;
      }
      return;
    }

    if (this.displayImage) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.fillStyle = "#000";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.drawGeneratedImage(this.displayImage, 1);
      return;
    }

    // Show black background instead of webcam during rendering
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
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
    /*
    this.ctx.fillStyle = "rgba(0, 0, 0, 1)";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    */
    this.ctx.fillStyle = "#fff";
    this.ctx.font = "30px IBM Plex Mono, sans-serif";
    this.ctx.textAlign = "center";
    const dotsCount = (Math.floor(performance.now() / 350) % 3) + 1;
    const dots = ".".repeat(dotsCount);
    this.ctx.fillText(
      `CONNECTING TO LOCATION${dots}`,
      this.canvas.width * 0.5,
      this.canvas.height * 0.5,
    );
  }

  getGeneratedImageDataUrl() {
    return this.lastGeneratedImageDataUrl;
  }
}
