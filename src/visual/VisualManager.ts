import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

type ScenePhase = 'welcome' | 'transition' | 'stargazing';

export class VisualManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private targetEnergy: number = 0;
  private currentEnergy: number = 0;
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private phase: ScenePhase = 'welcome';
  private transitionProgress: number = 0;
  private onPhaseChange?: (phase: ScenePhase) => void;

  private starfield!: THREE.Points;
  private starPositions!: Float32Array;
  private starVelocities!: Float32Array;
  private starMaterial!: THREE.PointsMaterial;
  
  private isDragging: boolean = false;
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  private cameraRotationX: number = 0;
  private cameraRotationY: number = 0;
  private targetCameraRotationX: number = 0;
  private targetCameraRotationY: number = 0;

  private welcomeTextMesh1?: THREE.Mesh;
  
  // Shockwave animation
  private shockwaveProgress: number = 0;
  private isShockwaveActive: boolean = false;
  private originalStarPositions!: Float32Array;

  constructor(container: HTMLElement, onPhaseChange?: (phase: ScenePhase) => void) {
    this.onPhaseChange = onPhaseChange;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050505);

    this.camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    this.camera.position.z = 5;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      0.3,
      0.4,
      0.85
    );
    this.composer.addPass(this.bloomPass);

    this.createStarfield();
    this.createWelcomeUI();
    this.setupEventListeners(container);

    window.addEventListener('resize', () => {
      this.camera.aspect = container.clientWidth / container.clientHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(container.clientWidth, container.clientHeight);
      this.composer.setSize(container.clientWidth, container.clientHeight);
    });

    this.animate();
  }

  private createStarTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
      gradient.addColorStop(0.2, 'rgba(200, 220, 255, 0.8)');
      gradient.addColorStop(0.4, 'rgba(150, 180, 255, 0.4)');
      gradient.addColorStop(0.6, 'rgba(100, 150, 255, 0.15)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(64, 64, 64, 0, Math.PI * 2);
      ctx.fill();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  private createStarfield() {
    const starCount = 5000;
    const geometry = new THREE.BufferGeometry();
    this.starPositions = new Float32Array(starCount * 3);
    this.starVelocities = new Float32Array(starCount * 3);
    this.originalStarPositions = new Float32Array(starCount * 3);
    
    for (let i = 0; i < starCount * 3; i += 3) {
      const radius = 50 + Math.random() * 100;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      
      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta);
      const z = radius * Math.cos(phi);
      
      this.starPositions[i] = x;
      this.starPositions[i + 1] = y;
      this.starPositions[i + 2] = z;
      
      this.originalStarPositions[i] = x;
      this.originalStarPositions[i + 1] = y;
      this.originalStarPositions[i + 2] = z;
      
      this.starVelocities[i] = (Math.random() - 0.5) * 0.01;
      this.starVelocities[i + 1] = (Math.random() - 0.5) * 0.01;
      this.starVelocities[i + 2] = (Math.random() - 0.5) * 0.01;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(this.starPositions, 3));
    
    const starTexture = this.createStarTexture();
    
    this.starMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.3,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
      map: starTexture,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    
    this.starfield = new THREE.Points(geometry, this.starMaterial);
    this.scene.add(this.starfield);
  }

  private createWelcomeUI() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.font = 'bold 140px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.fillText('FlowSpace', canvas.width / 2, canvas.height / 2 - 60);
      
      ctx.font = '24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillText('点击进入', canvas.width / 2, canvas.height / 2 + 60);
      
      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
      });
      const geometry = new THREE.PlaneGeometry(8, 4);
      this.welcomeTextMesh1 = new THREE.Mesh(geometry, material);
      this.welcomeTextMesh1.position.z = 0.1;
      this.scene.add(this.welcomeTextMesh1);
    }
  }

  private setupEventListeners(container: HTMLElement) {
    container.addEventListener('mousedown', (e) => this.onMouseDown(e));
    container.addEventListener('mousemove', (e) => this.onMouseMove(e));
    container.addEventListener('mouseup', () => this.onMouseUp());
    container.addEventListener('mouseleave', () => this.onMouseUp());
    
    container.addEventListener('touchstart', (e) => this.onTouchStart(e));
    container.addEventListener('touchmove', (e) => this.onTouchMove(e));
    container.addEventListener('touchend', () => this.onMouseUp());
    
    container.addEventListener('click', () => this.onClick());
  }

  private onMouseDown(e: MouseEvent) {
    if (this.phase === 'stargazing') {
      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
    }
  }

  private onTouchStart(e: TouchEvent) {
    if (this.phase === 'stargazing' && e.touches.length > 0) {
      this.isDragging = true;
      this.dragStartX = e.touches[0].clientX;
      this.dragStartY = e.touches[0].clientY;
    }
  }

  private onMouseMove(e: MouseEvent) {
    if (this.isDragging && this.phase === 'stargazing') {
      const deltaX = e.clientX - this.dragStartX;
      const deltaY = e.clientY - this.dragStartY;
      
      this.targetCameraRotationY += deltaX * 0.002;
      this.targetCameraRotationX += deltaY * 0.002;
      this.targetCameraRotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.targetCameraRotationX));
      
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
    }
  }

  private onTouchMove(e: TouchEvent) {
    if (this.isDragging && this.phase === 'stargazing' && e.touches.length > 0) {
      const deltaX = e.touches[0].clientX - this.dragStartX;
      const deltaY = e.touches[0].clientY - this.dragStartY;
      
      this.targetCameraRotationY += deltaX * 0.002;
      this.targetCameraRotationX += deltaY * 0.002;
      this.targetCameraRotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.targetCameraRotationX));
      
      this.dragStartX = e.touches[0].clientX;
      this.dragStartY = e.touches[0].clientY;
    }
  }

  private onMouseUp() {
    this.isDragging = false;
  }

  private onClick() {
    if (this.phase === 'welcome') {
      this.phase = 'transition';
      this.transitionProgress = 0;
      this.isShockwaveActive = true;
      this.shockwaveProgress = 0;
      if (this.onPhaseChange) {
        this.onPhaseChange('transition');
      }
    }
  }

  updateEnergy(energy: number) {
    this.targetEnergy = energy;
  }

  private animate() {
    requestAnimationFrame(() => this.animate());

    const time = Date.now() * 0.001;
    const lerpFactor = 0.08;
    this.currentEnergy += (this.targetEnergy - this.currentEnergy) * lerpFactor;

    if (this.phase === 'welcome') {
      this.animateWelcomePhase(time);
    } else if (this.phase === 'transition') {
      this.animateTransitionPhase(time);
    } else if (this.phase === 'stargazing') {
      this.animateStargazingPhase(time);
    }

    this.composer.render();
  }

  private animateWelcomePhase(time: number) {
    if (this.welcomeTextMesh1) {
      this.welcomeTextMesh1.position.y = Math.sin(time * 1.5) * 0.1;
    }
  }

  private animateTransitionPhase(_time: number) {
    this.transitionProgress += 0.015;
    
    if (this.isShockwaveActive) {
      this.shockwaveProgress += 0.04;
      this.applyShockwave();
    }

    if (this.welcomeTextMesh1) {
      const material = this.welcomeTextMesh1.material as THREE.MeshBasicMaterial;
      material.opacity = Math.max(0, 1 - this.transitionProgress);
      this.welcomeTextMesh1.scale.multiplyScalar(1.015);
    }

    if (this.transitionProgress >= 1) {
      this.phase = 'stargazing';
      if (this.welcomeTextMesh1) {
        this.scene.remove(this.welcomeTextMesh1);
      }
      if (this.onPhaseChange) {
        this.onPhaseChange('stargazing');
      }
    }
  }

  private applyShockwave() {
    const progress = Math.min(1, this.shockwaveProgress);
    
    for (let i = 0; i < this.starPositions.length; i += 3) {
      const ox = this.originalStarPositions[i];
      const oy = this.originalStarPositions[i + 1];
      const oz = this.originalStarPositions[i + 2];
      
      const distFromCenter = Math.sqrt(ox * ox + oy * oy + oz * oz);
      
      const shockwaveStrength = Math.exp(-progress * 3) * (1 - Math.pow(distFromCenter / 150, 2));
      
      const direction = new THREE.Vector3(ox, oy, oz).normalize();
      
      this.starPositions[i] = ox + direction.x * shockwaveStrength * 50;
      this.starPositions[i + 1] = oy + direction.y * shockwaveStrength * 50;
      this.starPositions[i + 2] = oz + direction.z * shockwaveStrength * 50;
    }
    
    const positions = this.starfield.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < this.starPositions.length; i++) {
      positions.array[i] = this.starPositions[i];
    }
    positions.needsUpdate = true;
    
    if (progress >= 1) {
      this.isShockwaveActive = false;
    }
  }

  private animateStargazingPhase(_time: number) {
    this.cameraRotationX += (this.targetCameraRotationX - this.cameraRotationX) * 0.05;
    this.cameraRotationY += (this.targetCameraRotationY - this.cameraRotationY) * 0.05;

    this.camera.rotation.x = this.cameraRotationX;
    this.camera.rotation.y = this.cameraRotationY;

    for (let i = 0; i < this.starPositions.length; i += 3) {
      if (!this.isShockwaveActive) {
        this.starPositions[i] += this.starVelocities[i] * (1 + this.currentEnergy * 2);
        this.starPositions[i + 1] += this.starVelocities[i + 1] * (1 + this.currentEnergy * 2);
        this.starPositions[i + 2] += this.starVelocities[i + 2] * (1 + this.currentEnergy * 2);

        const dist = Math.sqrt(
          this.starPositions[i] ** 2 +
          this.starPositions[i + 1] ** 2 +
          this.starPositions[i + 2] ** 2
        );

        if (dist > 150) {
          const radius = 50 + Math.random() * 50;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.random() * Math.PI;
          
          const x = radius * Math.sin(phi) * Math.cos(theta);
          const y = radius * Math.sin(phi) * Math.sin(theta);
          const z = radius * Math.cos(phi);
          
          this.starPositions[i] = x;
          this.starPositions[i + 1] = y;
          this.starPositions[i + 2] = z;
          
          this.originalStarPositions[i] = x;
          this.originalStarPositions[i + 1] = y;
          this.originalStarPositions[i + 2] = z;
        }
      }
    }

    const positions = this.starfield.geometry.attributes.position as THREE.BufferAttribute;
    if (!this.isShockwaveActive) {
      for (let i = 0; i < this.starPositions.length; i++) {
        positions.array[i] = this.starPositions[i];
      }
    }
    positions.needsUpdate = true;

    this.starMaterial.size = 0.2 + this.currentEnergy * 0.3;
    this.bloomPass.strength = 0.3 + this.currentEnergy * 0.8;
    this.bloomPass.threshold = 0.85 - this.currentEnergy * 0.3;
    
    const hue = 0.55 + this.currentEnergy * 0.1;
    this.starMaterial.color.setHSL(hue, 0.3, 0.7 + this.currentEnergy * 0.3);
  }
}
