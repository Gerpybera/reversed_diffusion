import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/Addons.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import Ping from "./ping.js";
import { preloadWorkflow } from "./api.js";
//import { initWebcam } from "./webcam.js";

const canvas = document.getElementById("canvas");
const endMessageElement = document.getElementById("message");
const closeEndMessageButton = document.getElementById("close_message");
const restartButton = document.getElementById("restart-button");

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  10000,
);

const renderer = new THREE.WebGLRenderer({ antialias: true, canvas: canvas });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000);

preloadWorkflow().catch((error) => {
  console.error("Error preloading workflow:", error);
});

/*
initWebcam().catch((error) => {
  console.error("Error preloading webcam:", error);
});
*/
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const pings = [];
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
const globalScale = 0.5;
const fixedCameraDistance = 200;
const earthLongitudeOffset = 90;
const earthTiltDegrees = 23.5;
const colorPing = 0xff4040;
const hoverColorPing = 0x3399ff;
const reflectionStrength = 0.01;
const starCount = 3000;
const starMinDistance = 1200;
const starMaxDistance = 4000;

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
    size: 1,
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
    environnemental: "Desert",
  },
  {
    name: "Amazonas",
    latitude: -3.4650588480403606,
    longitude: -62.21607226123021,
    color: colorPing,
    environnemental: "Rainforest",
  },
  {
    name: "Antarctica",
    latitude: -72.51455134654627,
    longitude: 132.97852379415448,
    color: colorPing,
    environnemental: "Polar",
  },
  {
    name: "Swiss Alps",
    latitude: 46.35443099538415,
    longitude: 7.360406506270741,
    color: colorPing,
    environnemental: "Mountain",
  },
  {
    name: "Nez Perce-Clearwater National Forests",
    latitude: 46.18653679699062,
    longitude: -115.35479191268243,
    color: colorPing,
    environnemental: "Forest",
  },
  {
    name: "Parque Nacional Iberá",
    latitude: -28.33961206972365,
    longitude: -57.32889718284382,
    color: colorPing,
    environnemental: "Forest",
  },
  {
    name: "Khatgal, Mongolia",
    latitude: 50.81892827683729,
    longitude: 99.84958212036852,
    color: colorPing,
    environnemental: "Mountain",
  },
  {
    name: "Mount Kailash, Tibet",
    latitude: 33.18626739090745,
    longitude: 88.8335682436747,
    color: colorPing,
    environnemental: "Mountain",
  },
  {
    name: "Mugie Wildlife Conservancy, Kenya",
    latitude: 0.7345323390344389,
    longitude: 36.629661633279454,
    color: colorPing,
    environnemental: "Savannah",
  },
  {
    name: "Svalbard, Norway",
    latitude: 79.89499148912479,
    longitude: 24.04334737393937,
    color: colorPing,
    environnemental: "Polar",
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

  const earthTexture = textureLoader.load("1_earth_8k.jpg");
  object.children[0].material.map = earthTexture;
  setReflectionStrength(object.children[0].material, reflectionStrength);
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

  const earthRadius = Math.max(size.x, size.y, size.z) * 0.5 * 1.01;

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

    ping.mesh.lookAt(0, 0, 0);
    ping.zoomIn(camera, controls, 1000, 2, () => {
      finishClickCount += 1;
      updateProgression();
    });
    pings.push(ping);
    loadedEarth.add(ping.mesh);
  }

  updateProgression();
});

// Lighting
const light = new THREE.DirectionalLight(0xffffff, 1.5);
light.position.set(5, 0, 5);
scene.add(light);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
scene.add(ambientLight);

function animate() {
  controls.update();
  if (loadedEarth) {
    loadedEarth.rotation.y += 0.001;
    const isAnyPingZooming = pings.some((ping) => ping.isZoomTransitioning);

    raycaster.setFromCamera(pointer, camera);
    const pingMeshes = pings.map((ping) => ping.mesh);
    const intersections = raycaster.intersectObjects(pingMeshes, false);
    const hoveredMesh =
      intersections.length > 0 ? intersections[0].object : null;
    document.body.style.cursor =
      !isAnyPingZooming && hoveredMesh ? "pointer" : "default";

    for (const ping of pings) {
      ping.setHovered(ping.mesh === hoveredMesh);

      if (ping.isCameraZoomed) {
        ping.cameraFollow(camera, controls);
      }
    }
  }
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

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
    isEndMessageDismissed = true;
    endMessageElement.style.display = "none";
  });
}

if (restartButton) {
  restartButton.addEventListener("click", () => {
    window.location.reload();
  });
}

const isInDevelopment = false;
window.addEventListener("keydown", (event) => {
  if (isInDevelopment && event.key.toLowerCase() === "p") {
    isProgressionForcedComplete = true;
    updateProgression();
  }
});
