import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/Addons.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import Ping from "./ping.js";
import { preloadWorkflow, setConstructionPrompt } from "./api.js";
import { initWebcam } from "./webcam.js";

const canvas = document.getElementById("canvas");
const endMessageElement = document.getElementById("message");
const closeEndMessageButton = document.getElementById("close_message");
const startMessageElement = document.getElementById("start-message");
const closeStartMessageButton = document.getElementById("close_start_message");
const restartButton = document.getElementById("restart-button");
const selectionAudio = new Audio("/selection.mp3");
selectionAudio.preload = "auto";
const backAudio = new Audio("/back.mp3");
backAudio.volume = 0.3;
backAudio.preload = "auto";
const hoverAudios = [
  new Audio("/hover.mp3"),
  new Audio("/hover1.mp3"),
  new Audio("/hover2.mp3"),
  new Audio("/hover3.mp3"),
  new Audio("/hover4.mp3"),
];
hoverAudios.forEach((audio) => {
  audio.preload = "auto";
  audio.volume = 0.4;
});

const constructionAudio = new Audio("/construction.mp3");
constructionAudio.preload = "auto";
constructionAudio.volume = 0.3;
const defaultConstructionPrompt =
  "bird view 45°, european town, church, modern architecture";
const constructionPromptMap = {
  "default-building": defaultConstructionPrompt,
  "luxe-building":
    "bird view 45°, Dubai glass towers luxe, skyline",
  "suburbs-building":
    "bird view 45°, buildings",
  "industrial-building":
    "bird view 45°, industry, nuclear central, cooling towers",
};
let activeConstructionButtonId = "default-building";

function applyConstructionSelection() {
  const constructionButtons = document.querySelectorAll(
    ".construction_buttons button",
  );
  if (!constructionButtons.length) {
    return;
  }

  constructionButtons.forEach((button) => {
    button.classList.toggle(
      "is-selected",
      button.id === activeConstructionButtonId,
    );
  });
}

function setActiveConstructionButton(buttonId) {
  activeConstructionButtonId =
    typeof buttonId === "string" && buttonId.length
      ? buttonId
      : "default-building";
  const mappedPrompt =
    constructionPromptMap[activeConstructionButtonId] ||
    defaultConstructionPrompt;
  setConstructionPrompt(mappedPrompt);
  applyConstructionSelection();
}

setActiveConstructionButton(activeConstructionButtonId);
const spaceAmbientAudio = new Audio("/space.mp3");
spaceAmbientAudio.preload = "auto";
spaceAmbientAudio.loop = true;
const satelitAmbientAudio = new Audio("/satelit.mp3");
satelitAmbientAudio.preload = "auto";
satelitAmbientAudio.loop = true;
satelitAmbientAudio.volume = 0.1;

function playHoverAudio() {
  const randomIndex = Math.floor(Math.random() * hoverAudios.length);
  const hoverAudio = hoverAudios[randomIndex];
  hoverAudio.currentTime = 0;
  hoverAudio.play().catch(() => {});
}

function shouldPlaySpaceAmbient() {
  return isEarthViewActive && !document.hidden && !isWebglContextLost;
}

function updateSpaceAmbientPlayback() {
  if (shouldPlaySpaceAmbient()) {
    spaceAmbientAudio.play().catch(() => {});
    satelitAmbientAudio.play().catch(() => {});
    return;
  }

  spaceAmbientAudio.pause();
  satelitAmbientAudio.pause();
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  10000,
);

const renderer = new THREE.WebGLRenderer({ antialias: true, canvas: canvas });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000);

let isWebglContextLost = false;
let isRenderLoopRunning = false;
let isEarthViewActive = true;

function stopRenderLoop() {
  if (!isRenderLoopRunning) {
    return;
  }

  renderer.setAnimationLoop(null);
  isRenderLoopRunning = false;
}

function startRenderLoop() {
  if (isRenderLoopRunning || isWebglContextLost || !isEarthViewActive) {
    return;
  }

  renderer.setAnimationLoop(animate);
  isRenderLoopRunning = true;
}

