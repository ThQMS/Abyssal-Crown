import './style.css';
import { Game } from '@/engine/Game';

/**
 * Bootstraps Abyssal Crown: grabs the canvas declared in `index.html`, draws a
 * brief loading frame, then hands control to the {@link Game}.
 */
async function main(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('#game-canvas nao encontrado no documento');

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#b46aff';
    ctx.font = '20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Invocando o abismo...', canvas.width / 2, canvas.height / 2);
  }

  const game = new Game(canvas);
  await game.init();

  // Expose for debugging in the browser console.
  (window as unknown as { game: Game }).game = game;
}

main().catch((err) => {
  console.error('Falha ao iniciar Abyssal Crown:', err);
});
