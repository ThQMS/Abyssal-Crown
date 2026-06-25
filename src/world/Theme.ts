/**
 * Temas (biomas) da masmorra. Cada faixa de andares tem aparência própria —
 * cor de fundo, sprite de parede, variantes de chão e um tom (tint) aplicado
 * sobre os tiles — para que os andares não pareçam todos iguais.
 *
 * A descoberta continua gradual: a névoa de guerra (FogOfWar / minimapa) só
 * revela o que o jogador já viu.
 */
export interface DungeonTheme {
  id: string;
  name: string;
  /** Cor de limpeza do canvas (fundo além dos tiles). */
  background: string;
  /** Sprite base de parede no pacote 0x72. */
  wallSprite: string;
  /** Variantes de chão (floor_N) que este bioma usa. */
  floorVariants: number[];
  /** Tom translúcido aplicado sobre cada tile (rgba) — `null` = sem tom. */
  tint: string | null;
  /** Cor usada para escurecer tiles descobertos mas fora de visão. */
  fogTint: string;
  /** Cor de destaque do bioma (usada na UI/toasts). */
  accent: string;
}

const THEMES: DungeonTheme[] = [
  {
    id: 'crypt',
    name: 'Criptas de Pedra',
    background: '#05050a',
    wallSprite: 'wall_mid',
    floorVariants: [1, 2, 3],
    tint: null,
    fogTint: 'rgba(5,5,10,0.55)',
    accent: '#9a8acd',
  },
  {
    id: 'ice',
    name: 'Cavernas Geladas',
    background: '#07101a',
    wallSprite: 'wall_mid',
    floorVariants: [1, 4, 5],
    tint: 'rgba(90,150,210,0.18)',
    fogTint: 'rgba(7,16,26,0.6)',
    accent: '#6ac8ff',
  },
  {
    id: 'swamp',
    name: 'Pântano Pútrido',
    background: '#08120a',
    wallSprite: 'wall_goo',
    floorVariants: [1, 6, 7],
    tint: 'rgba(90,170,80,0.18)',
    fogTint: 'rgba(8,18,10,0.6)',
    accent: '#7ad88a',
  },
  {
    id: 'infernal',
    name: 'Forja Infernal',
    background: '#170a08',
    wallSprite: 'wall_mid',
    floorVariants: [1, 8, 2],
    tint: 'rgba(210,80,40,0.16)',
    fogTint: 'rgba(23,10,8,0.6)',
    accent: '#ff6a3a',
  },
  {
    id: 'abyss',
    name: 'Santuário Abissal',
    background: '#0c0814',
    wallSprite: 'wall_mid',
    floorVariants: [1, 3, 5],
    tint: 'rgba(150,80,220,0.18)',
    fogTint: 'rgba(12,8,20,0.62)',
    accent: '#b46aff',
  },
];

/**
 * Tema de um andar. Faixas de 2 andares por bioma; além do último, cicla pelos
 * biomas mantendo variedade em runs profundas (New Game+, mais andares).
 */
export function themeForDepth(depth: number): DungeonTheme {
  const index = Math.floor((Math.max(1, depth) - 1) / 2) % THEMES.length;
  return THEMES[index] as DungeonTheme;
}