if (canvas) {
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    isWebglContextLost = true;
    stopRenderLoop();
    updateSpaceAmbientPlayback();
    console.warn("WebGL context lost. Pausing render loop.");
  });

  canvas.addEventListener("webglcontextrestored", () => {
    isWebglContextLost = false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000);
    startRenderLoop();
    updateSpaceAmbientPlayback();
    console.info("WebGL context restored. Render loop resumed.");
  });
}

window.addEventListener("generated-canvas-opened", () => {
  isEarthViewActive = false;
  stopRenderLoop();
  updateSpaceAmbientPlayback();
  hidePingHoverLabel();
  applyConstructionSelection();
});

window.addEventListener("generated-canvas-closed", () => {
  isEarthViewActive = true;
  startRenderLoop();
  updateSpaceAmbientPlayback();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopRenderLoop();
    updateSpaceAmbientPlayback();
    return;
  }

  startRenderLoop();
  updateSpaceAmbientPlayback();
});

const unlockSpaceAmbient = () => {
  updateSpaceAmbientPlayback();
};

window.addEventListener("click", unlockSpaceAmbient, { once: true });
window.addEventListener("keydown", unlockSpaceAmbient, { once: true });
window.addEventListener("touchstart", unlockSpaceAmbient, { once: true });

preloadWorkflow().catch((error) => {
  console.error("Error preloading workflow:", error);
});

initWebcam().catch((error) => {
  console.error("Error preloading webcam:", error);
});
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const pings = [];
let lastHoveredPingMesh = null;
let pingHoverLabel = null;
let pingHoverLabelText = "";
let pingHoverTypeTimer = null;
const progressionFillElement = document.querySelector(
  "#progression-fill, #progression_fill, .progression_fill",
);
const progressionBarElement = document.querySelector(".progression_bar");

function renderProgressionDividers(segmentCount) {
  if (!progressionBarElement) {
    return;
  }

  progressionBarElement
    .querySelectorAll(".progression-divider")
    .forEach((divider) => divider.remove());

  const safeSegmentCount = Math.max(segmentCount, 1);

  for (let index = 1; index < safeSegmentCount; index += 1) {
    const divider = document.createElement("span");
    divider.className = "progression-divider";
    divider.style.left = `${(index / safeSegmentCount) * 100}%`;
    progressionBarElement.appendChild(divider);
  }
}

function getPingHoverLabel() {
  if (pingHoverLabel) {
    return pingHoverLabel;
  }

  const label = document.createElement("div");
  label.id = "ping-hover-label";
  label.style.opacity = "0";
  document.body.appendChild(label);
  pingHoverLabel = label;
  return label;
}

function hidePingHoverLabel() {
  if (!pingHoverLabel) {
    return;
  }

  pingHoverLabel.style.opacity = "0";
  pingHoverLabel.textContent = "";
  pingHoverLabelText = "";
  if (pingHoverTypeTimer) {
    clearTimeout(pingHoverTypeTimer);
    pingHoverTypeTimer = null;
  }
}

function setPingHoverLabelText(text) {
  const label = getPingHoverLabel();
  const nextText = String(text || "").trim();
  if (!nextText || nextText === pingHoverLabelText) {
    return;
  }

  pingHoverLabelText = nextText;
  label.textContent = "";
  if (pingHoverTypeTimer) {
    clearTimeout(pingHoverTypeTimer);
    pingHoverTypeTimer = null;
  }

  let index = 0;
  const step = () => {
    if (index >= nextText.length) {
      pingHoverTypeTimer = null;
      return;
    }

    label.textContent += nextText[index];
    index += 1;
    pingHoverTypeTimer = window.setTimeout(step, 12);
  };

  step();
}

function positionPingHoverLabel(mesh) {
  if (!mesh) {
    return;
  }

  const label = getPingHoverLabel();
  const worldPosition = new THREE.Vector3();
  mesh.getWorldPosition(worldPosition);
  worldPosition.project(camera);

  const screenX = (worldPosition.x * 0.5 + 0.5) * window.innerWidth;
  const screenY = (-worldPosition.y * 0.5 + 0.5) * window.innerHeight;
  const offsetX = 18;
  const offsetY = -8;

  label.style.transform = `translate(${Math.round(screenX + offsetX)}px, ${Math.round(screenY + offsetY)}px)`;
  label.style.opacity = "1";
}
let finishClickCount = 0;
let progression = 0;
let isEndMessageDismissed = false;
let isProgressionForcedComplete = false;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false;
controls.minDistance = 0.1;
controls.maxDistance = 1000;
//document.body.appendChild(renderer.domElement);

