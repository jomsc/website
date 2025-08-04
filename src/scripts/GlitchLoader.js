import * as THREE from 'three';
import { vertexShader, fragmentShader } from './shaders.js';

export class GlitchLoader {
  constructor(options = {}) {
    console.log('GlitchLoader constructor called with options:', options);
    
    this.canvasId = options.canvasId || 'glitch-canvas';
    this.videoId = options.videoId || 'glitch-video';
    this.loadingTextClass = options.loadingTextClass || 'glitch-loading-text';
    this.minDuration = options.minDuration || 500;
    this.fadeDuration = options.fadeDuration || 500;
    
    const canvas = document.getElementById(this.canvasId);
    if (!canvas) {
      console.error(`Canvas element with id "${this.canvasId}" not found`);
      return;
    }
    
    console.log('Canvas found:', canvas);
    
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.renderer = new THREE.WebGLRenderer({ 
      canvas: canvas,
      alpha: true 
    });
    
    console.log('Three.js renderer created');
    
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    
    this.startTime = Date.now();
    this.videoLoaded = false;
    this.fadeStartTime = null;
    this.isAnimating = true;
    
    this.init();
  }
  
  init() {
    this.initShader();
    this.initVideo();
    this.bindEvents();
    this.animate();
  }
  
  initShader() {
    console.log('Initializing shader...');
    
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uFadeOut: { value: 0 }
      },
      transparent: true
    });
    
    console.log('Shader material created:', this.material);
    
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.scene.add(this.mesh);
    
    console.log('Mesh added to scene');
  }
  
  initVideo() {
    this.video = document.getElementById(this.videoId);
    this.loadingText = document.querySelector(`.${this.loadingTextClass}`);
    
    if (!this.video) {
      console.error(`Video element with id "${this.videoId}" not found`);
      return;
    }
    
    this.video.addEventListener('canplaythrough', () => {
      this.onVideoLoaded();
    });
    
    // Start loading the video
    this.video.load();
  }
  
  onVideoLoaded() {
    const elapsed = Date.now() - this.startTime;
    
    // Always wait for minimum duration, regardless of when video loads
    const remainingTime = Math.max(0, this.minDuration - elapsed);
    
    setTimeout(() => {
      this.startFadeOut();
    }, remainingTime);
    
    this.videoLoaded = true;
  }
  
  startFadeOut() {
    this.fadeStartTime = Date.now();
    
    if (this.loadingText) {
      this.loadingText.style.opacity = '0';
    }
    
    // Show the video with fade-in effect
    if (this.video) {
      this.video.classList.add('loaded');
      // Start playing the video
      this.video.play().catch(e => {
        console.log('Video autoplay prevented:', e);
        // You might want to show a play button here
      });
    }
  }
  
  bindEvents() {
    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.material.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
    });
    
    // Handle video click for mobile browsers that require user interaction
    document.addEventListener('click', () => {
      if (this.video && this.video.paused) {
        this.video.play().catch(e => console.log('Play failed:', e));
      }
    });
  }
  
  animate() {
    if (!this.isAnimating) return;
    
    requestAnimationFrame(() => this.animate());
    
    const currentTime = Date.now();
    const elapsed = (currentTime - this.startTime) / 1000;
    
    this.material.uniforms.uTime.value = elapsed;
    
    // Handle fade out
    if (this.fadeStartTime) {
      const fadeElapsed = currentTime - this.fadeStartTime;
      const fadeProgress = Math.min(fadeElapsed / this.fadeDuration, 1);
      this.material.uniforms.uFadeOut.value = fadeProgress;
      
      if (fadeProgress >= 1) {
        // Hide the shader canvas completely
        const canvas = document.getElementById(this.canvasId);
        if (canvas) {
          canvas.style.display = 'none';
        }
        this.isAnimating = false;
        console.log('Animation completed and stopped');
        return; // Stop animating
      }
    }
    
    this.renderer.render(this.scene, this.camera);
  }
  
  start() {
    this.isAnimating = true;
    this.animate();
  }
  
  destroy() {
    this.isAnimating = false;
    if (this.renderer) {
      this.renderer.dispose();
    }
    if (this.material) {
      this.material.dispose();
    }
  }
}