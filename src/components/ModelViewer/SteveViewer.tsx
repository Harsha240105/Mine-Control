import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { generateSteveSkin } from './skinTexture';

export default function SteveViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    animRef: number;
    bodyParts: { group: THREE.Group; pivot: THREE.Object3D }[];
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    // Grid
    const gridHelper = new THREE.GridHelper(20, 20, 0x4a6ec2, 0x2a3a6a);
    gridHelper.position.y = -8;
    scene.add(gridHelper);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);

    const fillLight = new THREE.DirectionalLight(0x4466aa, 0.3);
    fillLight.position.set(-10, 10, -10);
    scene.add(fillLight);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(12, 8, 12);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 2, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 5;
    controls.maxDistance = 30;
    controls.update();

    // Create Steve
    const textureLoader = new THREE.TextureLoader();
    const skinUrl = generateSteveSkin();
    const texture = textureLoader.load(skinUrl);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;

    const bodyParts: { group: THREE.Group; pivot: THREE.Object3D }[] = [];

    function createPart(
      name: string,
      size: [number, number, number],
      position: [number, number, number],
      uvOffset: [number, number],
      parent: THREE.Object3D,
      pivotOffset?: number
    ) {
      const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
      const uvs = [
        // right, left, top, bottom, front, back
        uvOffset[0] + size[2], uvOffset[1] + size[1],  // right
        uvOffset[0], uvOffset[1] + size[1],              // left
        uvOffset[0] + size[2], uvOffset[1],              // top
        uvOffset[0] + size[2] + size[0], uvOffset[1],    // bottom
        uvOffset[0] + size[2] + size[0], uvOffset[1] + size[1], // front
        uvOffset[0] + size[2] + size[0] + size[2], uvOffset[1] + size[1], // back
      ];
      // Apply UV offsets
      const pos = geometry.attributes.position;
      const uv = geometry.attributes.uv;
      const faceCount = pos.count / 3;
      const faceUVs: [number, number][] = [
        [uvs[0], uvs[1]],   // right
        [uvs[2], uvs[3]],   // left
        [uvs[4], uvs[5]],   // top
        [uvs[6], uvs[7]],   // bottom
        [uvs[8], uvs[9]],   // front
        [uvs[10], uvs[11]], // back
      ];
      for (let i = 0; i < 6; i++) {
        const [u, v] = faceUVs[i];
        const idx = i * 6;
        for (let j = 0; j < 6; j++) {
          const uvIdx = idx + j;
          const origU = uv.getX(uvIdx);
          const origV = uv.getY(uvIdx);
          uv.setXY(uvIdx, (u + origU * size[['right','left'].includes(['right','left','top','bottom','front','back'][i]) ? 2 : 0 === 0 ? size[0] : size[2]]) / 64, (v + origV * size[1]) / 64);
        }
      }
      uv.needsUpdate = true;

      const material = new THREE.MeshStandardMaterial({
        map: texture,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const group = new THREE.Group();
      const pivot = new THREE.Object3D();
      pivot.position.y = pivotOffset || 0;
      group.add(pivot);
      mesh.position.set(position[0], position[1] - (pivotOffset || 0), position[2]);
      pivot.add(mesh);
      group.name = name;
      parent.add(group);

      return { group, pivot, mesh };
    }

    function createCube(
      name: string,
      size: [number, number, number],
      pos: [number, number, number],
      uv: [number, number],
      parent: THREE.Object3D,
      pivotY?: number
    ) {
      const result = createPart(name, size, pos, uv, parent, pivotY);
      bodyParts.push({ group: result.group, pivot: result.pivot });
      return result;
    }

    const rootGroup = new THREE.Group();
    rootGroup.position.y = 4;
    scene.add(rootGroup);

    // Head
    createCube('Head', [8, 8, 8], [0, 12, 0], [8, 8], rootGroup);
    // Body (Trunk)
    createCube('Body', [8, 12, 4], [0, 0, 0], [20, 20], rootGroup);
    // Right Arm
    createCube('RightArm', [4, 12, 4], [-6, 0, 0], [44, 20], rootGroup, 6);
    // Left Arm
    createCube('LeftArm', [4, 12, 4], [6, 0, 0], [36, 48], rootGroup, 6);
    // Right Leg
    createCube('RightLeg', [4, 12, 4], [-2, -12, 0], [4, 20], rootGroup, 6);
    // Left Leg
    createCube('LeftLeg', [4, 12, 4], [2, -12, 0], [20, 48], rootGroup, 6);

    // Arm swing targets
    let time = 0;

    function animate() {
      time += 0.03;

      // Walk animation - arms and legs swing
      const armSwing = Math.sin(time * 2) * 0.6;
      const legSwing = Math.sin(time * 2 + Math.PI) * 0.6;

      bodyParts.forEach(part => {
        if (part.group.name === 'RightArm' || part.group.name === 'LeftArm') {
          part.pivot.rotation.x = part.group.name === 'RightArm' ? armSwing : -armSwing;
        }
        if (part.group.name === 'RightLeg' || part.group.name === 'LeftLeg') {
          part.pivot.rotation.x = part.group.name === 'RightLeg' ? legSwing : -legSwing;
        }
      });

      // Head slight bob
      const head = bodyParts.find(p => p.group.name === 'Head');
      if (head) {
        head.group.position.y = 12 + Math.sin(time * 2) * 0.3;
      }
      // Body slight bob
      const body = bodyParts.find(p => p.group.name === 'Body');
      if (body) {
        body.group.position.y = 0 + Math.sin(time * 2) * 0.3;
      }

      controls.update();
      renderer.render(scene, camera);
      sceneRef.current!.animRef = requestAnimationFrame(animate);
    }

    animate();

    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    sceneRef.current = { scene, camera, renderer, controls, animRef: 0, bodyParts };

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(sceneRef.current?.animRef || 0);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', minHeight: '500px' }}
    />
  );
}