let loadedEarth = null;
let earthTiltGroup = null;

const fbxLoader = new FBXLoader();
const textureLoader = new THREE.TextureLoader();
let earthMaterial = null;
let earthTextureCanvas = null;
let earthTextureCtx = null;
let earthTextureMap = null;
const pendingEarthMarks = [];
const globalScale = 0.5;
const fixedCameraDistance = 200;
const earthLongitudeOffset = 90;
const earthTextureLongitudeOffset = 0;
const earthTiltDegrees = 23.5;
const colorPing = 0xff4040;
const hoverColorPing = 0x3399ff;
const reflectionStrength = 0.01;
const starCount = 3000;
const starMinDistance = 1200;
const starMaxDistance = 4000;
const starSize = 1.8;
const starRotationSpeed = 0.0002;

function initEarthTextureCanvas(texture, material) {
  if (!texture?.image || !material) {
    return;
  }

  earthTextureCanvas = document.createElement("canvas");
  earthTextureCanvas.width = texture.image.width || 1;
  earthTextureCanvas.height = texture.image.height || 1;
  earthTextureCtx = earthTextureCanvas.getContext("2d");
  if (!earthTextureCtx) {
    return;
  }

  earthTextureCtx.drawImage(texture.image, 0, 0);
  earthTextureMap = new THREE.CanvasTexture(earthTextureCanvas);
  if (texture.colorSpace) {
    earthTextureMap.colorSpace = texture.colorSpace;
  }
  earthTextureMap.needsUpdate = true;
  material.map = earthTextureMap;
  material.needsUpdate = true;

  if (pendingEarthMarks.length > 0) {
    const queued = pendingEarthMarks.splice(0, pendingEarthMarks.length);
    queued.forEach(({ lat, lon }) => drawEarthStamp(lat, lon));
  }
}

function drawEarthStamp(lat, lon) {
  if (!earthTextureCtx || !earthTextureCanvas || !earthTextureMap) {
    return;
  }

  if (typeof lat !== "number" || typeof lon !== "number") {
    return;
  }

  const adjustedLon = lon + earthTextureLongitudeOffset;
  const wrappedLon = ((adjustedLon + 180) % 360 + 360) % 360;
  const u = wrappedLon / 360;
  const v = (90 - lat) / 180;
  const x = u * earthTextureCanvas.width;
  const y = v * earthTextureCanvas.height;
  const radius = Math.max(12, earthTextureCanvas.width * 0.03);

  earthTextureCtx.save();
  earthTextureCtx.globalCompositeOperation = "source-over";

  const gradient = earthTextureCtx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, "rgba(180, 180, 180, 0.95)");
  gradient.addColorStop(0.6, "rgba(180, 180, 180, 0.6)");
  gradient.addColorStop(1, "rgba(180, 180, 180, 0)");
  earthTextureCtx.fillStyle = gradient;
  earthTextureCtx.beginPath();
  earthTextureCtx.arc(x, y, radius, 0, Math.PI * 2);
  earthTextureCtx.fill();

  if (x < radius) {
    earthTextureCtx.beginPath();
    earthTextureCtx.arc(x + earthTextureCanvas.width, y, radius, 0, Math.PI * 2);
    earthTextureCtx.fill();
  } else if (x > earthTextureCanvas.width - radius) {
    earthTextureCtx.beginPath();
    earthTextureCtx.arc(x - earthTextureCanvas.width, y, radius, 0, Math.PI * 2);
    earthTextureCtx.fill();
  }

  earthTextureCtx.restore();
  earthTextureMap.needsUpdate = true;
}

function addEarthStamp(lat, lon) {
  if (!earthTextureCtx || !earthTextureCanvas || !earthTextureMap) {
    pendingEarthMarks.push({ lat, lon });
    return;
  }

  drawEarthStamp(lat, lon);
}

