import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { createUnitreeG1Model } from './unitree-g1.js';

const canvas = document.getElementById('scene');
const timeline = document.getElementById('timeline');
const playButton = document.getElementById('playButton');
const taskSelect = document.getElementById('taskSelect');
const episodeSelect = document.getElementById('episodeSelect');
const prevEpisodeButton = document.getElementById('prevEpisodeButton');
const nextEpisodeButton = document.getElementById('nextEpisodeButton');
const datasetLabel = document.getElementById('datasetLabel');
const sourceLabel = document.getElementById('sourceLabel');
const frameIdLabel = document.getElementById('frameId');
const robotTypeLabel = document.getElementById('robotType');
const episodeLabel = document.getElementById('episodeLabel');
const speedLabel = document.getElementById('speedLabel');
const jointSummary = document.getElementById('jointSummary');
const jointBars = document.getElementById('jointBars');
const jointStatus = document.getElementById('jointStatus');
const imuSummary = document.getElementById('imuSummary');
const imuCanvas = document.getElementById('imuCanvas');
const imuStatus = document.getElementById('imuStatus');
const pressureSummary = document.getElementById('pressureSummary');
const pressureStrip = document.getElementById('pressureStrip');
const pressureStatus = document.getElementById('pressureStatus');
const odometrySummary = document.getElementById('odometrySummary');
const odometryStatus = document.getElementById('odometryStatus');
const rgbSummary = document.getElementById('rgbSummary');
const rgbStatus = document.getElementById('rgbStatus');
const depthSummary = document.getElementById('depthSummary');
const depthStatus = document.getElementById('depthStatus');
const lidarSummary = document.getElementById('lidarSummary');
const lidarStatus = document.getElementById('lidarStatus');
const traceMap = document.getElementById('traceMap');
const timeLabel = document.getElementById('timeLabel');
const queryLabel = document.getElementById('queryLabel');
const sensorModal = document.getElementById('sensorModal');
const sensorModalBackdrop = document.getElementById('sensorModalBackdrop');
const sensorModalClose = document.getElementById('sensorModalClose');
const sensorModalPlay = document.getElementById('sensorModalPlay');
const sensorModalTitle = document.getElementById('sensorModalTitle');
const sensorModalSubtitle = document.getElementById('sensorModalSubtitle');
const sensorChartCanvas = document.getElementById('sensorChartCanvas');
const sensorChartLegend = document.getElementById('sensorChartLegend');
const sensorButtons = Array.from(document.querySelectorAll('[data-sensor]'));

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x0f1214, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0f1214, 35, 120);

const camera = new THREE.PerspectiveCamera(56, 1, 0.05, 300);
camera.position.set(3.7, -6.4, 3.0);
camera.up.set(0, 0, 1);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.target.set(0, 0, 1.15);
controls.maxPolarAngle = Math.PI * 0.52;

let cameraAutoFollow = true;
const followTarget = new THREE.Vector3(0, 0, 1.15);
controls.addEventListener('start', () => {
  cameraAutoFollow = false;
});

const floor = new THREE.GridHelper(56, 28, 0x34454d, 0x20282d);
floor.rotation.x = Math.PI / 2;
scene.add(floor);

scene.add(new THREE.AmbientLight(0x8fa7b5, 0.85));
const key = new THREE.DirectionalLight(0xffffff, 2.0);
key.position.set(18, -22, 34);
scene.add(key);
const side = new THREE.DirectionalLight(0x22c7a5, 0.8);
side.position.set(-18, 12, 14);
scene.add(side);

const robotRoot = new THREE.Group();
scene.add(robotRoot);
const proceduralMeshes = [];
let unitreeG1Model = null;
let officialRobotVisualReady = false;

const pointGeometry = new THREE.BufferGeometry();
let pointPositionAttribute = null;
let pointColorAttribute = null;
let pointCapacity = 0;
const POINT_MIN_DISTANCE_M = 0.18;
const POINT_MAX_DISTANCE_M = 7.5;
const POINT_MM_THRESHOLD = 100;
const pointCloud = new THREE.Points(
  pointGeometry,
  new THREE.PointsMaterial({ size: 0.035, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.66, depthWrite: false })
);
pointCloud.frustumCulled = false;
robotRoot.add(pointCloud);

const trailGeometry = new THREE.BufferGeometry();
const trail = new THREE.Line(
  trailGeometry,
  new THREE.LineBasicMaterial({ color: 0xf0b84a, transparent: true, opacity: 0.82 })
);
scene.add(trail);
const trailPoints = [];

const imuCtx = imuCanvas.getContext('2d');
const traceCtx = traceMap.getContext('2d');
const sensorChartCtx = sensorChartCanvas.getContext('2d');

const matBody = material(0x22c7a5);
const matLimb = new THREE.MeshStandardMaterial({ color: 0xbfc8ce, metalness: 0.38, roughness: 0.34 });
const matJoint = new THREE.MeshStandardMaterial({ color: 0xf0b84a, emissive: 0x3b2600, emissiveIntensity: 0.18, metalness: 0.42, roughness: 0.28 });
const matHead = material(0x79b8ff);
const matArmor = new THREE.MeshStandardMaterial({ color: 0x252d33, metalness: 0.58, roughness: 0.25 });
const matShell = new THREE.MeshStandardMaterial({ color: 0xe7eef1, metalness: 0.22, roughness: 0.28 });
const matShellTeal = new THREE.MeshStandardMaterial({ color: 0x20b9a4, emissive: 0x062f2a, emissiveIntensity: 0.18, metalness: 0.38, roughness: 0.24 });
const matGraphite = new THREE.MeshStandardMaterial({ color: 0x11191d, metalness: 0.58, roughness: 0.24 });
const matRubber = new THREE.MeshStandardMaterial({ color: 0x070b0d, metalness: 0.12, roughness: 0.62 });
const matVisor = new THREE.MeshStandardMaterial({ color: 0x0a1720, emissive: 0x2c95ff, emissiveIntensity: 0.55, metalness: 0.18, roughness: 0.2 });
const matSensor = new THREE.MeshStandardMaterial({ color: 0xffcf6a, emissive: 0x7d4c0a, emissiveIntensity: 0.42, metalness: 0.25, roughness: 0.32 });

function material(color) {
  return new THREE.MeshStandardMaterial({ color, metalness: 0.22, roughness: 0.42 });
}

function sphere(name, radius, mat) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), mat);
  mesh.name = name;
  return addProceduralMesh(mesh);
}

function bone(name, radius, mat) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, 0.72, 8, 18), mat);
  mesh.name = name;
  return addProceduralMesh(mesh);
}

function capsulePart(name, radius, length, mat) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 8, 20), mat);
  mesh.name = name;
  return addProceduralMesh(mesh);
}

function cylinderPart(name, radiusTop, radiusBottom, height, mat) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 28), mat);
  mesh.name = name;
  return addProceduralMesh(mesh);
}

function boxPart(name, sx, sy, sz, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  mesh.name = name;
  return addProceduralMesh(mesh);
}

function shellPart(name, radius, mat) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 18), mat);
  mesh.name = name;
  return addProceduralMesh(mesh);
}

function addProceduralMesh(mesh) {
  proceduralMeshes.push(mesh);
  robotRoot.add(mesh);
  return mesh;
}

function setProceduralVisible(visible) {
  for (let i = 0; i < proceduralMeshes.length; i++) {
    proceduralMeshes[i].visible = !!visible;
  }
}

const jointMeshes = {};
[
  'pelvis', 'chest', 'neck', 'head',
  'leftShoulder', 'leftElbow', 'leftWrist',
  'rightShoulder', 'rightElbow', 'rightWrist',
  'leftHip', 'leftKnee', 'leftAnkle',
  'rightHip', 'rightKnee', 'rightAnkle'
].forEach(name => {
  jointMeshes[name] = sphere(name, name === 'head' ? 0.16 : 0.073, name === 'head' ? matHead : matJoint);
});

