//import { runComfy } from "./api";
//import { createSketch } from "./sketch";
import render from "./render";
export default class generateCanvas {
  static lastGeneratedSnapshotDataUrl = null;
  static instanceCounter = 0;
  static backAudio = new Audio("/back.mp3");
  static finishAudio = new Audio("/finish.mp3");
  static activeEnvironmentAudio = null;
  static activeEnvironmentAudioOwnerId = null;

  static {
    generateCanvas.backAudio.preload = "auto";
    generateCanvas.finishAudio.preload = "auto";
  }

  static resolveEnvironmentAudioPath(environmentValue) {
    switch (environmentValue) {
      case "Polar":
        return "/artic.mp3";
      case "Desert":
      case "Desert mountain":
        return "/desert.mp3";
      case "Rainforest":
      case "Forest":
        return "/jungle.mp3";
      case "Mountain":
        return "/mountain.mp3";
      case "Savannah":
        return "/savanne.mp3";
      default:
        return null;
    }
  }

  static setLastSnapshot(snapshotDataUrl) {
    if (!snapshotDataUrl) {
      return;
    }

    generateCanvas.lastGeneratedSnapshotDataUrl = snapshotDataUrl;
  }

  static getLastSnapshot() {
    return generateCanvas.lastGeneratedSnapshotDataUrl;
  }