function createStars(
  count = starCount,
  minDistance = starMinDistance,
  maxDistance = starMaxDistance,
) {
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const radius = THREE.MathUtils.lerp(
      minDistance,
      maxDistance,
      Math.random(),
    );

    const sinPhi = Math.sin(phi);
    positions[i * 3] = radius * sinPhi * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * sinPhi * Math.sin(theta);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: starSize,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.9,
  });

  return new THREE.Points(geometry, material);
}

const stars = createStars();
scene.add(stars);

function updateProgression() {
  const pinsCount = pings.length;
  progression = isProgressionForcedComplete
    ? 1
    : pinsCount > 0
      ? finishClickCount / pinsCount
      : 0;

  if (progressionFillElement) {
    const clampedProgress = THREE.MathUtils.clamp(progression, 0, 1);
    progressionFillElement.style.width = `${clampedProgress * 100}%`;
    console.log(`Progression: ${(clampedProgress * 100).toFixed(2)}%`);
  }
  if (progression >= 1 && !isEndMessageDismissed) {
    endMessageElement.style.display = "block";
  } else {
    endMessageElement.style.display = "none";
  }

  if (restartButton) {
    restartButton.style.display = progression >= 1 ? "block" : "none";
  }
}

updateProgression();

function setReflectionStrength(material, strength = 0.5) {
  const clampedStrength = THREE.MathUtils.clamp(strength, 0, 1);
  const materials = Array.isArray(material) ? material : [material];

  for (const currentMaterial of materials) {
    if (!currentMaterial) {
      continue;
    }

    if ("shininess" in currentMaterial) {
      currentMaterial.shininess = THREE.MathUtils.lerp(5, 120, clampedStrength);
    }

    if (
      "specular" in currentMaterial &&
      currentMaterial.specular &&
      typeof currentMaterial.specular.setScalar === "function"
    ) {
      currentMaterial.specular.setScalar(
        THREE.MathUtils.lerp(0.05, 0.8, clampedStrength),
      );
    }

    if ("roughness" in currentMaterial) {
      currentMaterial.roughness = THREE.MathUtils.lerp(1, 0.1, clampedStrength);
    }

    if ("metalness" in currentMaterial) {
      currentMaterial.metalness = THREE.MathUtils.lerp(
        0,
        0.35,
        clampedStrength,
      );
    }

    currentMaterial.needsUpdate = true;
  }
}

