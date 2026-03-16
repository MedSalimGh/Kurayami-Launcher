/**
 * particles.js — Solo Leveling floating particle background
 * Purple/blue glowing orbs drifting upward — shadow army atmosphere
 */

class ParticleSystem {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.maxParticles = 35;
        this.animationId = null;

        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.init();
        this.animate();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    createParticle() {
        const colors = [
            { r: 123, g: 47, b: 247 },   // purple
            { r: 153, g: 69, b: 255 },   // light purple
            { r: 0, g: 170, b: 255 },     // blue
            { r: 0, g: 212, b: 255 },     // cyan
            { r: 179, g: 102, b: 255 },   // lavender
        ];
        const color = colors[Math.floor(Math.random() * colors.length)];
        return {
            x: Math.random() * this.canvas.width,
            y: this.canvas.height + Math.random() * 100,
            size: Math.random() * 3 + 1,
            speedY: -(Math.random() * 0.4 + 0.1),
            speedX: (Math.random() - 0.5) * 0.3,
            opacity: Math.random() * 0.4 + 0.1,
            opacityDir: Math.random() > 0.5 ? 1 : -1,
            color,
            life: 0,
            maxLife: Math.random() * 800 + 400,
        };
    }

    init() {
        for (let i = 0; i < this.maxParticles; i++) {
            const p = this.createParticle();
            p.y = Math.random() * this.canvas.height;
            p.life = Math.random() * p.maxLife;
            this.particles.push(p);
        }
    }

    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.speedX;
            p.y += p.speedY;
            p.life++;

            // Pulse opacity
            p.opacity += p.opacityDir * 0.002;
            if (p.opacity > 0.5) p.opacityDir = -1;
            if (p.opacity < 0.05) p.opacityDir = 1;

            // Draw
            this.ctx.beginPath();
            const gradient = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
            gradient.addColorStop(0, `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, ${p.opacity})`);
            gradient.addColorStop(1, `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, 0)`);
            this.ctx.fillStyle = gradient;
            this.ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
            this.ctx.fill();

            // Core
            this.ctx.beginPath();
            this.ctx.fillStyle = `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, ${p.opacity * 1.5})`;
            this.ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
            this.ctx.fill();

            // Remove dead particles
            if (p.life > p.maxLife || p.y < -20 || p.x < -20 || p.x > this.canvas.width + 20) {
                this.particles.splice(i, 1);
            }
        }

        // Spawn new particles
        while (this.particles.length < this.maxParticles) {
            this.particles.push(this.createParticle());
        }

        this.animationId = requestAnimationFrame(() => this.animate());
    }
}

// Auto-init
document.addEventListener('DOMContentLoaded', () => {
    new ParticleSystem('particles-canvas');
});
