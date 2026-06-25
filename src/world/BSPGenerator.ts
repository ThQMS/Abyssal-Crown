import { TileMap } from '@/world/TileMap';
import { Tile } from '@/world/Tile';
import { Room } from '@/world/Room';
import { TileType } from '@/types';
import { RNG } from '@/utils/RNG';

/** No da arvore de particionamento binario do espaco. */
export interface BSPNode {
  x: number;
  y: number;
  w: number;
  h: number;
  left?: BSPNode;
  right?: BSPNode;
  room?: Room;
}

/** Menor dimensao de uma folha antes de parar de dividir. */
const MIN_LEAF = 10;
/** Tamanho minimo de uma sala. */
const MIN_ROOM = 6;
/** Tamanho maximo de uma sala. */
const MAX_ROOM = 14;
/** Profundidade maxima de recursao da divisao. */
const MAX_DEPTH = 8;

/**
 * Gerador de masmorra por Binary Space Partitioning. Divide o espaco
 * recursivamente em folhas, escava uma sala por folha e conecta salas irmas com
 * corredores em L. Totalmente determinista dado um `seed`.
 *
 * O mapa comeca preenchido com {@link TileType.Void}; salas e corredores gravam
 * {@link TileType.Floor}. As salas geradas ficam disponiveis em {@link rooms}.
 */
export class BSPGenerator {
  static readonly MIN_LEAF = MIN_LEAF;
  static readonly MIN_ROOM = MIN_ROOM;
  static readonly MAX_ROOM = MAX_ROOM;

  /** Salas criadas na ultima chamada a {@link generate}, na ordem de criacao. */
  readonly rooms: Room[] = [];

  private rng = new RNG(1);
  private map = new TileMap(1, 1);

  /** Gera um andar completo de `width`×`height` tiles a partir de `seed`. */
  generate(width: number, height: number, seed: number): TileMap {
    this.rng = new RNG(seed);
    this.rooms.length = 0;
    this.map = new TileMap(width, height, TileType.Void);

    const root: BSPNode = { x: 0, y: 0, w: width, h: height };
    this.split(root, 0, this.rng.nextBool(0.5));
    this.createRooms(root);
    this.connectAll(root);

    return this.map;
  }

  /** Divide recursivamente um no, alternando horizontal/vertical. */
  private split(node: BSPNode, depth: number, horizontal: boolean): void {
    if (depth >= MAX_DEPTH) return;

    const canSplitH = node.h >= MIN_LEAF * 2;
    const canSplitV = node.w >= MIN_LEAF * 2;
    if (!canSplitH && !canSplitV) return;

    // Respeita a orientacao alternada, mas cede quando ela nao cabe.
    let splitH = horizontal;
    if (splitH && !canSplitH) splitH = false;
    if (!splitH && !canSplitV) splitH = true;
    if ((splitH && !canSplitH) || (!splitH && !canSplitV)) return;

    if (splitH) {
      const cut = this.rng.nextInt(MIN_LEAF, node.h - MIN_LEAF);
      node.left = { x: node.x, y: node.y, w: node.w, h: cut };
      node.right = { x: node.x, y: node.y + cut, w: node.w, h: node.h - cut };
    } else {
      const cut = this.rng.nextInt(MIN_LEAF, node.w - MIN_LEAF);
      node.left = { x: node.x, y: node.y, w: cut, h: node.h };
      node.right = { x: node.x + cut, y: node.y, w: node.w - cut, h: node.h };
    }

    this.split(node.left, depth + 1, !splitH);
    this.split(node.right, depth + 1, !splitH);
  }

  /** Cria uma sala em cada folha e grava FLOOR (com variante aleatoria). */
  private createRooms(node: BSPNode): void {
    if (node.left || node.right) {
      if (node.left) this.createRooms(node.left);
      if (node.right) this.createRooms(node.right);
      return;
    }

    const maxW = Math.min(MAX_ROOM, node.w - 2);
    const maxH = Math.min(MAX_ROOM, node.h - 2);
    if (maxW < MIN_ROOM || maxH < MIN_ROOM) return;

    const w = this.rng.nextInt(MIN_ROOM, maxW);
    const h = this.rng.nextInt(MIN_ROOM, maxH);
    const x = node.x + this.rng.nextInt(1, node.w - w - 1);
    const y = node.y + this.rng.nextInt(1, node.h - h - 1);

    const room = new Room(x, y, w, h);
    for (let ry = y; ry < y + h; ry++) {
      for (let rx = x; rx < x + w; rx++) {
        this.map.set(rx, ry, new Tile(TileType.Floor, this.rng.nextInt(0, 2)));
      }
    }

    node.room = room;
    this.rooms.push(room);
  }

  /** Conecta salas irmas de baixo para cima na arvore. */
  private connectAll(node: BSPNode): Room | undefined {
    if (!node.left && !node.right) return node.room;

    const a = node.left ? this.connectAll(node.left) : undefined;
    const b = node.right ? this.connectAll(node.right) : undefined;
    if (a && b) this.connectRooms(a, b);

    // Propaga uma das salas para o ancestral continuar ligando.
    return a ?? b;
  }

  /** Liga dois centros de sala com um corredor em L (50% horizontal primeiro). */
  private connectRooms(a: Room, b: Room): void {
    const start = a.center;
    const end = b.center;

    if (this.rng.nextBool(0.5)) {
      this.carveH(start.x, end.x, start.y);
      this.carveV(start.y, end.y, end.x);
    } else {
      this.carveV(start.y, end.y, start.x);
      this.carveH(start.x, end.x, end.y);
    }
  }

  /** Escava um corredor horizontal, apenas onde o tile e VOID. */
  private carveH(x0: number, x1: number, y: number): void {
    const [lo, hi] = x0 < x1 ? [x0, x1] : [x1, x0];
    for (let x = lo; x <= hi; x++) {
      if (this.map.get(x, y)?.type === TileType.Void) {
        this.map.set(x, y, new Tile(TileType.Floor, this.rng.nextInt(0, 2)));
      }
    }
  }

  /** Escava um corredor vertical, apenas onde o tile e VOID. */
  private carveV(y0: number, y1: number, x: number): void {
    const [lo, hi] = y0 < y1 ? [y0, y1] : [y1, y0];
    for (let y = lo; y <= hi; y++) {
      if (this.map.get(x, y)?.type === TileType.Void) {
        this.map.set(x, y, new Tile(TileType.Floor, this.rng.nextInt(0, 2)));
      }
    }
  }
}