const pingLocations = [
  {
    name: "Sahara Desert",
    latitude: 24.495777322023212,
    longitude: 12.990920566044199,
    color: colorPing,
    environnemental: "Desert Sahara",
    panelInfo: {
      title: "SAHARA DESERT   |   23°N 13°E",
      body: [
        "ERG & REG — ALGERIA / NIGER",
        "9,200,000 KM²",
        "RAINFALL: 25 MM/YEAR",
        "MAX TEMP: 58°C / MIN TEMP: −6°C",
        "ALT: 200–3,415 M",
        "SOIL TYPE: SANDY / GRAVEL",
        "BIODIVERSITY INDEX: 2.1 / 10",
        "ENDEMIC SPECIES: 9",
        "STATUS: UNPROTECTED",
        "THREAT: SOLAR FARM DEVELOPMENT",
      ],
    },
  },
  {
    name: "Amazonas",
    latitude: -3.4650588480403606,
    longitude: -62.21607226123021,
    color: colorPing,
    environnemental: "Rainforest",
    panelInfo: {
      title: "AMAZON RAINFOREST   |   3°S 60°W",
      body: [
        "TROPICAL FOREST — BRAZIL",
        "5,500,000 KM²",
        "RAINFALL: 2,300 MM/YEAR",
        "MAX TEMP: 34°C / MIN TEMP: 18°C",
        "ALT: 50–500 M",
        "SOIL TYPE: LATERITE / CLAY",
        "BIODIVERSITY INDEX: 9.8 / 10",
        "ENDEMIC SPECIES: 40,000+",
        "STATUS: PARTIALLY PROTECTED",
        "THREAT: DEFORESTATION / AGRIBUSINESS",
      ],
    },
  },
  {
    name: "Antarctica",
    latitude: -72.51455134654627,
    longitude: 132.97852379415448,
    color: colorPing,
    environnemental: "Polar",
    panelInfo: {
      title: "ANTARCTICA   |   90°S 0°E",
      body: [
        "ICE DESERT — SOUTH POLE",
        "14,200,000 KM²",
        "SNOWFALL: 166 MM/YEAR",
        "MAX TEMP: −12°C / MIN TEMP: −89°C",
        "ALT: 0–4,892 M",
        "SOIL TYPE: PERMANENT ICE SHEET",
        "BIODIVERSITY INDEX: 1.4 / 10",
        "ENDEMIC SPECIES: 235",
        "STATUS: INTL. TREATY — ANTARCTIC ACT 1959",
        "THREAT: CLIMATE CHANGE / MINING CLAIMS",
      ],
    },
  },
  {
    name: "Swiss Alps",
    latitude: 46.35443099538415,
    longitude: 7.360406506270741,
    color: colorPing,
    environnemental: "Mountain",
    panelInfo: {
      title: "THE ALPS   |   45°N 7°E",
      body: [
        "MOUNTAIN RANGE — CENTRAL EUROPE",
        "190,000 KM²",
        "RAINFALL: 1,500 MM/YEAR",
        "MAX TEMP: 25°C / MIN TEMP: −30°C",
        "ALT: 200–4,808 M",
        "SOIL TYPE: ALPINE / ROCKY",
        "BIODIVERSITY INDEX: 7.1 / 10",
        "ENDEMIC SPECIES: 4,500+",
        "STATUS: PARTIALLY PROTECTED",
        "THREAT: RESORT OVERDEVELOPMENT",
      ],
    },
  },
  {
    name: "Nez Perce-Clearwater National Forests",
    latitude: 46.18653679699062,
    longitude: -115.35479191268243,
    color: colorPing,
    environnemental: "Forest USA",
    panelInfo: {
      title: "YELLOWSTONE   |   44°N 110°W",
      body: [
        "BOREAL FOREST — USA",
        "898,317 HA",
        "RAINFALL: 560 MM/YEAR",
        "MAX TEMP: 30°C / MIN TEMP: −40°C",
        "ALT: 1,610–3,462 M",
        "SOIL TYPE: VOLCANIC / GEOTHERMAL",
        "BIODIVERSITY INDEX: 8.4 / 10",
        "ENDEMIC SPECIES: 10,000+",
        "STATUS: NATIONAL PARK — EST. 1872",
        "THREAT: GEOTHERMAL EXPLOITATION",
      ],
    },
  },
  {
    name: "Parque Nacional Iberá",
    latitude: -28.33961206972365,
    longitude: -57.32889718284382,
    color: colorPing,
    environnemental: "Forest",
    panelInfo: {
      title: "PATAGONIA   |   49°S 72°W",
      body: [
        "STEPPE & GLACIERS — ARGENTINA",
        "1,043,000 KM²",
        "RAINFALL: 200 MM/YEAR",
        "MAX TEMP: 22°C / MIN TEMP: −22°C",
        "ALT: 0–3,375 M",
        "SOIL TYPE: GLACIAL / STEPPE",
        "BIODIVERSITY INDEX: 6.3 / 10",
        "ENDEMIC SPECIES: 1,800+",
        "STATUS: PARTIALLY PROTECTED",
        "THREAT: LITHIUM MINING / WIND FARMS",
      ],
    },
  },
  {
    name: "Khatgal, Mongolia",
    latitude: 50.81892827683729,
    longitude: 99.84958212036852,
    color: colorPing,
    environnemental: "Desert mountain",
    panelInfo: {
      title: "GOBI DESERT   |   46°N 105°E",
      body: [
        "ARID ZONE — MONGOLIA / CHINA",
        "1,295,000 KM²",
        "RAINFALL: 194 MM/YEAR",
        "MAX TEMP: 45°C / MIN TEMP: −40°C",
        "ALT: 900–1,500 M",
        "SOIL TYPE: ROCKY / SANDY",
        "BIODIVERSITY INDEX: 3.2 / 10",
        "ENDEMIC SPECIES: 14",
        "STATUS: UNPROTECTED",
        "THREAT: MINING EXPANSION",
      ],
    },
  },
  {
    name: "Mount Kailash, Tibet",
    latitude: 33.18626739090745,
    longitude: 88.8335682436747,
    color: colorPing,
    environnemental: "Mount",
    panelInfo: {
      title: "MOUNT KAILASH   |   31°N 81°E",
      body: [
        "SACRED HIMALAYA — TIBET",
        "2,000 KM²",
        "RAINFALL: 150 MM/YEAR",
        "MAX TEMP: 10°C / MIN TEMP: −25°C",
        "ALT: 4,500–6,638 M",
        "SOIL TYPE: PERMAFROST / ROCK",
        "BIODIVERSITY INDEX: 5.9 / 10",
        "ENDEMIC SPECIES: 600+",
        "STATUS: SACRED ZONE — NO ASCENT PERMITTED",
        "THREAT: TOURIST INFRASTRUCTURE",
      ],
    },
  },
  {
    name: "Mugie Wildlife Conservancy, Kenya",
    latitude: 0.7345323390344389,
    longitude: 36.629661633279454,
    color: colorPing,
    environnemental: "Savannah",
    panelInfo: {
      title: "KENYA SAVANNA   |   1°S 37°E",
      body: [
        "TROPICAL SAVANNA — KENYA",
        "580,000 KM²",
        "RAINFALL: 630 MM/YEAR",
        "MAX TEMP: 35°C / MIN TEMP: 10°C",
        "ALT: 0–5,199 M",
        "SOIL TYPE: SAVANNA / CLAY",
        "BIODIVERSITY INDEX: 9.1 / 10",
        "MAMMAL SPECIES: 389",
        "STATUS: NATURE RESERVE",
        "THREAT: POACHING / RESORT EXPANSION",
      ],
    },
  },
  {
    name: "Neom Bay, Saudi Arabia",
    latitude: 28.65241394358527,
    longitude: 35.31125930979096,
    color: colorPing,
    environnemental: "Desert",
    panelInfo: {
      title: "NEOM — TABUK REGION   |   28°N 35°E",
      body: [
        "ARID COAST — SAUDI ARABIA",
        "SURFACE: 26,500 KM² | RAINFALL: 30 MM/YEAR",
        "MAX TEMP: 47°C / MIN TEMP: 5°C",
        "BIODIVERSITY: 4.8/10 | COASTAL SPECIES: 1,200+",
        "STATUS: DEVELOPMENT ZONE | THREAT: MEGA PROJECT CONSTRUCTION",
        "ALT: 0–2,500 M | SOIL TYPE: DESERT / CORAL COAST",
      ],
    },
  },
];