const boneMeshes = {};
[
  'spine', 'neck', 'shoulderBar', 'hipBar',
  'leftUpperArm', 'leftForearm', 'rightUpperArm', 'rightForearm',
  'leftThigh', 'leftShin', 'rightThigh', 'rightShin'
].forEach(name => {
  boneMeshes[name] = bone(name, name === 'spine' ? 0.08 : 0.044, name === 'spine' || name === 'shoulderBar' || name === 'hipBar' ? matBody : matLimb);
});

const bodyShell = shellPart('bodyShell', 0.42, matShell);
bodyShell.scale.set(0.66, 0.48, 0.92);
const chestPlate = boxPart('chestPlate', 0.44, 0.075, 0.48, matShellTeal);
const abdomenCore = capsulePart('abdomenCore', 0.15, 0.18, matGraphite);
const backpack = boxPart('backpack', 0.46, 0.12, 0.58, matArmor);
const collarRing = cylinderPart('collarRing', 0.19, 0.21, 0.09, matGraphite);
collarRing.rotation.x = Math.PI / 2;
const pelvisShell = shellPart('pelvisShell', 0.28, matArmor);
pelvisShell.scale.set(1.0, 0.62, 0.5);
const waistRing = cylinderPart('waistRing', 0.25, 0.25, 0.16, matGraphite);
waistRing.rotation.x = Math.PI / 2;
const leftShoulderPad = shellPart('leftShoulderPad', 0.15, matShell);
leftShoulderPad.scale.set(1.15, 0.82, 0.62);
const rightShoulderPad = shellPart('rightShoulderPad', 0.15, matShell);
rightShoulderPad.scale.set(1.15, 0.82, 0.62);
const leftElbowPod = sphere('leftElbowPod', 0.1, matArmor);
const rightElbowPod = sphere('rightElbowPod', 0.1, matArmor);
const leftWristCuff = cylinderPart('leftWristCuff', 0.075, 0.075, 0.12, matGraphite);
const rightWristCuff = cylinderPart('rightWristCuff', 0.075, 0.075, 0.12, matGraphite);
leftWristCuff.rotation.z = Math.PI / 2;
rightWristCuff.rotation.z = Math.PI / 2;
const leftHandMesh = shellPart('leftHand', 0.095, matArmor);
leftHandMesh.scale.set(0.72, 1.0, 0.66);
const rightHandMesh = shellPart('rightHand', 0.095, matArmor);
rightHandMesh.scale.set(0.72, 1.0, 0.66);
const leftKneePod = sphere('leftKneePod', 0.105, matArmor);
const rightKneePod = sphere('rightKneePod', 0.105, matArmor);
const leftAnklePod = sphere('leftAnklePod', 0.08, matGraphite);
const rightAnklePod = sphere('rightAnklePod', 0.08, matGraphite);
const leftFootMesh = boxPart('leftFoot', 0.23, 0.42, 0.085, matRubber);
const rightFootMesh = boxPart('rightFoot', 0.23, 0.42, 0.085, matRubber);
const leftFootToe = boxPart('leftFootToe', 0.22, 0.17, 0.055, matArmor);
const rightFootToe = boxPart('rightFootToe', 0.22, 0.17, 0.055, matArmor);
const headShell = shellPart('headShell', 0.23, matShell);
headShell.scale.set(0.85, 0.72, 0.78);
const visorMesh = boxPart('headVisor', 0.26, 0.055, 0.09, matVisor);
const realsenseBar = boxPart('depthCameraBar', 0.18, 0.038, 0.035, matGraphite);
const leftEyeDot = sphere('leftDepthLens', 0.018, matSensor);
const rightEyeDot = sphere('rightDepthLens', 0.018, matSensor);

function createFingers(prefix, side) {
  const fingers = [];
  for (let i = 0; i < 4; i++) fingers.push(capsulePart(`${prefix}Finger${i}`, 0.012, 0.08, matGraphite));
  const thumb = capsulePart(`${prefix}Thumb`, 0.014, 0.07, matGraphite);
  thumb.rotation.z = side * 0.55;
  fingers.push(thumb);
  return fingers;
}

const leftFingers = createFingers('left', -1);
const rightFingers = createFingers('right', 1);

const sensorPod = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.105, 0.08, 32), matSensor);
sensorPod.rotation.x = Math.PI / 2;
robotRoot.add(sensorPod);

const sensorCone = new THREE.Mesh(
  new THREE.ConeGeometry(1.25, 2.05, 42, 1, true),
  new THREE.MeshBasicMaterial({ color: 0x22c7a5, transparent: true, opacity: 0.035, depthWrite: false })
);
robotRoot.add(sensorCone);

unitreeG1Model = createUnitreeG1Model();
robotRoot.add(unitreeG1Model.root);
unitreeG1Model.ready.then(() => {
  officialRobotVisualReady = true;
  setProceduralVisible(false);
  unitreeG1Model.root.visible = true;
  if (currentPayload) unitreeG1Model.update(currentPayload);
}).catch((err) => {
  officialRobotVisualReady = false;
  setProceduralVisible(true);
  unitreeG1Model.root.visible = false;
  console.warn(err && err.message ? err.message : err);
});

let manifest = null;
let episodeIndex = [];
let taskIndex = [];
let selectedTask = null;
let selectedEpisode = null;
let playing = false;
let currentMs = 0;
let currentFrameFloat = 0;
let minMs = 0;
let maxMs = 0;
let lastTick = performance.now();
let currentPayload = null;
let loadingFrame = false;
let pendingFrameId = -1;
let lastFetchedFrameId = -1;
let lastFrameRequestAt = 0;
let lastFrameAppliedAt = 0;
let lastTraceDrawAt = 0;
let lastPointRequestAt = 0;
let loadingPoints = false;
let currentShownPoints = 0;
let lastQueryMs = 0;
let viewGeneration = 0;
const PLAYBACK_FETCH_INTERVAL_MS = 66;
const POINT_FETCH_INTERVAL_MS = 600;
const FRAME_CACHE_LIMIT = 180;
const SENSOR_HISTORY_LIMIT = 180;
const frameCache = new Map();
const pointCache = new Map();
const sensorHistory = [];
let activeSensorChart = '';
let lastChartDrawAt = 0;

function apiBase() {
  const query = new URLSearchParams(window.location.search).get('apiBase');
  if (query) return query.replace(/\/$/, '');
  if (window.location.pathname.indexOf('/db/tql/') >= 0) return 'http://127.0.0.1:56802';
  return '';
}

const API_BASE = apiBase();

async function json(path) {
  const res = await fetch(`${API_BASE}${path}`);
  return res.json();
}

async function binary(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = res.headers.get('content-type') || '';
  if (contentType.indexOf('application/octet-stream') < 0) throw new Error('binary points unavailable');
  return {
    buffer: await res.arrayBuffer(),
    headers: res.headers
  };
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function fmtCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

function fmtNum(value, digits) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : '--';
}

