/**
 * SFX-PREFILTER-001 (2026-10-30): Orion's keyword curation filed many wrong
 * recordings under plain names ("bar crowd murmur" ← a cow mooing, "gun cock
 * slide racked" ← ice cracking, "bullet ricochet" ← music stingers). Marc's ear
 * is the final judge (only kept sounds are used), but 645 sounds is too many
 * to wade through. This pass marks the OBVIOUS mismatches as removed, so the
 * To review list holds only plausible candidates. Marc can restore any of them
 * from the Removed tab.
 *
 * Rule: the recording's own original name (the part after "-sonnissYYYY-N-")
 * must contain one of the item's required words, and none of the global
 * deny words. Files without an original name ("car-idle-1") are left for Marc.
 */

/** Item (plain name prefix) → words the original recording name must contain. */
export const ITEM_REQUIRED_WORDS: Record<string, string[]> = {
  'bar crowd murmur': ['bar', 'pub', 'restaurant', 'walla', 'crowd'],
  'body falls floor': ['bodyfall', 'body'],
  'body slammed against wall': ['body'],
  'bullet impacts car metal': ['bullet'],
  'bullet ricochet': ['ricochet'],
  'car brakes hard stop': ['skid', 'brakes', 'screech'],
  'car chase engine revving': ['car', 'bmw', 'ford', 'jeep', 'volvo', 'corvette', 'race', 'indycar', 'probe', 'polonez', 'mustang'],
  'car crash impact metal': ['car', 'crash', 'peugeot', 'mercedes'],
  'car engine start': ['car', 'bmw', 'ford', 'jeep', 'volvo', 'ignition'],
  'car horn': ['car', 'horn'],
  'car idle': ['car', 'bmw', 'corvette', 'jeep', 'volvo', 'polonez'],
  'car pass by fast': ['passby', 'pass', 'car'],
  'car door open': ['door'],
  'car door close': ['door'],
  'car trunk close': ['trunk', 'boot'],
  'city street crowd day': ['city', 'street', 'crowd'],
  'city street night traffic': ['city', 'street', 'traffic'],
  'dog barking distant': ['dog', 'bark'],
  'door close wood': ['door'],
  'door creak open slow': ['door'],
  'door lock latch': ['door', 'lock', 'deadbolt', 'latch'],
  'door open wood': ['door'],
  'door slam': ['door', 'slam'],
  'door knock hard': ['knock'],
  'door kicked in splinter': ['door', 'kick'],
  'explosion near': ['explosion'],
  'footsteps concrete walking': ['footstep', 'footsteps', 'fs', 'steps'],
  'footsteps concrete running': ['footstep', 'footsteps', 'fs', 'run', 'running'],
  'footsteps wet street running': ['footstep', 'footsteps', 'fs', 'run', 'running'],
  'footsteps stairs running': ['footstep', 'footsteps', 'fs', 'stairs'],
  'footsteps hallway tile': ['footstep', 'footsteps', 'fs'],
  'glass bottle smash': ['glass', 'bottle'],
  'glass break window': ['glass', 'window', 'shatter'],
  'gun cock slide racked': ['gun', 'cock', 'pistol', 'rifle', 'slide'],
  'gun dry fire click': ['gun', 'dry', 'pistol'],
  'handcuffs click': ['handcuff', 'handcuffs', 'cuffs'],
  'helicopter overhead': ['helicopter', 'agusta', 'bell'],
  'kick door in': ['door', 'kick'],
  'landline ringing old': ['telephone', 'phone', 'ring', 'rings', 'ringing'],
  'man grunt hit': ['grunt', 'pain'],
  'metal door slam heavy': ['door'],
  'phone hang up click': ['phone', 'telephone', 'handset'],
  'phone notification ding': ['phone', 'notification'],
  'phone ring cell': ['cellphone', 'phone', 'telephone', 'ring', 'rings'],
  'phone vibrate buzz table': ['vibrate', 'vibration'],
  'pistol shot close indoor': ['pistol', 'gun', 'revolver', 'glock', 'beretta', 'sig', 'colt'],
  'pistol shot outdoor street': ['pistol', 'gun', 'revolver', 'glock', 'beretta', 'sig', 'colt'],
  'pistol shots rapid three': ['pistol', 'beretta', 'sig', 'glock', 'colt', 'triple'],
  'police radio chatter static': ['radio', 'walkie', 'static'],
  'police siren close wail': ['siren'],
  'police siren pass by': ['siren'],
  'punch body': ['punch'],
  'punch face': ['punch'],
  'rain on street': ['rain'],
  'rain on window': ['rain'],
  'river water lapping dock': ['water', 'river', 'lapping', 'waves', 'lake'],
  'shell casings falling concrete': ['shell', 'casing', 'casings'],
  'shotgun blast': ['shotgun'],
  'struggle scuffle grunts': ['grunt', 'fight', 'scuffle', 'struggle'],
  'thunder close': ['thunder'],
  'tires screech skid': ['tire', 'tyre', 'tires', 'screech', 'skid'],
  'warehouse room tone echo': ['warehouse', 'industrial', 'room', 'roomtone'],
  'wind gusts': ['wind'],
  'wood crash furniture break': ['wood', 'furniture'],
}