  constructor(
    environnemental,
    info = null,
    revealOrigin = null,
    onBack = null,
    onFinish = null,
    autoReveal = true,
    finishedSnapshotDataUrl = null,
    initialTransitionSnapshotDataUrl = null,
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
    this.instanceId = `generate-canvas-instance-${generateCanvas.instanceCounter++}`;
    this.info = info;
    this.revealOrigin = revealOrigin;
    this.onBack = onBack;
    this.onFinish = onFinish;
    this.autoReveal = autoReveal;
    this.finishedSnapshotDataUrl = finishedSnapshotDataUrl;
    this.initialTransitionSnapshotDataUrl = initialTransitionSnapshotDataUrl;
    this.finishedSnapshotImage = null;
    this.frameImage = null;
    this.hasGeneratedImage = Boolean(finishedSnapshotDataUrl);
    this.transitionDuration = 200;
    this.isActive = true;
    this.isGeneratedCanvasVisible = false;
    this.isRevealStarted = false;
    this.frameId = null;
    this.renderInstance = null;
    this.opacity = 1;
    this.typewriterAnimationFrameId = null;
    this.typewriterCharIndex = 0;
    this.handleResize = () => this.resizeCanvas();
    this.parallaxMaxOffset = 12;
    this.parallaxX = 0;
    this.parallaxY = 0;
    this.handlePointerMove = (event) => {
      const normX = (event.clientX / window.innerWidth) * 2 - 1;
      const normY = (event.clientY / window.innerHeight) * 2 - 1;
      this.parallaxX = normX * this.parallaxMaxOffset;
      this.parallaxY = normY * this.parallaxMaxOffset;

      if (this.finishedSnapshotDataUrl) {
        this.drawFinishedSnapshot();
      }
    };
    this.handlePointerLeave = () => {
      this.parallaxX = 0;
      this.parallaxY = 0;

      if (this.finishedSnapshotDataUrl) {
        this.drawFinishedSnapshot();
      }
    };

    this.earthCanvas = document.getElementById("canvas");
    this.constructionPanel = document.querySelector(".construction-pannel");
    this.locationInfoPanel = document.getElementById("location-info-panel");
    this.locationInfoTitleElement = document.getElementById(
      "location-info-title",
    );
    this.locationInfoContentElement = document.getElementById(
      "location-info-content",
    );
    this.constructionPanelOriginalParent = null;
    this.constructionPanelOriginalNextSibling = null;
    this.locationInfoPanelOriginalParent = null;
    this.locationInfoPanelOriginalNextSibling = null;
    this.previousEarthCanvasVisibility =
      this.earthCanvas?.style.visibility ?? "";
    this.previousEarthCanvasPointerEvents =
      this.earthCanvas?.style.pointerEvents ?? "";

    this.canvas = document.getElementById("generated-canvas");
    this.environmentPrompt = this.displayEnvironment(environnemental, info);
    this.seedKey = this.buildSeedKey(environnemental, info);
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
    this.canvas.dataset.ownerInstanceId = this.instanceId;

    this.canvas.style.transformOrigin = this.getTransformOrigin();

    this.backButton = document.getElementById("generated-canvas-back-button");
    if (!this.backButton) {
      this.backButton = document.createElement("button");
      this.backButton.id = "generated-canvas-back-button";
      this.backButton.textContent = "Back";
      document.body.appendChild(this.backButton);
    }
    this.backButton.dataset.ownerInstanceId = this.instanceId;
    this.finishButton = document.getElementById(
      "generated-canvas-finish-button",
    );
    if (!this.finishButton) {
      this.finishButton = document.createElement("button");
      this.finishButton.id = "generated-canvas-finish-button";
      this.finishButton.textContent = "Finish";
      document.body.appendChild(this.finishButton);
    }
    this.finishButton.dataset.ownerInstanceId = this.instanceId;

    this.backButton.style.display = "none";
    this.finishButton.style.display = "none";
    this.ensureConstructionPanelLayer();
    this.ensureLocationInfoPanelLayer();
    this.updateLocationInfoPanelContent();
    this.toggleConstructionPanel(false);
    this.toggleLocationInfoPanel(false);

    this.backButton.onclick = () => {
      generateCanvas.backAudio.currentTime = 0;
      generateCanvas.backAudio.play().catch(() => {});
      this.backButton.style.display = "none";
      this.finishButton.style.display = "none";
      const snapshotDataUrl = this.hasGeneratedImage
        ? this.renderInstance?.getGeneratedImageDataUrl?.() ||
          this.captureSnapshot()
        : null;
      if (snapshotDataUrl) {
        generateCanvas.setLastSnapshot(snapshotDataUrl);
      }
      if (typeof this.onBack === "function") {
        this.onBack(snapshotDataUrl);
      }
      this.toggleEarthCanvas(true);
      this.fadeOutCanvas(() => {
        this.dispose();
      });
    };
    this.finishButton.onclick = () => {
      generateCanvas.finishAudio.currentTime = 0;
      generateCanvas.finishAudio.play().catch(() => {});
      this.backButton.style.display = "none";
      this.finishButton.style.display = "none";
      const snapshotDataUrl =
        this.renderInstance?.getGeneratedImageDataUrl?.() ||
        this.captureSnapshot();
      if (snapshotDataUrl) {
        generateCanvas.setLastSnapshot(snapshotDataUrl);
      }
      if (typeof this.onFinish === "function") {
        this.onFinish(snapshotDataUrl);
      }
      if (typeof this.onBack === "function") {
        this.onBack(snapshotDataUrl);
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
    this.loadFrameImage();
    this.resizeCanvas();
    this.draw();
    if (this.img.complete && this.autoReveal) {
      this.startReveal();
    }
    window.addEventListener("resize", this.handleResize);
    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("mouseleave", this.handlePointerLeave);
    console.log(info);
  }
  loadGeneratingBackgroundImage() {
    const image = new Image();

    image.onload = () => {
      this.generatingBackgroundImage = image;

      if (this.finishedSnapshotDataUrl) {
        this.drawFinishedSnapshot();
      }
    };

    image.onerror = () => {
      console.error("Failed to load generating background image");
    };

    image.src = "/generating-background.png";
  }
  async loadFrameImage() {
    if (this.isDisposed) {
      return;
    }
    try {
      this.frameImage = await this.loadImage("/frame.png");
      console.log("Frame image loaded successfully:", this.frameImage);
    } catch (error) {
      console.error("Failed to load frame image from /frame.png:", error);
    }
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

    if (this.finishedSnapshotDataUrl) {
      this.canvas.style.transition = "none";
      this.canvas.style.opacity = "1";
      this.toggleEarthCanvas(false);
      this.updateButtonsVisibility();
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

    if (this.finishedSnapshotDataUrl) {
      this.canvas.style.transition = "none";
      this.canvas.style.opacity = "0";
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
  startEnvironmentAudio() {
    const environmentValue =
      this.environnemental ?? this.info?.environnemental ?? "default";
    const audioPath =
      generateCanvas.resolveEnvironmentAudioPath(environmentValue);

    if (!audioPath) {
      return;
    }

    if (generateCanvas.activeEnvironmentAudio) {
      generateCanvas.activeEnvironmentAudio.pause();
      generateCanvas.activeEnvironmentAudio.currentTime = 0;
    }

    const audio = new Audio(audioPath);
    audio.preload = "auto";
    audio.loop = true;
    audio.play().catch(() => {});

    generateCanvas.activeEnvironmentAudio = audio;
    generateCanvas.activeEnvironmentAudioOwnerId = this.instanceId;
  }
  stopEnvironmentAudio() {
    if (
      !generateCanvas.activeEnvironmentAudio ||
      generateCanvas.activeEnvironmentAudioOwnerId !== this.instanceId
    ) {
      return;
    }

    generateCanvas.activeEnvironmentAudio.pause();
    generateCanvas.activeEnvironmentAudio.currentTime = 0;
    generateCanvas.activeEnvironmentAudio = null;
    generateCanvas.activeEnvironmentAudioOwnerId = null;
  }
  toggleEarthCanvas(isVisible) {
    if (!this.earthCanvas) {
      return;
    }

    if (isVisible) {
      this.stopEnvironmentAudio();
      this.isGeneratedCanvasVisible = false;
      if (this.backButton) {
        this.backButton.style.display = "none";
      }
      if (this.finishButton) {
        this.finishButton.style.display = "none";
      }
      this.earthCanvas.style.visibility = this.previousEarthCanvasVisibility;
      this.earthCanvas.style.pointerEvents =
        this.previousEarthCanvasPointerEvents;
      window.dispatchEvent(new CustomEvent("generated-canvas-closed"));
      this.updateConstructionPanelVisibility();
      this.updateLocationInfoPanelVisibility();
      return;
    }

    this.isGeneratedCanvasVisible = true;
    this.startEnvironmentAudio();
    this.updateButtonsVisibility();

    this.earthCanvas.style.visibility = "hidden";
    this.earthCanvas.style.pointerEvents = "none";
    window.dispatchEvent(new CustomEvent("generated-canvas-opened"));
    this.updateConstructionPanelVisibility();
    this.updateLocationInfoPanelVisibility();
  }
  toggleConstructionPanel(isVisible) {
    if (!this.constructionPanel) {
      return;
    }

    this.constructionPanel.style.display = isVisible ? "block" : "none";
  }
  toggleLocationInfoPanel(isVisible) {
    if (!this.locationInfoPanel) {
      return;
    }

    this.locationInfoPanel.style.display = isVisible ? "block" : "none";
  }
  ensureConstructionPanelLayer() {
    if (!this.constructionPanel) {
      return;
    }

    if (this.constructionPanel.parentElement === document.body) {
      return;
    }

    this.constructionPanelOriginalParent = this.constructionPanel.parentElement;
    this.constructionPanelOriginalNextSibling =
      this.constructionPanel.nextSibling;
    document.body.appendChild(this.constructionPanel);
  }
  restoreConstructionPanelLayer() {
    if (!this.constructionPanel || !this.constructionPanelOriginalParent) {
      return;
    }

    if (this.constructionPanelOriginalNextSibling) {
      this.constructionPanelOriginalParent.insertBefore(
        this.constructionPanel,
        this.constructionPanelOriginalNextSibling,
      );
      return;
    }

    this.constructionPanelOriginalParent.appendChild(this.constructionPanel);
  }
  ensureLocationInfoPanelLayer() {
    if (!this.locationInfoPanel) {
      return;
    }

    if (this.locationInfoPanel.parentElement === document.body) {
      return;
    }

    this.locationInfoPanelOriginalParent = this.locationInfoPanel.parentElement;
    this.locationInfoPanelOriginalNextSibling =
      this.locationInfoPanel.nextSibling;
    document.body.appendChild(this.locationInfoPanel);
  }
  restoreLocationInfoPanelLayer() {
    if (!this.locationInfoPanel || !this.locationInfoPanelOriginalParent) {
      return;
    }

    if (this.locationInfoPanelOriginalNextSibling) {
      this.locationInfoPanelOriginalParent.insertBefore(
        this.locationInfoPanel,
        this.locationInfoPanelOriginalNextSibling,
      );
      return;
    }

    this.locationInfoPanelOriginalParent.appendChild(this.locationInfoPanel);
  }
  updateConstructionPanelVisibility() {
    const shouldShow = this.isGeneratedCanvasVisible && this.hasGeneratedImage;
    this.toggleConstructionPanel(shouldShow);
  }
  updateLocationInfoPanelVisibility() {
    const shouldShow = this.isGeneratedCanvasVisible;
    this.toggleLocationInfoPanel(shouldShow);
  }
  startTypewriterAnimation(fullText, element, speedMs = 5) {
    // Cancel any existing animation
    if (this.typewriterAnimationFrameId) {
      cancelAnimationFrame(this.typewriterAnimationFrameId);
    }

    this.typewriterCharIndex = 0;
    element.textContent = "";

    const animate = () => {
      if (this.typewriterCharIndex < fullText.length && this.isActive) {
        const char = fullText[this.typewriterCharIndex];
        element.textContent += char;
        this.typewriterCharIndex++;

        setTimeout(() => {
          this.typewriterAnimationFrameId = requestAnimationFrame(animate);
        }, speedMs);
      } else {
        this.typewriterAnimationFrameId = null;
      }
    };

    this.typewriterAnimationFrameId = requestAnimationFrame(animate);
  }

  updateLocationInfoPanelContent() {
    if (!this.locationInfoTitleElement || !this.locationInfoContentElement) {
      return;
    }

    const panelInfo = this.info?.panelInfo;
    const title = panelInfo?.title || this.info?.name || "Location";
    const bodyLines = Array.isArray(panelInfo?.body) ? panelInfo.body : [];
    const fullBodyText = bodyLines.join("\n");

    this.locationInfoTitleElement.textContent = title;
    this.startTypewriterAnimation(
      fullBodyText,
      this.locationInfoContentElement,
    );
  }
  dispose() {
    this.isActive = false;
    this.stopEnvironmentAudio();
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
    if (this.typewriterAnimationFrameId) {
      cancelAnimationFrame(this.typewriterAnimationFrameId);
      this.typewriterAnimationFrameId = null;
    }
    this.renderInstance?.dispose?.();
    this.renderInstance = null;
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("mouseleave", this.handlePointerLeave);
    if (this.canvas?.dataset?.ownerInstanceId === this.instanceId) {
      this.canvas.remove();
    }
    if (this.backButton?.dataset?.ownerInstanceId === this.instanceId) {
      this.backButton.remove();
    }
    if (this.finishButton?.dataset?.ownerInstanceId === this.instanceId) {
      this.finishButton.remove();
    }
    this.toggleConstructionPanel(false);
    this.toggleLocationInfoPanel(false);
    this.restoreConstructionPanelLayer();
    this.restoreLocationInfoPanelLayer();
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
      this.seedKey,
      () => {
        this.hasGeneratedImage = true;
        this.updateButtonsVisibility();
      },
      null,
    );
  }

  updateButtonsVisibility() {
    if (!this.backButton || !this.finishButton) {
      return;
    }

    if (this.finishedSnapshotDataUrl) {
      this.backButton.style.display = "block";
      this.finishButton.style.display = "none";
      this.updateConstructionPanelVisibility();
      return;
    }

    if (!this.hasGeneratedImage) {
      this.backButton.style.display = "none";
      this.finishButton.style.display = "none";
      this.updateConstructionPanelVisibility();
      return;
    }

    this.backButton.style.display = "block";
    this.finishButton.style.display =
      typeof this.onFinish === "function" ? "block" : "none";
    this.updateConstructionPanelVisibility();
  }

  drawFinishedSnapshot() {
    if (!this.ctx || !this.isActive || !this.finishedSnapshotDataUrl) {
      return;
    }

    const drawWithAspect = (image) => {
      // Scale image to 75% of available space, maintaining square aspect ratio
      const maxSize = Math.min(this.canvas.width, this.canvas.height) * 0.75;
      const displaySize = Math.max(512, maxSize);
      const drawX = (this.canvas.width - displaySize) * 0.5 + this.parallaxX;
      const drawY = (this.canvas.height - displaySize) * 0.5 + this.parallaxY;

      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.fillStyle = "#000";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      this.ctx.drawImage(image, drawX, drawY, displaySize, displaySize);

      if (this.frameImage) {
        const sizeFactor = 1.5;
        const frameX = (this.canvas.width - displaySize * sizeFactor) * 0.5;
        const frameY = (this.canvas.height - displaySize * sizeFactor) * 0.5;
        this.ctx.drawImage(
          this.frameImage,
          frameX,
          frameY,
          displaySize * sizeFactor,
          displaySize * sizeFactor,
        );
      }
    };

    if (this.finishedSnapshotImage?.complete) {
      drawWithAspect(this.finishedSnapshotImage);
      return;
    }

    const img = new Image();
    img.onload = () => {
      if (!this.isActive || !this.ctx) {
        return;
      }

      this.finishedSnapshotImage = img;
      drawWithAspect(img);
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
        return "citybkg, aerial top-down,  city, luxury glass skyscrapers, from above, modern towers, photorealistic, 8k, cinematic lighting, sharp details, birds eye view, ultra realistic";
      case "Desert":
        return "desert, sand dunes, bird view, 45 degree";
      case "Rainforest":
        return "jungle, forest, bird view, 45 degree";
      case "Polar":
        return "arctic polar landscape, icy terrain, snow-covered mountains, cold atmosphere, dramatic lighting, cinematic composition";
      case "Mountain":
        return "mountainous landscape, rugged peaks, alpine scenery, dramatic lighting, cinematic composition";
      case "Savannah":
        return "savannah landscape, acacia trees, golden grasslands, warm atmosphere, dramatic lighting, cinematic composition";
      case "Forest":
        return "dense forest, tall trees, lush greenery, misty atmosphere, dramatic lighting, cinematic composition";
      case "Desert mountain":
        return "desert mountainous landscape, rocky terrain, sand dunes, dramatic lighting, cinematic composition";
    }
  }

  buildSeedKey(environnemental, info = null) {
    const environmentValue =
      environnemental ?? info?.environnemental ?? "default";
    const nameValue = info?.name ?? "unknown";
    const latitudeValue =
      typeof info?.latitude === "number" ? info.latitude.toFixed(6) : "na";
    const longitudeValue =
      typeof info?.longitude === "number" ? info.longitude.toFixed(6) : "na";

    return [environmentValue, nameValue, latitudeValue, longitudeValue].join(
      "|",
    );
  }
}
