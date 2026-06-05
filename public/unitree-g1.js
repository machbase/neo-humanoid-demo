import * as THREE from './vendor/three.module.js';
import { STLLoader } from './vendor/STLLoader.js';

const ASSET_ROOT = './assets/robots/unitree_g1';
const URDF_URL = `${ASSET_ROOT}/g1_29dof_rev_1_0.urdf`;
const LEG_JOINTS = [
  'left_hip_pitch_joint',
  'left_hip_roll_joint',
  'left_hip_yaw_joint',
  'left_knee_joint',
  'left_ankle_pitch_joint',
  'left_ankle_roll_joint',
  'right_hip_pitch_joint',
  'right_hip_roll_joint',
  'right_hip_yaw_joint',
  'right_knee_joint',
  'right_ankle_pitch_joint',
  'right_ankle_roll_joint',
  'waist_yaw_joint',
  'waist_roll_joint',
  'waist_pitch_joint'
];
const ARM_JOINTS = [
  'left_shoulder_pitch_joint',
  'left_shoulder_roll_joint',
  'left_shoulder_yaw_joint',
  'left_elbow_joint',
  'left_wrist_roll_joint',
  'left_wrist_pitch_joint',
  'left_wrist_yaw_joint',
  'right_shoulder_pitch_joint',
  'right_shoulder_roll_joint',
  'right_shoulder_yaw_joint',
  'right_elbow_joint',
  'right_wrist_roll_joint',
  'right_wrist_pitch_joint',
  'right_wrist_yaw_joint'
];
const FLOOR_Z = 0;

function array(value) {
  return Array.isArray(value) ? value : [];
}

function numberAt(values, index, fallback) {
  const n = Number(values[index]);
  return Number.isFinite(n) ? n : fallback;
}

function directChildren(parent, tagName) {
  const out = [];
  const children = parent && parent.children || [];
  for (let i = 0; i < children.length; i++) {
    if (children[i].tagName === tagName) out.push(children[i]);
  }
  return out;
}

function directChild(parent, tagName) {
  const children = directChildren(parent, tagName);
  return children.length ? children[0] : null;
}

function attr(node, name, fallback) {
  if (!node) return fallback || '';
  const value = node.getAttribute(name);
  return value == null || value === '' ? fallback || '' : value;
}

function vectorFromText(text, fallback) {
  const parts = String(text || '').trim().split(/\s+/).map(Number);
  return new THREE.Vector3(
    Number.isFinite(parts[0]) ? parts[0] : fallback && fallback.x || 0,
    Number.isFinite(parts[1]) ? parts[1] : fallback && fallback.y || 0,
    Number.isFinite(parts[2]) ? parts[2] : fallback && fallback.z || 0
  );
}

function applyOrigin(group, origin) {
  const xyz = vectorFromText(attr(origin, 'xyz', '0 0 0'));
  const rpy = vectorFromText(attr(origin, 'rpy', '0 0 0'));
  group.position.copy(xyz);
  group.rotation.set(rpy.x, rpy.y, rpy.z, 'XYZ');
}

function materialFromColor(name, colorText) {
  if (name === 'dark') {
    return new THREE.MeshStandardMaterial({ color: 0x11181d, metalness: 0.6, roughness: 0.28 });
  }
  if (name === 'white') {
    return new THREE.MeshStandardMaterial({ color: 0xd7dde1, metalness: 0.36, roughness: 0.3 });
  }
  const parts = String(colorText || '').trim().split(/\s+/).map(Number);
  if (parts.length >= 3) {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(parts[0], parts[1], parts[2]),
      metalness: 0.32,
      roughness: 0.34
    });
  }
  return new THREE.MeshStandardMaterial({ color: 0xcfd6db, metalness: 0.34, roughness: 0.32 });
}

function loadStl(loader, url, group, mat) {
  return new Promise((resolve) => {
    loader.load(url, (geometry) => {
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.name = url.split('/').pop() || 'unitree_mesh';
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      group.add(mesh);
      resolve();
    }, undefined, () => {
      resolve();
    });
  });
}

function collectMaterials(robot) {
  const materials = {};
  const items = directChildren(robot, 'material');
  for (let i = 0; i < items.length; i++) {
    const name = attr(items[i], 'name', '');
    const color = directChild(items[i], 'color');
    materials[name] = materialFromColor(name, attr(color, 'rgba', ''));
  }
  materials.logo = new THREE.MeshStandardMaterial({
    color: 0x22c7a5,
    emissive: 0x07382f,
    emissiveIntensity: 0.18,
    metalness: 0.45,
    roughness: 0.25
  });
  return materials;
}

