import { TileType, FogState } from '@/types';
import type { TileTypeName, FogStateName } from '@/types';

/**
 * Propriedades estaticas de cada tipo de tile:
 *  - `passable` / `opaque`: regras de movimento e linha de visao
 *  - `sprite`: coordenada (em pixels) no spritesheet
 *    `0x72_DungeonTilesetII_v1.7.png`, onde cada celula tem 16x16
 *
 * Coordenadas extraidas do `tile_list_v1.7` do pacote.
 */
interface TileProps {
  passable: boolean;
  opaque: boolean;
  sprite: { x: number; y: number };
}

const TILE_PROPS: Record<TileTypeName, TileProps> = {
  // Rocha solida e paredes: bloqueiam movimento e visao (sprite wall_mid).
  [TileType.Void]: { passable: false, opaque: true, sprite: { x: 32, y: 16 } },
  [TileType.Wall]: { passable: false, opaque: true, sprite: { x: 32, y: 16 } },
  // Chao: 3 variantes lado a lado (floor_1/2/3 em 16/32/48, y=64).
  [TileType.Floor]: { passable: true, opaque: false, sprite: { x: 16, y: 64 } },
  // Porta aberta (doors_leaf_open).
  [TileType.Door]: { passable: true, opaque: false, sprite: { x: 80, y: 240 } },
  // Escadas (floor_stairs / floor_ladder).
  [TileType.StairsDown]: { passable: true, opaque: false, sprite: { x: 80, y: 192 } },
  [TileType.StairsUp]: { passable: true, opaque: false, sprite: { x: 48, y: 96 } },
  // Agua: intransponivel, mas nao bloqueia a visao (fonte azul).
  [TileType.Water]: { passable: false, opaque: false, sprite: { x: 64, y: 48 } },
  // Entulho: transponivel (floor_7).
  [TileType.Rubble]: { passable: true, opaque: false, sprite: { x: 16, y: 96 } },
};

/** Largura/altura de uma celula do tileset, em pixels. */
export const TILE_PIXELS = 16;

/**
 * Uma celula da masmorra. Calcula `passable`, `opaque` e a coordenada de sprite
 * a partir do `type` e da `variant` no construtor. Mantida leve: o {@link TileMap}
 * possui um array denso destas celulas.
 */
export class Tile {
  type: TileTypeName;
  passable: boolean;
  opaque: boolean;
  /** Coluna do sprite no spritesheet, em pixels. */
  spriteX: number;
  /** Linha do sprite no spritesheet, em pixels. */
  spriteY: number;
  /** Variacao visual (0-2), usada para diversificar pisos. */
  variant: number;
  /** Estado da nevoa de guerra desta celula (comeca oculto). */
  fogState: FogStateName = FogState.Hidden;

  constructor(type: TileTypeName = TileType.Void, variant = 0) {
    this.type = type;
    this.variant = clampVariant(variant);

    const props = TILE_PROPS[type];
    this.passable = props.passable;
    this.opaque = props.opaque;
    // Pisos tem 3 variantes lado a lado; demais tiles ignoram a variante.
    const offset = type === TileType.Floor ? this.variant * TILE_PIXELS : 0;
    this.spriteX = props.sprite.x + offset;
    this.spriteY = props.sprite.y;
  }

  /** Verdadeiro para as duas variantes de escada (transicao de andar). */
  get isStairs(): boolean {
    return this.type === TileType.StairsDown || this.type === TileType.StairsUp;
  }

  /** Alias de compatibilidade com codigo que usa `walkable`. */
  get walkable(): boolean {
    return this.passable;
  }
}

/** Restringe a variante ao intervalo [0, 2]. */
function clampVariant(variant: number): number {
  if (variant < 0) return 0;
  if (variant > 2) return 2;
  return Math.floor(variant);
}
