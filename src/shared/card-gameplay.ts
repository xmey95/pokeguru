import type { CardGameplay } from './catalog'

type Data = Record<string, unknown>

function object(value: unknown): Data | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Data : null
}

function label(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function labels(value: unknown): string[] {
  return Array.isArray(value) ? value.map(label).filter((item): item is string => item !== null) : []
}

function modifiers(value: unknown): { type: string; value: string }[] {
  return Array.isArray(value) ? value.flatMap((item) => {
    const entry = object(item)
    const type = label(entry?.type)
    const amount = label(entry?.value)
    return type && amount ? [{ type, value: amount }] : []
  }) : []
}

/** Keep competitive card properties from the full TCGdex card response. */
export function extractCardGameplay(value: unknown): CardGameplay | null {
  const card = object(value)
  if (!card || !['Pokemon', 'Trainer', 'Energy'].includes(String(card.category))) return null
  const attacks = Array.isArray(card.attacks) ? card.attacks.flatMap((item) => {
    const attack = object(item)
    const name = label(attack?.name)
    return name ? [{ name, cost: Array.isArray(attack?.cost) ? labels(attack.cost) : null,
      damage: typeof attack?.damage === 'number' || typeof attack?.damage === 'string'
        ? String(attack.damage) : null,
      effect: label(attack?.effect) }] : []
  }) : []
  const abilities = Array.isArray(card.abilities) ? card.abilities.flatMap((item) => {
    const ability = object(item)
    const name = label(ability?.name)
    const effect = label(ability?.effect)
    return name && effect ? [{ name, effect, type: label(ability?.type) }] : []
  }) : []
  if ((Array.isArray(card.attacks) && attacks.length !== card.attacks.length) ||
    (Array.isArray(card.abilities) && abilities.length !== card.abilities.length)) return null
  const hp = typeof card.hp === 'number' && Number.isInteger(card.hp) && card.hp > 0 ? card.hp : null
  const retreat = typeof card.retreat === 'number' && Number.isInteger(card.retreat) && card.retreat >= 0
    ? card.retreat : null
  return { hp, types: labels(card.types), evolveFrom: label(card.evolveFrom), attacks, abilities,
    effect: label(card.effect), trainerType: label(card.trainerType),
    weaknesses: modifiers(card.weaknesses), resistances: modifiers(card.resistances), retreat }
}

/** A missing property is not evidence that two printings have equivalent rules. */
export function hasComparableGameplay(category: string | null, stage: string | null,
  energyType: string | null, gameplay: CardGameplay | null): boolean {
  if (!gameplay) return false
  if (category === 'Trainer') return !!gameplay.trainerType && !!gameplay.effect
  if (category === 'Energy') return energyType === 'Basic' || energyType === 'Normal' ||
    (energyType === 'Special' && !!gameplay.effect)
  return category === 'Pokemon' && !!stage && gameplay.hp !== null && gameplay.types.length > 0 &&
    gameplay.attacks.length + gameplay.abilities.length > 0 &&
    gameplay.attacks.every((attack) => attack.cost !== null)
}

export function gameplaySummary(gameplay: CardGameplay): string {
  const pieces = [
    gameplay.hp === null ? '' : `HP ${gameplay.hp}`,
    gameplay.types.length ? `tipi ${gameplay.types.join('/')}` : '',
    gameplay.evolveFrom ? `evolve da ${gameplay.evolveFrom}` : '',
    gameplay.trainerType ? `tipo Trainer ${gameplay.trainerType}` : '',
    ...gameplay.abilities.map((ability) => `Abilità ${ability.name}: ${ability.effect}`),
    ...gameplay.attacks.map((attack) => `Attacco ${attack.name}; costo ${attack.cost === null ? 'non indicato'
      : attack.cost.join('+') || 'nessuno'}; ` +
      `danno ${attack.damage ?? 'nessuno'}; effetto ${attack.effect ?? 'nessuno'}`),
    gameplay.effect ? `Effetto: ${gameplay.effect}` : '',
    gameplay.weaknesses.length ? `debolezza ${gameplay.weaknesses.map((item) => `${item.type} ${item.value}`).join(', ')}`
      : gameplay.hp !== null ? 'debolezza non riportata nella scheda' : '',
    gameplay.resistances.length ? `resistenza ${gameplay.resistances.map((item) => `${item.type} ${item.value}`).join(', ')}`
      : gameplay.hp !== null ? 'resistenza non riportata nella scheda' : '',
    gameplay.retreat === null ? '' : `ritirata ${gameplay.retreat}`
  ].filter(Boolean)
  return pieces.join('; ')
}
