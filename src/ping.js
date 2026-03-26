import * as THREE from "three";
import generateCanvas from "./generateCanvas";

export default class Ping {
  static lastViewedSnapshotDataUrl = null;

  static setLastViewedSnapshot(snapshotDataUrl) {
    if (!snapshotDataUrl) {
      return;
    }

    Ping.lastViewedSnapshotDataUrl = snapshotDataUrl;
  }

  static getLastViewedSnapshot() {
    return Ping.lastViewedSnapshotDataUrl;
  }

  constructor(
    posX,
    posY,
    posZ,
    size,
    color = 0x000000,
    hoverColor = 0xff0000,
    info = null,
  ) {
    this.posX = posX;
    this.posY = posY;
    this.posZ = posZ;
    this.size = size;
    this.baseColor = 0x000000;
    this.finishedColor = 0xffffff;
    this.hoverColor = 0xffffff;
    this.info = info;
    this.markerTextureCanvas = null;
    this.markerTextureContext = null;
    this.markerTexture = null;
    this.markerFillColor = this.baseColor;
    this.mesh = this.createPing();
    this.isCameraZoomed = false;
    this.isZoomTransitioning = false;
    this.isFinished = false;
    this.originalCameraPosition = null;
    this.originalControlsTarget = null;
    this.followDistance = 30;
    this.screenFadeColor = "rgb(0, 0, 0)";
    this.screenFadeOpacity = 1;
    this.finishedSnapshotDataUrl = null;
    this.mesh.userData.info = this.info;
  }

  setFinishedSnapshot(imageDataUrl) {
    if (!imageDataUrl) {
      return;
    }
    this.finishedSnapshotDataUrl = imageDataUrl;
    Ping.setLastViewedSnapshot(imageDataUrl);
  }

  getScreenFadeOverlay() {
    let overlay = document.getElementById("screen-fade-overlay");

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "screen-fade-overlay";
      overlay.style.position = "fixed";
      overlay.style.inset = "0";
      overlay.style.pointerEvents = "none";
      overlay.style.opacity = "0";
      overlay.style.zIndex = "9999";
      document.body.appendChild(overlay);
    }

