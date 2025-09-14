import { GameState } from './types';

export class GameRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  renderFrame(state: GameState) {
    // Clear with sky-blue background
    this.ctx.fillStyle = '#87CEEB';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Render all builds with damage visualization
    for (const build of state.builds) {
      this.renderBuild(build);
    }

    // Render players
    for (const player of state.players) {
      this.renderPlayer(player);
    }

    // Render projectiles
    for (const projectile of state.projectiles) {
      this.renderProjectile(projectile);
    }
  }

  private renderBuild(build: any) {
    // Get material color based on build type
    const materialColor = this.getMaterialColor(build.type);
    
    // Calculate alpha based on HP (hp/maxHp)
    const alpha = build.hp / build.maxHp;
    
    // Draw the build with appropriate styling
    this.ctx.fillStyle = `rgba(${materialColor.r}, ${materialColor.g}, ${materialColor.b}, ${alpha})`;
    
    // Draw the build shape (rectangle for now)
    this.ctx.fillRect(build.x, build.y, build.width, build.height);
    
    // Add stroke for grid effect
    this.ctx.strokeStyle = '#000';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(build.x, build.y, build.width, build.height);
  }

  private renderPlayer(player: any) {
    // Render player representation
    // This would be implementation-specific based on your game design
    // For now, just draw a simple circle
    this.ctx.fillStyle = '#ff0000';
    this.ctx.beginPath();
    this.ctx.arc(player.x, player.y, 10, 0, 2 * Math.PI);
    this.ctx.fill();
  }

  private renderProjectile(projectile: any) {
    // Render projectile representation
    // This would be implementation-specific based on your game design
    // For now, just draw a small circle
    this.ctx.fillStyle = '#ffff00';
    this.ctx.beginPath();
    this.ctx.arc(projectile.x, projectile.y, 3, 0, 2 * Math.PI);
    this.ctx.fill();
  }

  private getMaterialColor(type: string): { r: number; g: number; b: number } {
    // Map build types to colors
    const colorMap: { [key: string]: { r: number; g: number; b: number } } = {
      'wood': { r: 139, g: 69, b: 19 }, // Brown
      'stone': { r: 128, g: 128, b: 128 }, // Gray
      'metal': { r: 192, g: 192, b: 192 }, // Silver
      'default': { r: 255, g: 255, b: 255 } // White
    };
    
    return colorMap[type] || colorMap.default;
  }
}