function buildLinks(robot, materials, loader, pendingLoads) {
  const links = {};
  const linkEls = directChildren(robot, 'link');
  for (let i = 0; i < linkEls.length; i++) {
    const linkEl = linkEls[i];
    const linkName = attr(linkEl, 'name', `link_${i}`);
    const linkGroup = new THREE.Group();
    linkGroup.name = linkName;
    links[linkName] = linkGroup;
    const visuals = directChildren(linkEl, 'visual');
    for (let j = 0; j < visuals.length; j++) {
      const visual = visuals[j];
      const geometry = directChild(visual, 'geometry');
      const mesh = directChild(geometry, 'mesh');
      const filename = attr(mesh, 'filename', '');
      if (!filename) continue;
      const materialName = attr(directChild(visual, 'material'), 'name', '');
      const visualGroup = new THREE.Group();
      visualGroup.name = `${linkName}_visual_${j}`;
      applyOrigin(visualGroup, directChild(visual, 'origin'));
      linkGroup.add(visualGroup);
      const material = linkName === 'logo_link' ? materials.logo : materials[materialName] || materials.white;
      pendingLoads.push(loadStl(loader, `${ASSET_ROOT}/${filename}`, visualGroup, material));
    }
  }
  return links;
}

function buildJoints(robot, links) {
  const joints = {};
  const childLinks = {};
  const jointEls = directChildren(robot, 'joint');
  for (let i = 0; i < jointEls.length; i++) {
    const jointEl = jointEls[i];
    const parentName = attr(directChild(jointEl, 'parent'), 'link', '');
    const childName = attr(directChild(jointEl, 'child'), 'link', '');
    const parent = links[parentName];
    const child = links[childName];
    if (!parent || !child) continue;
    const jointFrame = new THREE.Group();
    jointFrame.name = attr(jointEl, 'name', `joint_${i}`);
    applyOrigin(jointFrame, directChild(jointEl, 'origin'));
    const motion = new THREE.Group();
    motion.name = `${jointFrame.name}_motion`;
    jointFrame.add(motion);
    motion.add(child);
    parent.add(jointFrame);
    childLinks[childName] = true;
    const axis = vectorFromText(attr(directChild(jointEl, 'axis'), 'xyz', '1 0 0'), new THREE.Vector3(1, 0, 0));
    if (axis.lengthSq() < 0.000001) axis.set(1, 0, 0);
    axis.normalize();
    joints[jointFrame.name] = {
      type: attr(jointEl, 'type', 'fixed'),
      axis: axis,
      motion: motion
    };
  }
  return { joints, childLinks };
}

function fitFeetToFloor(root, contactLinks) {
  for (let pass = 0; pass < 3; pass++) {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const contacts = array(contactLinks);
    if (contacts.length) {
      for (let i = 0; i < contacts.length; i++) {
        if (contacts[i]) box.expandByObject(contacts[i]);
      }
    } else {
      box.setFromObject(root);
    }
    if (!Number.isFinite(box.min.z)) return;
    const delta = FLOOR_Z - box.min.z;
    if (Math.abs(delta) < 0.0005) return;
    root.position.z += delta;
  }
  root.updateMatrixWorld(true);
}

export function createUnitreeG1Model() {
  const root = new THREE.Group();
  const state = { ready: false, failed: false };
  const model = {
    root: root,
    state: state,
    joints: {},
    contactLinks: [],
    update: (payload) => {
      const joints = payload && payload.joints || {};
      const leg = array(joints.leg);
      const arm = array(joints.arm);
      for (let i = 0; i < LEG_JOINTS.length; i++) {
        model.setJoint(LEG_JOINTS[i], numberAt(leg, i, 0));
      }
      for (let i = 0; i < ARM_JOINTS.length; i++) {
        model.setJoint(ARM_JOINTS[i], numberAt(arm, i, 0));
      }
      fitFeetToFloor(root, model.contactLinks);
    },
    setJoint: (name, value) => {
      const joint = model.joints[name];
      const n = Number(value);
      if (!joint || joint.type === 'fixed' || !Number.isFinite(n)) return;
      joint.motion.quaternion.setFromAxisAngle(joint.axis, n);
    },
    ready: null
  };

  root.name = 'unitree_g1_official_model';
  root.visible = false;
  root.rotation.z = Math.PI / 2;
  root.scale.setScalar(1.08);

  model.ready = fetch(URDF_URL)
    .then(res => {
      if (!res.ok) throw new Error(`failed to load Unitree G1 URDF: ${res.status}`);
      return res.text();
    })
    .then(text => {
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      if (doc.querySelector('parsererror')) throw new Error('invalid Unitree G1 URDF');
      const robot = directChild(doc, 'robot') || doc.documentElement;
      const pendingLoads = [];
      const materials = collectMaterials(robot);
      const links = buildLinks(robot, materials, new STLLoader(), pendingLoads);
      const built = buildJoints(robot, links);
      model.joints = built.joints;
      let rootName = 'pelvis';
      const names = Object.keys(links);
      for (let i = 0; i < names.length; i++) {
        if (!built.childLinks[names[i]]) {
          rootName = names[i];
          break;
        }
      }
      root.add(links[rootName]);
      model.contactLinks = [
        links.left_ankle_roll_link,
        links.right_ankle_roll_link
      ].filter(Boolean);
      return Promise.all(pendingLoads).then(() => {
        fitFeetToFloor(root, model.contactLinks);
        state.ready = true;
      });
    })
    .catch(err => {
      state.failed = true;
      throw err;
    });

  return model;
}