    return overlay;
  }

  fadeScreen(targetOpacity, duration = 500, color = this.screenFadeColor) {
    const overlay = this.getScreenFadeOverlay();
    overlay.style.backgroundColor = color;

    const initialOpacity = Number.parseFloat(overlay.style.opacity || "0") || 0;
    const clampedTarget = THREE.MathUtils.clamp(targetOpacity, 0, 1);
    const startTime = performance.now();

    const animateFade = (time) => {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const currentOpacity = THREE.MathUtils.lerp(
        initialOpacity,
        clampedTarget,
        progress,
      );

      overlay.style.opacity = String(currentOpacity);

      if (progress < 1) {
        requestAnimationFrame(animateFade);
      }
    };

    requestAnimationFrame(animateFade);
  }

  static fromLatLon(
    latitude,
    longitude,
    radius,
    size = 0.5,
    color = 0xff0000,
    longitudeOffset = 0,
    hoverColor = 0x3399ff,
    info = null,
  ) {
    const latRad = THREE.MathUtils.degToRad(latitude);
    const lonRad = THREE.MathUtils.degToRad(longitude + longitudeOffset);

    const x = radius * Math.cos(latRad) * Math.sin(lonRad);
    const y = radius * Math.sin(latRad);
    const z = radius * Math.cos(latRad) * Math.cos(lonRad);

    return new Ping(x, y, z, size, color, hoverColor, info);
  }

  createPing() {
    const hitboxGeometry = new THREE.SphereGeometry(this.size * 2, 32, 32);
    const hitboxMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const hitbox = new THREE.Mesh(hitboxGeometry, hitboxMaterial);
    hitbox.position.set(this.posX, this.posY, this.posZ);
    hitbox.userData.isHitbox = true;

    const textureSize = 128;
    this.markerTextureCanvas = document.createElement("canvas");
    this.markerTextureCanvas.width = textureSize;
    this.markerTextureCanvas.height = textureSize;
    this.markerTextureContext = this.markerTextureCanvas.getContext("2d");

    this.markerTexture = new THREE.CanvasTexture(this.markerTextureCanvas);
    this.markerTexture.minFilter = THREE.LinearFilter;
    this.markerTexture.magFilter = THREE.NearestFilter;

    const spriteMaterial = new THREE.SpriteMaterial({
      map: this.markerTexture,
      transparent: true,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    const spriteSize = this.size * 1.5;
    sprite.scale.set(spriteSize, spriteSize, 1);
    hitbox.add(sprite);

    this.updateMarkerFillColor(this.baseColor);

    return hitbox;
  }

  updateMarkerFillColor(fillColor) {
    if (!this.markerTextureContext || !this.markerTexture) {
      return;
    }

    const ctx = this.markerTextureContext;
    const size = this.markerTextureCanvas.width;
    const borderSize = Math.floor(size * 0.05);
    const innerStart = borderSize;
    const innerSize = size - borderSize * 2;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = `#${fillColor.toString(16).padStart(6, "0")}`;
    ctx.fillRect(innerStart, innerStart, innerSize, innerSize);

    this.markerTexture.needsUpdate = true;
  }

  setHovered(isHovered) {
    const restingColor = this.isFinished ? this.finishedColor : this.baseColor;
    const targetColor = isHovered ? this.hoverColor : restingColor;
    this.markerFillColor = targetColor;
    this.updateMarkerFillColor(targetColor);
  }
  setInfo(info) {
    this.info = info;
    this.mesh.userData.info = info;
  }
  setMaterialOpacity(material, opacity) {
    if (!material) {
      return;
    }

    if (material.userData.baseOpacity == null) {
      material.userData.baseOpacity = material.opacity ?? 1;
    }

    if (material.userData.wasTransparent == null) {
      material.userData.wasTransparent = material.transparent === true;
    }

    const clampedOpacity = THREE.MathUtils.clamp(opacity, 0, 1);
    material.transparent = true;
    material.opacity = material.userData.baseOpacity * clampedOpacity;
    material.depthWrite = clampedOpacity > 0.02;
    material.needsUpdate = true;
  }
  setPingMeshOpacity(opacity) {
    this.mesh.traverse((child) => {
      if (
        child.userData?.isHitbox ||
        (!child.isMesh && !child.isSprite) ||
        !child.material
      ) {
        return;
      }

      if (Array.isArray(child.material)) {
        child.material.forEach((material) =>
          this.setMaterialOpacity(material, opacity),
        );
        return;
      }

      this.setMaterialOpacity(child.material, opacity);
    });
  }
  onClick(callback) {
    this.mesh.userData.onClick = () => callback(this.info);
  }
  getPingScreenOrigin(camera, worldPosition = null) {
    const projected = worldPosition
      ? worldPosition.clone()
      : this.mesh.getWorldPosition(new THREE.Vector3());

    projected.project(camera);

    const x = THREE.MathUtils.clamp((projected.x + 1) * 0.5, 0, 1);
    const y = THREE.MathUtils.clamp((-projected.y + 1) * 0.5, 0, 1);

    return {
      xPercent: x * 100,
      yPercent: y * 100,
    };
  }

  zoomIn(
    camera,
    controls,
    duration = 500,
    cameraDistance = 30,
    onFinish = null,
  ) {
    if (this.isCameraZoomed || this.isZoomTransitioning) {
      return;
    }

    this.onClick((info) => {
      if (this.isCameraZoomed || this.isZoomTransitioning) {
        console.log("Ping clicked:", info);
        return;
      }

      this.isZoomTransitioning = true;

      const targetWorldPosition = new THREE.Vector3();
      this.mesh.getWorldPosition(targetWorldPosition);

      const startCameraPosition = camera.position.clone();
      const startTarget = controls ? controls.target.clone() : null;
      const minimumCameraDistance = 0.5;
      const desiredCameraDistance = Math.max(
        cameraDistance,
        minimumCameraDistance,
      );

      this.originalCameraPosition = startCameraPosition.clone();
      this.originalControlsTarget = startTarget ? startTarget.clone() : null;
      this.followDistance = desiredCameraDistance;
      const environnemental = info?.environnemental ?? "Ocean";
      const canvasTriggerDistance = Math.max(desiredCameraDistance * 7, 18);
      let isCanvasOpened = false;
      let generatedCanvas = null;

      const startCanvasGeneration = () => {
        if (generatedCanvas) {
          return;
        }

        const revealOrigin = this.getPingScreenOrigin(
          camera,
          targetWorldPosition,
        );

        generatedCanvas = new generateCanvas(
          environnemental,
          info,
          revealOrigin,
          (snapshotDataUrl = null) => {
            if (snapshotDataUrl) {
              Ping.setLastViewedSnapshot(snapshotDataUrl);
            }
            this.zoomOut(camera, controls, 500);
          },
          this.isFinished
            ? null
            : (snapshotDataUrl = null) => {
                this.setFinishedSnapshot(snapshotDataUrl);
                if (!this.isFinished) {
                  this.isFinished = true;
                  this.setHovered(false);
                  if (typeof onFinish === "function") {
                    onFinish();
                  }
                }
              },
          false,
          this.finishedSnapshotDataUrl,
          this.finishedSnapshotDataUrl ? null : Ping.getLastViewedSnapshot(),
        );
      };

      const openCanvas = () => {
        if (isCanvasOpened) {
          return;
        }

        isCanvasOpened = true;
        startCanvasGeneration();
        generatedCanvas?.startReveal?.();
        console.log("Ping clicked:", info);
      };

      startCanvasGeneration();

      const surfaceNormal = targetWorldPosition.clone().normalize();
      const followOffset = surfaceNormal.multiplyScalar(desiredCameraDistance);
      this.setPingMeshOpacity(1);

      const startTime = performance.now();

      const animateZoom = (time) => {
        const elapsed = time - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = THREE.MathUtils.smootherstep(progress, 0, 1);
        this.setPingMeshOpacity(1 - easedProgress);

        this.mesh.getWorldPosition(targetWorldPosition);
        const liveSurfaceNormal = targetWorldPosition.clone().normalize();
        followOffset.copy(
          liveSurfaceNormal.multiplyScalar(desiredCameraDistance),
        );
        const endCameraPosition = targetWorldPosition.clone().add(followOffset);

        camera.position.lerpVectors(
          startCameraPosition,
          endCameraPosition,
          easedProgress,
        );
        if (controls && startTarget) {
          controls.target.lerpVectors(
            startTarget,
            targetWorldPosition,
            easedProgress,
          );
          controls.update();
        } else {
          camera.lookAt(targetWorldPosition);
        }

        const currentDistanceToTarget =
          camera.position.distanceTo(targetWorldPosition);
        if (currentDistanceToTarget <= canvasTriggerDistance) {
          openCanvas();
        }

        if (progress < 1) {
          requestAnimationFrame(animateZoom);
          return;
        }

        if (controls) {
          controls.target.copy(targetWorldPosition);
          controls.update();
        } else {
          camera.lookAt(targetWorldPosition);
        }
        this.setPingMeshOpacity(0);
        this.isCameraZoomed = true;
        this.isZoomTransitioning = false;
        openCanvas();
      };

      requestAnimationFrame(animateZoom);
    });
  }
  zoomOut(camera, controls, duration = 500, originalPosition = null) {
    if (!this.isCameraZoomed || this.isZoomTransitioning) return;

    this.isCameraZoomed = false;
    this.isZoomTransitioning = true;

    const startCameraPosition = camera.position.clone();
    const startTarget = controls ? controls.target.clone() : null;

    const storedPosition = this.originalCameraPosition
      ? this.originalCameraPosition.clone()
      : null;
    const endCameraPosition = originalPosition
      ? originalPosition.clone()
      : storedPosition;

    if (!endCameraPosition) {
      this.isCameraZoomed = false;
      this.isZoomTransitioning = false;
      return;
    }

    const endTarget = this.originalControlsTarget
      ? this.originalControlsTarget.clone()
      : controls
        ? new THREE.Vector3(0, 0, 0)
        : null;

    const startTime = performance.now();

    const animateZoomOut = (time) => {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = THREE.MathUtils.smootherstep(progress, 0, 1);
      this.setPingMeshOpacity(easedProgress);

      camera.position.lerpVectors(
        startCameraPosition,
        endCameraPosition,
        easedProgress,
      );

      if (controls && startTarget && endTarget) {
        controls.target.lerpVectors(startTarget, endTarget, easedProgress);
        controls.update();
      } else if (endTarget) {
        camera.lookAt(endTarget);
      }

      if (progress < 1) {
        requestAnimationFrame(animateZoomOut);
        return;
      }

      if (controls && endTarget) {
        controls.target.copy(endTarget);
        controls.update();
      } else if (endTarget) {
        camera.lookAt(endTarget);
      }

      this.setPingMeshOpacity(1);
      this.isCameraZoomed = false;
      this.isZoomTransitioning = false;
    };

    requestAnimationFrame(animateZoomOut);
  }
  cameraFollow(camera, controls, offsetDistance = this.followDistance) {
    if (!this.isCameraZoomed) return;
    const targetWorldPosition = new THREE.Vector3();
    this.mesh.getWorldPosition(targetWorldPosition);
    const surfaceNormal = targetWorldPosition.clone().normalize();
    const followOffset = surfaceNormal.multiplyScalar(offsetDistance);
    const desiredCameraPosition = targetWorldPosition.clone().add(followOffset);
    const followLerpFactor = 0.06;
    camera.position.lerp(desiredCameraPosition, followLerpFactor);
    if (controls) {
      controls.target.lerp(targetWorldPosition, followLerpFactor);
      controls.update();
    } else {
      camera.lookAt(targetWorldPosition);
    }
  }
  fadeIn(duration = 500) {
    this.fadeScreen(this.screenFadeOpacity, duration, this.screenFadeColor);
  }

  fadeOut(duration = 500) {
    this.fadeScreen(0, duration, this.screenFadeColor);
  }
}
