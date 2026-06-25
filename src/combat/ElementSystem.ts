import { Element } from '@/types';
import type { Affinities, ElementName } from '@/types';

const ADVANTAGE = 1.5;
const DISADVANTAGE = 0.67;

export const ELEMENT_COLORS: Record<ElementName, string> = {
  [Element.Physical]: '#cfcfcf',
  [Element.Fire]: '#ff6a3a',
  [Element.Frost]: '#6ac8ff',
  [Element.Poison]: '#72c35b',
  [Element.Lightning]: '#ffe14a',
  [Element.Arcane]: '#b46aff',
  [Element.Void]: '#7a3aff',
};

export class ElementSystem {
  /** Triangulo elemental: Fogo > Gelo > Arcano > Fogo. Fisico e Veneno sao neutros. */
  static getMultiplier(atk: ElementName, def: ElementName): number {
    if (atk === Element.Fire && def === Element.Frost) return ADVANTAGE;
    if (atk === Element.Frost && def === Element.Arcane) return ADVANTAGE;
    if (atk === Element.Arcane && def === Element.Fire) return ADVANTAGE;

    if (atk === Element.Fire && def === Element.Arcane) return DISADVANTAGE;
    if (atk === Element.Frost && def === Element.Fire) return DISADVANTAGE;
    if (atk === Element.Arcane && def === Element.Frost) return DISADVANTAGE;

    return 1;
  }

  static getLabel(multiplier: number): string {
    if (multiplier >= ADVANTAGE) return 'SUPER EFETIVO!';
    if (multiplier <= DISADVANTAGE) return 'Pouco efetivo...';
    return '';
  }

  /** Alias legado que tambem aplica afinidades especificas do defensor. */
  static multiplier(
    attack: ElementName,
    defenderElement: ElementName,
    defenderAffinities: Affinities = {},
  ): number {
    return this.getMultiplier(attack, defenderElement) * (defenderAffinities[attack] ?? 1);
  }

  static describe(multiplier: number): string {
    return this.getLabel(multiplier);
  }
}