function fmtDuration(ms) {
  const n = Math.max(0, Number(ms) || 0);
  const seconds = Math.round(n / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}:${String(rest).padStart(2, '0')}` : `${rest}s`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function activeEpisode() {
  if (selectedEpisode) return selectedEpisode;
  return {
    name: 'all episodes',
    frameStart: 0,
    frameEnd: Math.max(0, (manifest && manifest.frameCount || 1) - 1),
    frameCount: manifest && manifest.frameCount || 1,
    minTime: manifest && manifest.minTime || '',
    maxTime: manifest && manifest.maxTime || '',
    durationMs: manifest && manifest.durationMs || 0
  };
}

function vec(x, y, z) {
  return new THREE.Vector3(x, y, z);
}

function jointValue(payload, group, index, fallback) {
  const values = array(payload && payload.joints && payload.joints[group]);
  const n = Number(values[index]);
  return Number.isFinite(n) ? n : fallback;
}

function phase(payload) {
  return Number(payload && payload.frame && payload.frame.frameId || 0) / 30;
}

function poseFromPayload(payload) {
  const t = phase(payload);
  const armSwing = Math.sin(t * 1.8) * 0.32;
  const legSwing = Math.sin(t * 1.8) * 0.28;
  const leftShoulderPitch = jointValue(payload, 'arm', 0, armSwing);
  const rightShoulderPitch = jointValue(payload, 'arm', 7, -armSwing);
  const leftElbow = jointValue(payload, 'arm', 3, -0.72 + Math.sin(t * 1.4) * 0.12);
  const rightElbow = jointValue(payload, 'arm', 10, -0.72 - Math.sin(t * 1.4) * 0.12);
  const leftHipPitch = jointValue(payload, 'leg', 2, legSwing);
  const rightHipPitch = jointValue(payload, 'leg', 8, -legSwing);
  const leftKnee = jointValue(payload, 'leg', 3, -0.5 - Math.cos(t * 1.8) * 0.12);
  const rightKnee = jointValue(payload, 'leg', 9, -0.5 + Math.cos(t * 1.8) * 0.12);
  const torso = jointValue(payload, 'leg', 12, Math.sin(t * 0.8) * 0.04);

  const pelvis = vec(0, 0, 0.95);
  const chest = vec(Math.sin(torso) * 0.08, 0, 1.42);
  const neck = vec(chest.x, 0.02, 1.62);
  const head = vec(chest.x, 0.03, 1.82);
  const leftShoulder = vec(chest.x - 0.32, 0, 1.46);
  const rightShoulder = vec(chest.x + 0.32, 0, 1.46);
  const leftElbowPos = leftShoulder.clone().add(vec(-0.04, Math.sin(leftShoulderPitch) * 0.18, -0.34 * Math.cos(leftShoulderPitch)));
  const rightElbowPos = rightShoulder.clone().add(vec(0.04, Math.sin(rightShoulderPitch) * 0.18, -0.34 * Math.cos(rightShoulderPitch)));
  const leftWrist = leftElbowPos.clone().add(vec(-0.02, Math.sin(leftShoulderPitch + leftElbow) * 0.18, -0.32 * Math.cos(leftShoulderPitch + leftElbow)));
  const rightWrist = rightElbowPos.clone().add(vec(0.02, Math.sin(rightShoulderPitch + rightElbow) * 0.18, -0.32 * Math.cos(rightShoulderPitch + rightElbow)));
  const leftHip = vec(-0.18, 0, 0.9);
  const rightHip = vec(0.18, 0, 0.9);
  const leftKneePos = leftHip.clone().add(vec(0, Math.sin(leftHipPitch) * 0.2, -0.42 * Math.cos(leftHipPitch)));
  const rightKneePos = rightHip.clone().add(vec(0, Math.sin(rightHipPitch) * 0.2, -0.42 * Math.cos(rightHipPitch)));
  const leftAnkle = leftKneePos.clone().add(vec(0, Math.sin(leftHipPitch + leftKnee) * 0.15, -0.42 * Math.cos(leftHipPitch + leftKnee)));
  const rightAnkle = rightKneePos.clone().add(vec(0, Math.sin(rightHipPitch + rightKnee) * 0.15, -0.42 * Math.cos(rightHipPitch + rightKnee)));

  return {
    pelvis, chest, neck, head,
    leftShoulder, leftElbow: leftElbowPos, leftWrist,
    rightShoulder, rightElbow: rightElbowPos, rightWrist,
    leftHip, leftKnee: leftKneePos, leftAnkle,
    rightHip, rightKnee: rightKneePos, rightAnkle
  };
}

function setBone(mesh, a, b) {
  const delta = new THREE.Vector3().subVectors(b, a);
  const length = delta.length();
  mesh.position.copy(a).addScaledVector(delta, 0.5);
  mesh.scale.set(1, Math.max(0.001, length), 1);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
}

function placeFingers(meshes, wrist, side) {
  for (let i = 0; i < 4; i++) {
    const spread = (i - 1.5) * 0.025;
    meshes[i].position.copy(wrist).add(vec(spread, 0.13 + i * 0.006, -0.06));
    meshes[i].rotation.set(0.28, 0.04 * side, spread * 2);
  }
  meshes[4].position.copy(wrist).add(vec(side * 0.07, 0.08, -0.035));
  meshes[4].rotation.set(0.2, 0, side * 0.75);
}

function updateRobot(payload) {
  const frame = payload.frame || {};
  const position = frame.position || {};
  const rotation = frame.rotation || {};
  robotRoot.position.set(Number(position.x || 0), Number(position.y || 0), Number(position.z || 0));
  robotRoot.rotation.set(Number(rotation.roll || 0), Number(rotation.pitch || 0), Number(rotation.yaw || 0));

  const p = poseFromPayload(payload);
  Object.keys(jointMeshes).forEach(name => jointMeshes[name].position.copy(p[name]));
  setBone(boneMeshes.spine, p.pelvis, p.chest);
  setBone(boneMeshes.neck, p.neck, p.head);
  setBone(boneMeshes.shoulderBar, p.leftShoulder, p.rightShoulder);
  setBone(boneMeshes.hipBar, p.leftHip, p.rightHip);
  setBone(boneMeshes.leftUpperArm, p.leftShoulder, p.leftElbow);
  setBone(boneMeshes.leftForearm, p.leftElbow, p.leftWrist);
  setBone(boneMeshes.rightUpperArm, p.rightShoulder, p.rightElbow);
  setBone(boneMeshes.rightForearm, p.rightElbow, p.rightWrist);
  setBone(boneMeshes.leftThigh, p.leftHip, p.leftKnee);
  setBone(boneMeshes.leftShin, p.leftKnee, p.leftAnkle);
  setBone(boneMeshes.rightThigh, p.rightHip, p.rightKnee);
  setBone(boneMeshes.rightShin, p.rightKnee, p.rightAnkle);

  bodyShell.position.copy(p.pelvis).lerp(p.chest, 0.68);
  bodyShell.rotation.set(0.08, 0, 0);
  chestPlate.position.copy(p.pelvis).lerp(p.chest, 0.78).add(vec(0, 0.2, 0.01));
  chestPlate.rotation.set(0.1, 0, 0);
  abdomenCore.position.copy(p.pelvis).lerp(p.chest, 0.36).add(vec(0, 0.02, 0.02));
  abdomenCore.rotation.set(0, 0, Math.sin(phase(payload) * 0.7) * 0.06);
  backpack.position.copy(p.pelvis).lerp(p.chest, 0.68).add(vec(0, -0.18, 0.02));
  backpack.rotation.set(0, 0, 0);
  collarRing.position.copy(p.neck).add(vec(0, 0, -0.07));
  pelvisShell.position.copy(p.pelvis).add(vec(0, 0, -0.02));
  waistRing.position.copy(p.pelvis).add(vec(0, 0, 0.04));
  leftShoulderPad.position.copy(p.leftShoulder).add(vec(-0.045, 0, 0.01));
  rightShoulderPad.position.copy(p.rightShoulder).add(vec(0.045, 0, 0.01));
  leftElbowPod.position.copy(p.leftElbow);
  rightElbowPod.position.copy(p.rightElbow);
  leftWristCuff.position.copy(p.leftWrist).add(vec(0, 0, -0.01));
  rightWristCuff.position.copy(p.rightWrist).add(vec(0, 0, -0.01));
  leftHandMesh.position.copy(p.leftWrist).add(vec(0, 0.03, -0.015));
  rightHandMesh.position.copy(p.rightWrist).add(vec(0, 0.03, -0.015));
  placeFingers(leftFingers, p.leftWrist, -1);
  placeFingers(rightFingers, p.rightWrist, 1);
  leftKneePod.position.copy(p.leftKnee);
  rightKneePod.position.copy(p.rightKnee);
  leftAnklePod.position.copy(p.leftAnkle);
  rightAnklePod.position.copy(p.rightAnkle);
  leftFootMesh.position.copy(p.leftAnkle).add(vec(0, 0.09, -0.045));
  rightFootMesh.position.copy(p.rightAnkle).add(vec(0, 0.09, -0.045));
  leftFootToe.position.copy(p.leftAnkle).add(vec(0, 0.24, -0.04));
  rightFootToe.position.copy(p.rightAnkle).add(vec(0, 0.24, -0.04));
  headShell.position.copy(p.head).add(vec(0, 0.015, 0.005));
  visorMesh.position.copy(p.head).add(vec(0, 0.145, 0.035));
  realsenseBar.position.copy(p.head).add(vec(0, 0.18, -0.025));
  leftEyeDot.position.copy(p.head).add(vec(-0.055, 0.205, -0.023));
  rightEyeDot.position.copy(p.head).add(vec(0.055, 0.205, -0.023));

  sensorPod.position.copy(p.head).add(vec(0, 0.005, 0.22));
  sensorCone.position.copy(p.chest).add(vec(0, 1.02, -0.04));
  if (officialRobotVisualReady && unitreeG1Model) unitreeG1Model.update(payload);
}

function ensurePointCapacity(total) {
  if (pointCapacity >= total && pointPositionAttribute && pointColorAttribute) return;
  pointCapacity = Math.max(1024, Math.pow(2, Math.ceil(Math.log2(Math.max(1, total)))));
  pointPositionAttribute = new THREE.BufferAttribute(new Float32Array(pointCapacity * 3), 3);
  pointColorAttribute = new THREE.BufferAttribute(new Float32Array(pointCapacity * 3), 3);
  pointPositionAttribute.setUsage(THREE.DynamicDrawUsage);
  pointColorAttribute.setUsage(THREE.DynamicDrawUsage);
  pointGeometry.setAttribute('position', pointPositionAttribute);
  pointGeometry.setAttribute('color', pointColorAttribute);
}

function clearPointCloud() {
  pointGeometry.setDrawRange(0, 0);
}

function updatePointCloud(buffer) {
  const view = new DataView(buffer);
  const total = Math.floor(buffer.byteLength / 16);
  ensurePointCapacity(total);
  let maxAbs = 0;
  for (let i = 0; i < total; i++) {
    const offset = i * 16;
    const x = view.getFloat32(offset, true);
    const y = view.getFloat32(offset + 4, true);
    const z = view.getFloat32(offset + 8, true);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    if (Math.abs(x) < 0.0001 && Math.abs(y) < 0.0001 && Math.abs(z) < 0.0001) continue;
    maxAbs = Math.max(maxAbs, Math.abs(x), Math.abs(y), Math.abs(z));
  }
  const scale = maxAbs > POINT_MM_THRESHOLD ? 0.001 : 1;
  const candidates = [];
  for (let i = 0; i < total; i++) {
    const offset = i * 16;
    const rawX = view.getFloat32(offset, true);
    const rawY = view.getFloat32(offset + 4, true);
    const rawZ = view.getFloat32(offset + 8, true);
    const intensity = view.getFloat32(offset + 12, true);
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY) || !Number.isFinite(rawZ)) continue;
    if (Math.abs(rawX) < 0.0001 && Math.abs(rawY) < 0.0001 && Math.abs(rawZ) < 0.0001) continue;
    const x = rawX * scale;
    const y = rawY * scale;
    const z = rawZ * scale;
    const d = Math.sqrt(x * x + y * y + z * z);
    if (d < POINT_MIN_DISTANCE_M || d > POINT_MAX_DISTANCE_M) continue;
    if (z < -0.6 || z > 2.7) continue;
    candidates.push({ x, y, z, d, intensity: Number.isFinite(intensity) ? intensity : 1 });
  }
  if (!candidates.length) {
    pointGeometry.setDrawRange(0, 0);
    return 0;
  }
  const xs = candidates.map(p => p.x).sort((a, b) => a - b);
  const ys = candidates.map(p => p.y).sort((a, b) => a - b);
  const medianX = xs[Math.floor(xs.length / 2)] || 0;
  const medianY = ys[Math.floor(ys.length / 2)] || 0;
  let shown = 0;
  let maxDistance = 0;
  for (let i = 0; i < candidates.length; i++) {
    const p = candidates[i];
    const x = (p.x - medianX) * 0.62;
    const y = (p.y - medianY) * 0.62 + 0.88;
    const z = clamp(p.z * 0.78 + 0.08, 0.04, 2.25);
    const coneWidth = 0.42 + Math.max(0, y) * 0.54;
    if (y < -0.25 || y > 4.2 || Math.abs(x) > coneWidth) continue;
    if (Math.abs(x) < 0.42 && y > -0.18 && y < 0.72 && z > 0.18 && z < 2.2) continue;
    const d = Math.sqrt(x * x + y * y + z * z);
    maxDistance = Math.max(maxDistance, d);
    pointPositionAttribute.array[shown * 3] = x;
    pointPositionAttribute.array[shown * 3 + 1] = y;
    pointPositionAttribute.array[shown * 3 + 2] = z;
    pointColorAttribute.array[shown * 3] = p.intensity;
    shown++;
  }
  const denom = Math.max(0.001, maxDistance);
  for (let i = 0; i < shown; i++) {
    const x = pointPositionAttribute.array[i * 3];
    const y = pointPositionAttribute.array[i * 3 + 1];
    const z = pointPositionAttribute.array[i * 3 + 2];
    const d = Math.sqrt(x * x + y * y + z * z) / denom;
    const floorMix = clamp(1 - z / 1.4, 0, 1);
    pointColorAttribute.array[i * 3] = 0.16 + 0.56 * floorMix + 0.10 * (1 - d);
    pointColorAttribute.array[i * 3 + 1] = 0.50 + 0.36 * (1 - d);
    pointColorAttribute.array[i * 3 + 2] = 0.58 + 0.28 * clamp(z / 2.25, 0, 1);
  }
  pointPositionAttribute.needsUpdate = true;
  pointColorAttribute.needsUpdate = true;
  pointGeometry.setDrawRange(0, shown);
  if (shown > 0) pointGeometry.computeBoundingSphere();
  return shown;
}

function updateTrail(frame) {
  const p = frame.position || {};
  const point = new THREE.Vector3(Number(p.x || 0), Number(p.y || 0), Number(p.z || 0.04));
  if (trailPoints.length === 0 || trailPoints[trailPoints.length - 1].distanceTo(point) > 0.035) {
    trailPoints.push(point);
    if (trailPoints.length > 600) trailPoints.shift();
    trailGeometry.setFromPoints(trailPoints);
  }
}

function drawTrace(frame) {
  const w = traceMap.width;
  const h = traceMap.height;
  traceCtx.clearRect(0, 0, w, h);
  traceCtx.fillStyle = 'rgba(7, 10, 12, 0.72)';
  traceCtx.fillRect(0, 0, w, h);
  traceCtx.strokeStyle = 'rgba(150, 165, 173, 0.22)';
  traceCtx.lineWidth = 1;
  for (let r = 0.25; r <= 1; r += 0.25) {
    traceCtx.beginPath();
    traceCtx.arc(w / 2, h / 2, r * Math.min(w, h) * 0.44, 0, Math.PI * 2);
    traceCtx.stroke();
  }
  const center = frame.position || { x: 0, y: 0 };
  const scale = Math.min(w, h) * 0.44 / 2.2;
  traceCtx.strokeStyle = '#f0b84a';
  traceCtx.lineWidth = 2;
  traceCtx.beginPath();
  for (let i = 0; i < trailPoints.length; i++) {
    const x = w / 2 + (trailPoints[i].x - center.x) * scale;
    const y = h / 2 - (trailPoints[i].y - center.y) * scale;
    if (i === 0) traceCtx.moveTo(x, y);
    else traceCtx.lineTo(x, y);
  }
  traceCtx.stroke();
  traceCtx.fillStyle = '#22c7a5';
  traceCtx.beginPath();
  traceCtx.arc(w / 2, h / 2, 5, 0, Math.PI * 2);
  traceCtx.fill();
}

function drawImu(payload) {
  const w = imuCanvas.width;
  const h = imuCanvas.height;
  const rpy = array(payload.imu && payload.imu.rpy);
  const rotation = payload.frame && payload.frame.rotation || {};
  const roll = Number.isFinite(Number(rpy[0])) ? Number(rpy[0]) : Number(rotation.roll || 0);
  const pitch = Number.isFinite(Number(rpy[1])) ? Number(rpy[1]) : Number(rotation.pitch || 0);
  const yaw = Number.isFinite(Number(rpy[2])) ? Number(rpy[2]) : Number(rotation.yaw || 0);
  imuCtx.clearRect(0, 0, w, h);
  imuCtx.fillStyle = 'rgba(7, 10, 12, 0.72)';
  imuCtx.fillRect(0, 0, w, h);
  imuCtx.save();
  imuCtx.translate(w / 2, h / 2);
  imuCtx.rotate(roll);
  const pitchOffset = clamp(pitch * 80, -24, 24);
  imuCtx.fillStyle = 'rgba(34, 199, 165, 0.28)';
  imuCtx.fillRect(-w, -h + pitchOffset, w * 2, h);
  imuCtx.fillStyle = 'rgba(240, 184, 74, 0.22)';
  imuCtx.fillRect(-w, pitchOffset, w * 2, h);
  imuCtx.strokeStyle = '#eef4f7';
  imuCtx.lineWidth = 2;
  imuCtx.beginPath();
  imuCtx.moveTo(-58, pitchOffset);
  imuCtx.lineTo(58, pitchOffset);
  imuCtx.stroke();
  imuCtx.restore();
  imuCtx.strokeStyle = 'rgba(238, 244, 247, 0.32)';
  imuCtx.beginPath();
  imuCtx.arc(w / 2, h / 2, 28, 0, Math.PI * 2);
  imuCtx.stroke();
  imuSummary.textContent = `r ${fmtNum(roll, 2)} p ${fmtNum(pitch, 2)} y ${fmtNum(yaw, 2)}`;
}

function setBars(values) {
  const selected = values.slice(0, 14);
  while (jointBars.children.length < 14) jointBars.appendChild(document.createElement('i'));
  for (let i = 0; i < 14; i++) {
    const value = Math.abs(Number(selected[i] || 0));
    jointBars.children[i].style.height = `${Math.max(4, Math.min(62, 8 + value * 44))}px`;
  }
}

function setPressure(values) {
  const clean = values.map(Number).filter(Number.isFinite);
  const max = Math.max(1, ...clean.map(v => Math.abs(v)));
  while (pressureStrip.children.length < 22) pressureStrip.appendChild(document.createElement('i'));
  for (let i = 0; i < 22; i++) {
    const value = Math.abs(clean[i] || 0) / max;
    const warm = Math.round(74 + value * 180);
    pressureStrip.children[i].style.background = `rgb(${warm}, ${55 + Math.round(value * 130)}, ${42})`;
  }
  pressureSummary.textContent = clean.length ? `${clean.length} channels` : '--';
}

function setFlag(el, on) {
  el.classList.toggle('on', !!on);
}

function setSensorState(el, active, label) {
  const row = el && el.parentElement;
  if (!row) return;
  row.classList.toggle('active', !!active);
  row.classList.toggle('warn', !active);
  const text = row.querySelector('span');
  if (text) text.textContent = label || (active ? 'active' : 'offline');
}

function hasManifestSensor(name) {
  return !!(manifest && array(manifest.sensors).indexOf(name) >= 0);
}

function markBuiltInSensorStates() {
  setSensorState(jointStatus, hasManifestSensor('joints'), hasManifestSensor('joints') ? 'available' : 'offline');
  setSensorState(imuStatus, hasManifestSensor('imu'), hasManifestSensor('imu') ? 'available' : 'offline');
  setSensorState(pressureStatus, hasManifestSensor('hand_pressure'), hasManifestSensor('hand_pressure') ? 'available' : 'offline');
  setSensorState(odometryStatus, hasManifestSensor('odometry'), hasManifestSensor('odometry') ? 'available' : 'offline');
  setSensorState(rgbStatus, hasManifestSensor('rgb'), hasManifestSensor('rgb') ? 'available' : 'offline');
  setSensorState(depthStatus, hasManifestSensor('depth'), hasManifestSensor('depth') ? 'available' : 'offline');
  setSensorState(lidarStatus, hasManifestSensor('lidar'), hasManifestSensor('lidar') ? 'available' : 'offline');
}

function averageAbs(values) {
  const clean = values.map(Number).filter(Number.isFinite);
  if (!clean.length) return 0;
  let sum = 0;
  for (let i = 0; i < clean.length; i++) sum += Math.abs(clean[i]);
  return sum / clean.length;
}

function vectorNorm(values) {
  const clean = values.map(Number).filter(Number.isFinite);
  let sum = 0;
  for (let i = 0; i < clean.length; i++) sum += clean[i] * clean[i];
  return Math.sqrt(sum);
}

function pushSensorSample(payload, shownPoints) {
  const frame = payload.frame || {};
  const joints = payload.joints || {};
  const hands = payload.hands || {};
  const imu = payload.imu || {};
  const odometry = payload.odometry || {};
  const sensors = payload.sensors || {};
  const media = payload.media || {};
  const allJoints = array(joints.arm).concat(array(joints.leg), array(joints.hand));
  const pressure = array(hands.pressure);
  const rpy = array(imu.rpy);
  const accel = array(imu.accelerometer);
  const gyro = array(imu.gyroscope);
  const rotation = frame.rotation || {};
  const position = frame.position || {};
  const odomPosition = odometry.position || position;
  const odomRotation = odometry.rotation || rotation;
  const rgbOn = sensors.rgb || media.rgb ? 1 : 0;
  const depthOn = sensors.depth || media.depth ? 1 : 0;
  const lidarOn = Number(sensors.lidar_points || shownPoints) > 0 || media.lidar ? 1 : 0;
  const sample = {
    frameId: Number(frame.frameId || 0),
    time: frame.time || '',
    joints: {
      count: allJoints.length,
      activity: averageAbs(allJoints),
      arm: averageAbs(array(joints.arm)),
      leg: averageAbs(array(joints.leg)),
      hand: averageAbs(array(joints.hand))
    },
    imu: {
      roll: Number.isFinite(Number(rpy[0])) ? Number(rpy[0]) : Number(rotation.roll || 0),
      pitch: Number.isFinite(Number(rpy[1])) ? Number(rpy[1]) : Number(rotation.pitch || 0),
      yaw: Number.isFinite(Number(rpy[2])) ? Number(rpy[2]) : Number(rotation.yaw || 0),
      accel: vectorNorm(accel),
      gyro: vectorNorm(gyro)
    },
    pressure: {
      count: pressure.length,
      avg: averageAbs(pressure),
      max: pressure.reduce((m, v) => Math.max(m, Math.abs(Number(v) || 0)), 0)
    },
    odometry: {
      x: Number(odomPosition.x || 0),
      y: Number(odomPosition.y || 0),
      z: Number(odomPosition.z || 0),
      speed: Number(frame.speed || odometry.speed || 0),
      yaw: Number(odomRotation.yaw || 0)
    },
    rgb: {
      available: rgbOn,
      frame: rgbOn,
      pathLength: String(media.rgb || '').length
    },
    depth: {
      available: depthOn,
      frame: depthOn,
      pathLength: String(media.depth || '').length
    },
    lidar: {
      available: lidarOn ? 1 : 0,
      points: Number(shownPoints || 0),
      rawPoints: Number(sensors.lidar_points || 0)
    }
  };
  const last = sensorHistory[sensorHistory.length - 1];
  if (last && last.frameId === sample.frameId) sensorHistory[sensorHistory.length - 1] = sample;
  else sensorHistory.push(sample);
  while (sensorHistory.length > SENSOR_HISTORY_LIMIT) sensorHistory.shift();
}

function chartSpec(type) {
  if (type === 'imu') {
    return {
      title: 'IMU Attitude',
      subtitle: 'Roll, pitch, yaw, acceleration norm, and gyroscope norm',
      series: [
        { key: 'roll', label: 'roll', color: '#79b8ff', value: s => s.imu.roll },
        { key: 'pitch', label: 'pitch', color: '#22c7a5', value: s => s.imu.pitch },
        { key: 'yaw', label: 'yaw', color: '#f0b84a', value: s => s.imu.yaw },
        { key: 'gyro', label: 'gyro', color: '#d5dde3', value: s => s.imu.gyro }
      ]
    };
  }
  if (type === 'pressure') {
    return {
      title: 'Hand Pressure',
      subtitle: 'Average and peak tactile pressure channels',
      series: [
        { key: 'avg', label: 'avg pressure', color: '#22c7a5', value: s => s.pressure.avg },
        { key: 'max', label: 'max pressure', color: '#f0b84a', value: s => s.pressure.max }
      ]
    };
  }
  if (type === 'odometry') {
    return {
      title: 'Odometry',
      subtitle: 'Base position, yaw, and speed from robot kinematics',
      series: [
        { key: 'speed', label: 'speed', color: '#22c7a5', value: s => s.odometry.speed },
        { key: 'x', label: 'x', color: '#79b8ff', value: s => s.odometry.x },
        { key: 'y', label: 'y', color: '#f0b84a', value: s => s.odometry.y },
        { key: 'yaw', label: 'yaw', color: '#d5dde3', value: s => s.odometry.yaw }
      ]
    };
  }
  if (type === 'rgb') {
    return {
      title: 'RGB Camera',
      subtitle: 'RGB frame availability and media path signal',
      series: [
        { key: 'available', label: 'available', color: '#22c7a5', value: s => s.rgb.available },
        { key: 'pathLength', label: 'media path', color: '#79b8ff', value: s => s.rgb.pathLength }
      ]
    };
  }
  if (type === 'depth') {
    return {
      title: 'Depth Camera',
      subtitle: 'Depth frame availability and media path signal',
      series: [
        { key: 'available', label: 'available', color: '#22c7a5', value: s => s.depth.available },
        { key: 'pathLength', label: 'media path', color: '#f0b84a', value: s => s.depth.pathLength }
      ]
    };
  }
  if (type === 'lidar' || type === 'perception') {
    return {
      title: 'LiDAR',
      subtitle: 'Rendered point cloud count and raw LiDAR point count',
      series: [
        { key: 'points', label: 'rendered points', color: '#22c7a5', value: s => s.lidar.points },
        { key: 'rawPoints', label: 'raw LiDAR points', color: '#79b8ff', value: s => s.lidar.rawPoints }
      ]
    };
  }
  return {
    title: 'Joint Activity',
    subtitle: 'Average absolute activity across arm, leg, and hand joints',
    series: [
      { key: 'activity', label: 'all joints', color: '#22c7a5', value: s => s.joints.activity },
      { key: 'arm', label: 'arms', color: '#79b8ff', value: s => s.joints.arm },
      { key: 'leg', label: 'legs', color: '#f0b84a', value: s => s.joints.leg },
      { key: 'hand', label: 'hands', color: '#d5dde3', value: s => s.joints.hand }
    ]
  };
}

function drawLineChart(ctx, width, height, spec, samples) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(7, 10, 12, 0.78)';
  ctx.fillRect(0, 0, width, height);
  const padLeft = 48;
  const padRight = 18;
  const padTop = 20;
  const padBottom = 32;
  const plotW = Math.max(1, width - padLeft - padRight);
  const plotH = Math.max(1, height - padTop - padBottom);
  const values = [];
  for (let i = 0; i < samples.length; i++) {
    for (let j = 0; j < spec.series.length; j++) {
      const n = Number(spec.series[j].value(samples[i]));
      if (Number.isFinite(n)) values.push(n);
    }
  }
  let min = values.length ? Math.min(...values) : 0;
  let max = values.length ? Math.max(...values) : 1;
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  min -= span * 0.08;
  max += span * 0.08;
  ctx.strokeStyle = 'rgba(143, 163, 176, 0.18)';
  ctx.lineWidth = 1;
  ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillStyle = 'rgba(238, 244, 247, 0.62)';
  for (let i = 0; i <= 4; i++) {
    const y = padTop + plotH * i / 4;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(width - padRight, y);
    ctx.stroke();
    const value = max - (max - min) * i / 4;
    ctx.fillText(value.toFixed(Math.abs(value) >= 100 ? 0 : 2), 8, y + 4);
  }
  const xFor = i => padLeft + (samples.length <= 1 ? 0 : i * plotW / (samples.length - 1));
  const yFor = v => padTop + plotH - ((v - min) / (max - min)) * plotH;
  for (let s = 0; s < spec.series.length; s++) {
    const series = spec.series[s];
    ctx.strokeStyle = series.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < samples.length; i++) {
      const v = Number(series.value(samples[i]));
      if (!Number.isFinite(v)) continue;
      const x = xFor(i);
      const y = yFor(v);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.fillStyle = series.color;
    for (let i = 0; i < samples.length; i++) {
      const v = Number(series.value(samples[i]));
      if (!Number.isFinite(v)) continue;
      const x = xFor(i);
      const y = yFor(v);
      if (i === samples.length - 1 || samples.length < 4) {
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.fillStyle = 'rgba(150, 165, 173, 0.8)';
  const first = samples[0] && samples[0].frameId;
  const last = samples[samples.length - 1] && samples[samples.length - 1].frameId;
  ctx.fillText(`frame ${first == null ? '--' : first}`, padLeft, height - 10);
  const right = `frame ${last == null ? '--' : last}`;
  ctx.fillText(right, width - padRight - ctx.measureText(right).width, height - 10);
}

function renderChartLegend(spec) {
  sensorChartLegend.innerHTML = '';
  for (let i = 0; i < spec.series.length; i++) {
    const item = document.createElement('span');
    const swatch = document.createElement('i');
    swatch.style.background = spec.series[i].color;
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(spec.series[i].label));
    sensorChartLegend.appendChild(item);
  }
}

function drawSensorChart(force) {
  if (!activeSensorChart || !sensorModal.classList.contains('open')) return;
  const now = performance.now();
  if (!force && now - lastChartDrawAt < 120) return;
  lastChartDrawAt = now;
  const rect = sensorChartCanvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(rect.width * ratio));
  const height = Math.max(1, Math.floor(rect.height * ratio));
  if (sensorChartCanvas.width !== width || sensorChartCanvas.height !== height) {
    sensorChartCanvas.width = width;
    sensorChartCanvas.height = height;
  }
  const spec = chartSpec(activeSensorChart);
  drawLineChart(sensorChartCtx, width, height, spec, sensorHistory);
  renderChartLegend(spec);
}

function openSensorModal(type) {
  activeSensorChart = type || 'joints';
  const spec = chartSpec(activeSensorChart);
  sensorModalTitle.textContent = spec.title;
  sensorModalSubtitle.textContent = spec.subtitle;
  sensorModal.classList.add('open');
  sensorModal.setAttribute('aria-hidden', 'false');
  drawSensorChart(true);
}

function closeSensorModal() {
  sensorModal.classList.remove('open');
  sensorModal.setAttribute('aria-hidden', 'true');
  activeSensorChart = '';
}

function updateHud(payload, shownPoints, queryMs) {
  const frame = payload.frame || {};
  const robot = payload.robot || {};
  const joints = payload.joints || {};
  const hands = payload.hands || {};
  const imu = payload.imu || {};
  const sensors = payload.sensors || {};
  const media = payload.media || {};
  const allJoints = array(joints.arm).concat(array(joints.leg), array(joints.hand));
  const pressure = array(hands.pressure);
  const odom = payload.odometry || {};
  const rgbActive = !!(sensors.rgb || media.rgb);
  const depthActive = !!(sensors.depth || media.depth);
  const lidarActive = !!(Number(sensors.lidar_points || shownPoints) > 0 || media.lidar);
  pushSensorSample(payload, shownPoints);

  frameIdLabel.textContent = String(frame.frameId || 0);
  robotTypeLabel.textContent = String(robot.type || 'G1').toUpperCase();
  episodeLabel.textContent = `${frame.sourceEpisode || 'episode'}:${frame.sourceStep != null ? frame.sourceStep : 0}`;
  speedLabel.textContent = `${fmtNum(frame.speed, 2)} m/s`;
  jointSummary.textContent = `${allJoints.length} values`;
  setBars(allJoints);
  setPressure(pressure);
  odometrySummary.textContent = `${fmtNum(frame.speed || odom.speed, 2)} m/s`;
  rgbSummary.textContent = rgbActive ? 'frame ready' : '--';
  depthSummary.textContent = depthActive ? 'frame ready' : '--';
  lidarSummary.textContent = `${fmtCount(shownPoints)} points`;
  setSensorState(jointStatus, allJoints.length > 0 || hasManifestSensor('joints'), allJoints.length ? 'streaming' : 'available');
  const imuActive = !!(imu && (array(imu.rpy).length || array(imu.accelerometer).length || array(imu.gyroscope).length));
  setSensorState(imuStatus, imuActive || hasManifestSensor('imu'), imuActive ? 'streaming' : 'available');
  setSensorState(pressureStatus, pressure.length > 0 || hasManifestSensor('hand_pressure'), pressure.length ? 'streaming' : 'available');
  setSensorState(odometryStatus, !!(payload.odometry || frame.position) || hasManifestSensor('odometry'), payload.odometry || frame.position ? 'streaming' : 'available');
  setSensorState(rgbStatus, rgbActive || hasManifestSensor('rgb'), rgbActive ? 'streaming' : 'available');
  setSensorState(depthStatus, depthActive || hasManifestSensor('depth'), depthActive ? 'streaming' : 'available');
  setSensorState(lidarStatus, lidarActive || hasManifestSensor('lidar'), lidarActive ? 'streaming' : 'available');
  timeLabel.textContent = frame.time || new Date(currentMs).toISOString();
  queryLabel.textContent = `${Math.round(queryMs)} ms Machbase query`;
  sourceLabel.textContent = payload.source === 'machbase' ? 'Machbase Neo live query' : 'synthetic fallback';
  drawImu(payload);
  drawSensorChart(false);
}

async function requestPoints(frameId) {
  const data = await binary(`/api/points.bin?frameId=${frameId}&lod=2`);
  return {
    buffer: data.buffer,
    pointCount: Number(data.headers.get('x-neo-point-count') || Math.floor(data.buffer.byteLength / 16))
  };
}

function rememberFrame(frameId, entry) {
  frameCache.set(frameId, entry);
  if (frameCache.size <= FRAME_CACHE_LIMIT) return;
  const first = frameCache.keys().next().value;
  frameCache.delete(first);
}

function rememberPoints(frameId, buffer) {
  pointCache.set(frameId, buffer);
  if (pointCache.size <= FRAME_CACHE_LIMIT) return;
  const first = pointCache.keys().next().value;
  pointCache.delete(first);
}

function applyFrameEntry(entry) {
  currentPayload = entry.payload;
  currentMs = Date.parse(entry.payload.frame && entry.payload.frame.time || '') || currentMs;
  updateRobot(entry.payload);
  updateTrail(entry.payload.frame || {});
  lastQueryMs = entry.queryMs || lastQueryMs;
  updateHud(entry.payload, currentShownPoints, lastQueryMs);
  lastFetchedFrameId = entry.frameId;
  lastFrameAppliedAt = performance.now();
}

async function maybeLoadPoints(frameId, force) {
  const generation = viewGeneration;
  const cached = pointCache.get(frameId);
  if (cached) {
    if (generation !== viewGeneration) return;
    currentShownPoints = updatePointCloud(cached);
    if (currentPayload) updateHud(currentPayload, currentShownPoints, lastQueryMs);
    return;
  }
  const now = performance.now();
  if (loadingPoints || (!force && now - lastPointRequestAt < POINT_FETCH_INTERVAL_MS)) return;
  loadingPoints = true;
  lastPointRequestAt = now;
  try {
    const started = performance.now();
    const points = await requestPoints(frameId);
    if (generation !== viewGeneration) return;
    rememberPoints(frameId, points.buffer);
    currentShownPoints = updatePointCloud(points.buffer);
    if (currentPayload && currentPayload.frame && currentPayload.frame.frameId === frameId) {
      updateHud(currentPayload, currentShownPoints, performance.now() - started);
    }
  } catch (_) {
    if (force) {
      clearPointCloud();
      currentShownPoints = 0;
      if (currentPayload) updateHud(currentPayload, currentShownPoints, lastQueryMs);
    }
  } finally {
    loadingPoints = false;
  }
}

async function loadFrame(frameId) {
  const generation = viewGeneration;
  const cached = frameCache.get(frameId);
  if (cached) {
    if (generation !== viewGeneration) return;
    applyFrameEntry(cached);
    maybeLoadPoints(frameId, false);
    return;
  }
  if (loadingFrame) {
    pendingFrameId = frameId;
    return;
  }
  loadingFrame = true;
  lastFrameRequestAt = performance.now();
  try {
    const started = performance.now();
    const payload = await json(`/api/frame?frameId=${frameId}`);
    if (generation !== viewGeneration) return;
    const resolvedFrameId = payload.frame && payload.frame.frameId != null ? payload.frame.frameId : frameId;
    const entry = {
      frameId: resolvedFrameId,
      payload,
      queryMs: performance.now() - started
    };
    rememberFrame(resolvedFrameId, entry);
    applyFrameEntry(entry);
    maybeLoadPoints(resolvedFrameId, !playing);
  } catch (err) {
    sourceLabel.textContent = err.message || String(err);
  } finally {
    loadingFrame = false;
    if (pendingFrameId >= 0 && pendingFrameId !== lastFetchedFrameId) {
      const next = pendingFrameId;
      pendingFrameId = -1;
      maybeLoadFrame(next, false);
    } else {
      pendingFrameId = -1;
    }
  }
}

function maybeLoadFrame(frameId, force) {
  if (frameId === lastFetchedFrameId) return;
  if (frameCache.has(frameId)) {
    loadFrame(frameId);
    return;
  }
  const now = performance.now();
  if (!force && now - lastFrameRequestAt < PLAYBACK_FETCH_INTERVAL_MS) {
    pendingFrameId = frameId;
    return;
  }
  loadFrame(frameId);
}

function frameFromTimeline() {
  const ep = activeEpisode();
  const local = clamp(Math.round(Number(timeline.value || 0)), 0, Math.max(0, ep.frameCount - 1));
  return ep.frameStart + local;
}

function frameFromCurrentTime() {
  const ep = activeEpisode();
  return clamp(Math.round(currentFrameFloat), ep.frameStart, ep.frameEnd);
}

function syncTimeline() {
  const ep = activeEpisode();
  timeline.value = String(clamp(frameFromCurrentTime() - ep.frameStart, 0, Math.max(0, ep.frameCount - 1)));
}

function followCamera() {
  const frame = currentPayload && currentPayload.frame || {};
  const pos = frame.position || {};
  const yaw = frame.rotation && Number(frame.rotation.yaw || 0) || 0;
  const target = new THREE.Vector3(Number(pos.x || 0), Number(pos.y || 0), Number(pos.z || 0) + 1.1);
  if (!cameraAutoFollow) {
    const delta = target.clone().sub(followTarget);
    camera.position.add(delta);
    controls.target.add(delta);
    followTarget.copy(target);
    return;
  }
  const offset = new THREE.Vector3(3.5, -5.8, 2.8).applyAxisAngle(new THREE.Vector3(0, 0, 1), yaw);
  camera.position.lerp(target.clone().add(offset), 0.08);
  controls.target.lerp(target, 0.12);
  followTarget.copy(controls.target);
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate(now) {
  resize();
  if (playing && manifest) {
    const ep = activeEpisode();
    const dt = now - lastTick;
    currentFrameFloat += dt * 30 / 1000;
    if (currentFrameFloat > ep.frameEnd) currentFrameFloat = ep.frameStart;
    syncTimeline();
    const frameId = frameFromCurrentTime();
    maybeLoadFrame(frameId, false);
  }
  lastTick = now;
  followCamera();
  controls.update();
  if (currentPayload && now - lastTraceDrawAt > 80) {
    drawTrace(currentPayload.frame || {});
    lastTraceDrawAt = now;
  }
  drawSensorChart(false);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function resetEpisodeView() {
  viewGeneration++;
  trailPoints.length = 0;
  trailGeometry.setFromPoints(trailPoints);
  clearPointCloud();
  currentPayload = null;
  currentShownPoints = 0;
  pendingFrameId = -1;
  lastFetchedFrameId = -1;
  loadingFrame = false;
  loadingPoints = false;
}

function episodeOptionLabel(ep) {
  const name = String(ep.name || 'episode');
  const shortName = name.length > 42 ? `${name.slice(0, 39)}...` : name;
  return `${String((ep.index || 0) + 1).padStart(2, '0')}  ${shortName}  ${fmtCount(ep.frameCount)} frames`;
}

function taskOptionLabel(task) {
  const category = task.category || 'task';
  const name = task.task || task.name || 'episode';
  return `${category} / ${name}`;
}

function populateEpisodes(items) {
  const source = Array.isArray(items) && items.length ? items : [activeEpisode()];
  episodeIndex = source.map((item, index) => {
    const frameStart = Math.max(0, Math.round(Number(item.frameStart || 0)));
    const frameCount = Math.max(1, Math.round(Number(item.frameCount || 1)));
    const frameEnd = Math.max(frameStart, Math.round(Number(item.frameEnd != null ? item.frameEnd : frameStart + frameCount - 1)));
    return {
      name: item.name || `episode_${index}`,
      index: index,
      task: item.task || String(item.name || '').split('/')[0] || `task_${index}`,
      category: item.category || '',
      description: item.description || '',
      frameStart: frameStart,
      frameEnd: frameEnd,
      frameCount: Math.max(1, frameEnd - frameStart + 1),
      stepStart: Math.round(Number(item.stepStart || 0)),
      stepEnd: Math.round(Number(item.stepEnd || frameCount - 1)),
      minTime: item.minTime || '',
      maxTime: item.maxTime || '',
      durationMs: Number(item.durationMs || 0),
      pointFrames: Math.round(Number(item.pointFrames || 0)),
      robotType: item.robotType || ''
    };
  });
  const taskMap = {};
  taskIndex = [];
  for (let i = 0; i < episodeIndex.length; i++) {
    const ep = episodeIndex[i];
    const key = ep.task || ep.name;
    if (!taskMap[key]) {
      taskMap[key] = {
        key: key,
        task: ep.task || key,
        category: ep.category || '',
        description: ep.description || '',
        episodes: [],
        frameCount: 0
      };
      taskIndex.push(taskMap[key]);
    }
    taskMap[key].episodes.push(ep);
    taskMap[key].frameCount += ep.frameCount;
  }
  taskSelect.innerHTML = '';
  for (let i = 0; i < taskIndex.length; i++) {
    const task = taskIndex[i];
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = taskOptionLabel(task);
    taskSelect.appendChild(option);
  }
}

function populateTaskEpisodes(task) {
  const episodes = task && task.episodes && task.episodes.length ? task.episodes : episodeIndex;
  episodeSelect.innerHTML = '';
  for (let i = 0; i < episodes.length; i++) {
    const ep = episodes[i];
    const option = document.createElement('option');
    option.value = String(episodeIndex.indexOf(ep));
    option.textContent = episodeOptionLabel(ep);
    episodeSelect.appendChild(option);
  }
}

function selectEpisode(index, keepPlaying) {
  if (!episodeIndex.length) return;
  const nextIndex = clamp(index, 0, episodeIndex.length - 1);
  selectedEpisode = episodeIndex[nextIndex];
  episodeSelect.value = String(nextIndex);
  timeline.max = String(Math.max(0, selectedEpisode.frameCount - 1));
  timeline.value = '0';
  currentFrameFloat = selectedEpisode.frameStart;
  currentMs = Date.parse(selectedEpisode.minTime || '') || minMs;
  if (!keepPlaying) setPlaying(false);
  resetEpisodeView();
  datasetLabel.textContent = `${manifest.dataset || 'humanoid-everyday'} / ${fmtCount(taskIndex.length || 1)} tasks / ${fmtCount(manifest.frameCount || 0)} frames`;
  maybeLoadFrame(selectedEpisode.frameStart, true);
}

function selectedEpisodeIndex() {
  return Math.max(0, episodeIndex.indexOf(selectedEpisode));
}

function selectedTaskIndex() {
  return Math.max(0, taskIndex.indexOf(selectedTask));
}

function selectTask(index, keepPlaying) {
  if (!taskIndex.length) return;
  const nextIndex = clamp(index, 0, taskIndex.length - 1);
  selectedTask = taskIndex[nextIndex];
  taskSelect.value = String(nextIndex);
  populateTaskEpisodes(selectedTask);
  selectEpisode(episodeIndex.indexOf(selectedTask.episodes[0]), keepPlaying);
}

function syncPlayButtons() {
  playButton.textContent = playing ? 'Pause' : 'Play';
  sensorModalPlay.textContent = playing ? 'Pause' : 'Play';
  sensorModalPlay.classList.toggle('playing', playing);
}

function setPlaying(next) {
  playing = !!next;
  syncPlayButtons();
  lastTick = performance.now();
}

async function init() {
  manifest = await json('/api/manifest');
  const episodePayload = await json(`/api/episodes?dataset=${encodeURIComponent(manifest.dataset || '')}&sequence=${encodeURIComponent(manifest.sequence || '')}`);
  minMs = Date.parse(manifest.minTime || '') || Date.now();
  maxMs = Date.parse(manifest.maxTime || '') || (minMs + 10 * 60 * 1000);
  currentMs = minMs;
  sourceLabel.textContent = manifest.source === 'machbase' ? 'Machbase Neo live query' : 'synthetic fallback';
  markBuiltInSensorStates();
  populateEpisodes(episodePayload.episodes);
  selectTask(0, false);
}

playButton.addEventListener('click', () => {
  setPlaying(!playing);
});

timeline.addEventListener('input', () => {
  setPlaying(false);
  currentFrameFloat = frameFromTimeline();
  maybeLoadFrame(Math.round(currentFrameFloat), true);
});

episodeSelect.addEventListener('change', () => {
  selectEpisode(parseInt(episodeSelect.value || '0', 10) || 0, false);
});

taskSelect.addEventListener('change', () => {
  selectTask(parseInt(taskSelect.value || '0', 10) || 0, false);
});

for (let i = 0; i < sensorButtons.length; i++) {
  sensorButtons[i].addEventListener('click', () => {
    openSensorModal(sensorButtons[i].getAttribute('data-sensor'));
  });
}

sensorModalClose.addEventListener('click', closeSensorModal);
sensorModalPlay.addEventListener('click', () => {
  setPlaying(!playing);
});
sensorModalBackdrop.addEventListener('click', closeSensorModal);
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && sensorModal.classList.contains('open')) closeSensorModal();
});

prevEpisodeButton.addEventListener('click', () => {
  selectTask(selectedTaskIndex() - 1, playing);
});

nextEpisodeButton.addEventListener('click', () => {
  selectTask(selectedTaskIndex() + 1, playing);
});

init().catch(err => {
  sourceLabel.textContent = err.message || String(err);
});
requestAnimationFrame(animate);