if (progressionBarElement) {
  progressionBarElement.style.setProperty(
    "--progression-segments",
    String(Math.max(pingLocations.length, 1)),
  );
}
renderProgressionDividers(pingLocations.length);

fbxLoader.load("Earth.fbx", (object) => {
  loadedEarth = object;
  //loadedEarth.scale.set(globalScale, globalScale, globalScale);

  earthTiltGroup = new THREE.Group();
  earthTiltGroup.rotation.z = THREE.MathUtils.degToRad(earthTiltDegrees);
  earthTiltGroup.add(object);

  earthMaterial = object.children[0]?.material || null;
  const earthTexture = textureLoader.load("1_earth_8kv2.jpg", (texture) => {
    initEarthTextureCanvas(texture, earthMaterial);
  });
  if (earthMaterial) {
    earthMaterial.map = earthTexture;
    setReflectionStrength(earthMaterial, reflectionStrength);
  }
  scene.add(earthTiltGroup);

  // Auto-fit camera to model
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  scene.position.sub(center);
  loadedEarth.position.sub(center);

  camera.position.z = fixedCameraDistance;
  controls.target.set(0, 0, 0);
  controls.update();

  const earthRadius = Math.max(size.x, size.y, size.z) * 0.5 * 1.04;

  for (const location of pingLocations) {
    const ping = Ping.fromLatLon(
      location.latitude,
      location.longitude,
      earthRadius,
      earthRadius * 0.02,
      location.color,
      earthLongitudeOffset,
      hoverColorPing,
      location,
    );

    ping.zoomIn(camera, controls, 1000, 2, () => {
      addEarthStamp(location.latitude, location.longitude);
      finishClickCount += 1;
      updateProgression();
    });
    pings.push(ping);
    loadedEarth.add(ping.mesh);
  }

  updateProgression();
});

