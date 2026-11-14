import { cutDepth, frameSpacing, planeNormal, terrainMap, visibleFrame } from './slicing.js';

export function createSlicer(THREE, scene, render) {
  const ids = ['dissection', 'rewind', 'slice-mode', 'depth', 'position-x', 'position-y', 'tilt-x', 'tilt-y', 'tilt-z', 'noise-amount', 'noise-scale', 'noise-seed', 'show-surface'];
  const ui = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
  const mapSize = 64;
  const heightMap = new THREE.DataTexture(terrainMap(mapSize, 3, 0), mapSize, mapSize);
  heightMap.minFilter = heightMap.magFilter = THREE.LinearFilter;
  heightMap.needsUpdate = true;
  const uniforms = {
    cutMode: { value: 0 },
    cutPoint: { value: new THREE.Vector3() },
    cutNormal: { value: new THREE.Vector3(0, 0, 1) },
    cutSize: { value: new THREE.Vector2(3.8, 2.1375) },
    cutAmplitude: { value: 0 },
    cutMap: { value: heightMap },
  };
  const declarations = `
    uniform int cutMode;
    uniform vec3 cutPoint;
    uniform vec3 cutNormal;
    uniform vec2 cutSize;
    uniform float cutAmplitude;
    uniform sampler2D cutMap;
    float surfaceDepth(vec2 point) {
      vec2 uv = clamp(point / cutSize + 0.5, 0.0, 1.0);
      uv = uv * (63.0 / 64.0) + vec2(0.5 / 64.0);
      return cutPoint.z + (texture2D(cutMap, uv).r * 2.0 - 1.0) * cutAmplitude;
    }
  `;
  const guideMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `${declarations}
      void main() {
        vec3 point = position;
        if (cutMode == 2) point.z = surfaceDepth(point.xy);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(point, 1.0);
      }`,
    fragmentShader: 'void main() { gl_FragColor = vec4(0.1, 0.35, 0.6, 0.25); }',
    wireframe: true,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const guide = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 2.1375, 63, 63), guideMaterial);
  // Terrain displacement happens in the vertex shader, outside the original bounds.
  guide.frustumCulled = false;
  guide.visible = false;
  scene.add(guide);
  let cards = [];
  let liveCard;
  let sizeKey = '';
  const number = (id) => Number(ui[id].value);

  function update() {
    const count = cards.length;
    const mode = ui['slice-mode'].value;
    ui.dissection.querySelectorAll('input, select').forEach((control) => { control.disabled = !count; });
    ui.rewind.max = count;
    const hidden = Math.min(number('rewind'), count);
    ui.rewind.value = hidden;
    document.getElementById('rewind-value').value = `${hidden} frames`;
    cards.forEach((card, index) => { card.visible = visibleFrame(index, count, hidden); });
    if (liveCard) liveCard.visible = hidden === 0;
    ui.dissection.querySelectorAll('[data-slicer]').forEach((group) => {
      group.hidden = !group.dataset.slicer.split(' ').includes(mode);
    });
    for (const id of ['depth', 'position-x', 'position-y', 'tilt-x', 'tilt-y', 'tilt-z', 'noise-amount', 'noise-scale', 'noise-seed']) {
      const suffix = id.startsWith('tilt') ? '°' : ['noise-scale', 'noise-seed'].includes(id) ? '' : '%';
      document.getElementById(`${id}-value`).value = `${ui[id].value}${suffix}`;
    }
    uniforms.cutMode.value = mode === 'plane' ? 1 : mode === 'terrain' ? 2 : 0;
    uniforms.cutPoint.value.set(number('position-x') / 100 * uniforms.cutSize.value.x / 2,
      number('position-y') / 100 * uniforms.cutSize.value.y / 2, cutDepth(number('depth'), count));
    uniforms.cutNormal.value.fromArray(planeNormal(number('tilt-x'), number('tilt-y'), number('tilt-z')));
    uniforms.cutAmplitude.value = number('noise-amount') / 100 * Math.max(0, count - 1) * frameSpacing;
    guide.visible = count > 0 && mode !== 'none' && ui['show-surface'].checked;
    guide.position.set(0, 0, 0);
    guide.quaternion.identity();
    if (mode === 'plane') {
      guide.position.copy(uniforms.cutPoint.value);
      guide.quaternion.setFromEuler(new THREE.Euler(
        number('tilt-x') * Math.PI / 180, number('tilt-y') * Math.PI / 180, number('tilt-z') * Math.PI / 180, 'ZYX'));
      guide.scale.set(2.5, 2.5, 1);
    } else {
      guide.scale.set(1, 1, 1);
    }
    document.dispatchEvent(new Event('dialsupdate'));
    render();
  }

  ui.dissection.addEventListener('input', (event) => {
    if (['noise-scale', 'noise-seed'].includes(event.target.id)) {
      heightMap.image.data.set(terrainMap(mapSize, number('noise-scale'), number('noise-seed')));
      heightMap.needsUpdate = true;
    }
    update();
  });

  return {
    attach(material) {
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = `varying vec3 cutPosition;\n${shader.vertexShader}`.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\ncutPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = `varying vec3 cutPosition;\n${declarations}\n${shader.fragmentShader}`.replace(
          '#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          if (cutMode == 1 && dot(cutPosition - cutPoint, cutNormal) > 0.00001) discard;
          if (cutMode == 2 && cutPosition.z > surfaceDepth(cutPosition.xy) + 0.00001) discard;`);
      };
      material.customProgramCacheKey = () => 'frame-stack-slicer-v1';
    },
    sync(nextCards, nextLive = null) {
      cards = nextCards;
      liveCard = nextLive;
      const frontCard = liveCard || cards[cards.length - 1];
      if (frontCard) {
        const { width, height } = frontCard.geometry.parameters;
        const nextKey = `${width}:${height}`;
        if (nextKey !== sizeKey) {
          guide.geometry.dispose();
          guide.geometry = new THREE.PlaneGeometry(width, height, 63, 63);
          uniforms.cutSize.value.set(width, height);
          sizeKey = nextKey;
        }
      } else {
        ui.rewind.value = 0;
      }
      update();
    },
  };
}