/** Never right in a crime/action drama, whatever the item. */
export const DENY_WORDS = [
  'sci', 'scifi', 'fi', 'podracer', 'plasma', 'synth', 'glitch', 'stinger', 'music', 'cow', 'orc', 'orcs', 'owl', 'futuristic',
  'spacecraft', 'space', 'planet', 'bit', 'burp', 'firework', 'bicycle', 'child', 'celery', 'cabbage', 'spatula', 'crackers',
  'microwave', 'fridge', 'cupboard', 'closet', 'drawer', 'draw', 'hydrophone', 'cheer', 'clapping', 'applause', 'tank', 'tractor',
  'excavator', 'harvester', 'chainsaw', 'leaf', 'flamingo', 'coyotes', 'jungle', 'windbell', 'medieval', 'steampunk', 'magic',
  'cartoon', 'tiger', 'sherman', 'chaffee', 'm1', 'skot', 'm42', 'gaz', 'leather', 'chair', 'seaplane', 'plane', 'aircraft',
  'chairlift', 'ski', 'snowboard', 'sled', 'cave', 'mine', 'geyser', 'screwdriver', 'vespa', 'theater', 'whoosh', 'emf', 'ice',
  'instru', 'string', 'bass', 'cymbal', 'drum', 'texturethunderdrum',
]

function words(s: string): string[] {
  return String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

/** Split "punch-face-sonniss2017-0-punch-grit-wet-impact-05" → item + original name. */
export function splitCuratedId(fileStem: string): { item: string; original: string } | null {
  const m = String(fileStem).match(/^(.*?)-sonniss(\d{4})-\d+-(.+)$/)
  if (!m) return null
  return { item: m[1].replace(/-/g, ' ').trim(), original: m[3] }
}

export type PrefilterVerdict = { decision: 'reject' | 'keep_for_review'; reason: string }

export function prefilterCurated(fileStem: string): PrefilterVerdict {
  const split = splitCuratedId(fileStem)
  if (!split) return { decision: 'keep_for_review', reason: 'no original name' }
  const orig = words(split.original)
  const deny = orig.find((w) => DENY_WORDS.includes(w))
  if (deny) return { decision: 'reject', reason: `unsuitable recording ("${deny}")` }
  const required = ITEM_REQUIRED_WORDS[split.item]
  if (!required) return { decision: 'keep_for_review', reason: 'item not in list' }
  const hit = orig.some((w) => required.includes(w) || required.some((r) => r.length >= 5 && w.startsWith(r)))
  return hit ? { decision: 'keep_for_review', reason: 'plausible' } : { decision: 'reject', reason: `recording is not a ${split.item}` }
}

/** First-batch (Oct 29) sounds that a crime/action drama never uses. */
export const FIRST_BATCH_DENY = [
  'sci', 'scifi', 'magic', 'spell', 'magicpack2', 'electricityspells', 'spell2', 'tibetan', 'vacuum', 'horse', 'feethors', 'robot', 'bumper', 'cannonball', 'broadside', 'sail',
  'projectile', 'potato', 'synth', 'chimes', 'bellmisc', 'coins', 'cards', 'pawns', 'cardboard', 'zapper', 'radioactive', 'submarine',
  'underwater', 'ringing', 'tree', 'piano', 'stinger', 'riser', 'grenade', 'drone', 'ice', 'frozen', 'snow', 'mud', 'kindergarten',
  'children', 'school', 'classroom', 'rooster', 'canine', 'howling', 'airport', 'italian', 'seaside', 'blackpool', 'church', 'bellmen',
  'typewriter', 'comtype', 'tractor', 'infanterikanonvagn', 'brdm2', 'polaris', 'textron', 'chisel', 'sword', 'swsh', 'slasher',
  'scream', 'bubbles', 'bottle', 'tablet', 'carpet', 'brushing', 'anf003', 'anf024', 'anf036', 'anf045', 'anf063', 'anf082', 'anf090', 'anf108',
  'clockchim', 'clockmech', 'clockmisc', 'ccts', 'glitch', 'uiglitch', 'eternity', 'better', 'dsgnbass', 'dsgndron', 'dsgnmisc', 'dsgnrise',
  'w', 'distortion', 'supermarket', 'market', 'harbour', 'roosvelt', 'zil', 'garbage', 'waves', 'forest', 'birds', 'arctic',
]

export function prefilterFirstBatch(fileStem: string): PrefilterVerdict {
  const w = words(fileStem)
  const deny = w.find((x) => FIRST_BATCH_DENY.includes(x))
  return deny ? { decision: 'reject', reason: `unsuitable for crime/action ("${deny}")` } : { decision: 'keep_for_review', reason: 'plausible' }
}