// Lighting
const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(5, 0, 5);
scene.add(light);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.05);
scene.add(ambientLight);

function animate() {
  if (isWebglContextLost) {
    return;
  }

  controls.update();
  if (stars) {
    stars.rotation.y += starRotationSpeed;
  }
  if (loadedEarth) {
    loadedEarth.rotation.y += 0.001;
    const isAnyPingZooming = pings.some((ping) => ping.isZoomTransitioning);

    raycaster.setFromCamera(pointer, camera);
    const pingMeshes = pings.map((ping) => ping.mesh);
    const intersections = raycaster.intersectObjects(pingMeshes, false);
    const hoveredMesh =
      intersections.length > 0 ? intersections[0].object : null;

    if (hoveredMesh && hoveredMesh !== lastHoveredPingMesh) {
      playHoverAudio();
    }

    if (hoveredMesh !== lastHoveredPingMesh) {
      window.dispatchEvent(
        new CustomEvent("ping-hover-changed", {
          detail: { isHovering: Boolean(hoveredMesh) },
        }),
      );
    }

    lastHoveredPingMesh = hoveredMesh;

    if (hoveredMesh) {
      const info = hoveredMesh.userData?.info;
      const title = info?.panelInfo?.title || info?.name || "Location";
      setPingHoverLabelText(title);
      positionPingHoverLabel(hoveredMesh);
    } else {
      hidePingHoverLabel();
    }

    for (const ping of pings) {
      ping.setHovered(ping.mesh === hoveredMesh);

      if (ping.isCameraZoomed) {
        ping.cameraFollow(camera, controls);
      }
    }
  }
  renderer.render(scene, camera);
}

startRenderLoop();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener("pointermove", (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
});

document.addEventListener("mouseover", (event) => {
  const targetButton = event.target?.closest?.("button");
  if (!targetButton) {
    return;
  }

  const previousButton = event.relatedTarget?.closest?.("button");
  if (previousButton === targetButton) {
    return;
  }

  playHoverAudio();
});

document.addEventListener("click", (event) => {
  const constructionButton = event.target?.closest?.(
    "#default-building, #luxe-building, #suburbs-building, #industrial-building",
  );

  if (!constructionButton) {
    return;
  }

  setActiveConstructionButton(constructionButton.id);

  constructionAudio.currentTime = 0;
  constructionAudio.play().catch(() => {});
});

window.addEventListener("click", () => {
  if (pings.some((ping) => ping.isZoomTransitioning)) {
    return;
  }

  raycaster.setFromCamera(pointer, camera);
  const pingMeshes = pings.map((ping) => ping.mesh);
  const intersections = raycaster.intersectObjects(pingMeshes, false);

  if (intersections.length === 0) {
    return;
  }

  const clickedMesh = intersections[0].object;
  const callback = clickedMesh.userData.onClick;
  if (typeof callback === "function") {
    selectionAudio.currentTime = 0;
    selectionAudio.volume = 0.5;
    selectionAudio.play().catch(() => {});
    callback();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "b") {
    for (const ping of pings) {
      ping.zoomOut(camera, controls, 500);
    }
  }
});

if (closeEndMessageButton && endMessageElement) {
  closeEndMessageButton.addEventListener("click", () => {
    backAudio.currentTime = 0;
    backAudio.play().catch(() => {});
    isEndMessageDismissed = true;
    endMessageElement.style.display = "none";
  });
}

if (startMessageElement) {
  startMessageElement.style.display = "block";
}

if (closeStartMessageButton && startMessageElement) {
  closeStartMessageButton.addEventListener("click", () => {
    backAudio.currentTime = 0;
    backAudio.play().catch(() => {});
    startMessageElement.style.display = "none";
  });
}

if (restartButton) {
  restartButton.addEventListener("click", () => {
    window.location.reload();
  });
}

const isInDevelopment = true;
window.addEventListener("keydown", (event) => {
  if (isInDevelopment && event.key.toLowerCase() === "p") {
    isProgressionForcedComplete = true;
    updateProgression();
  }
});
