import { prefilterCurated, prefilterFirstBatch } from '@/lib/sfxPrefilter'

const reject = [
  'bar-crowd-murmur-sonniss2016-0-cow-moo-variety-of-versions-barn-ambience-01',
  'gun-cock-slide-racked-sonniss2018-2-open-healthy-crackers-packet-001',
  'gun-cock-slide-racked-sonniss2017-4-ice-block-crack-distant-medium-03',
  'bullet-ricochet-sonniss2019-0-doubt-d',
  'tires-screech-skid-sonniss2018-0-bicycle-skids-gravel-front-prespective-01',
  'tires-screech-skid-sonniss2019-0-instru-string-double-bass-screech-scrape-harsh-short-08',
  'handcuffs-click-sonniss2016-0-vaeyaniii-shockabsorber-broken-decompress-oil-bubbling-scuff',
  'helicopter-overhead-sonniss2017-0-firework-spin-helicopter-spinner-st',
  'phone-hang-up-click-sonniss2016-0-change-tyre-2',
  'phone-ring-cell-sonniss2019-2-unfathomed-hydrophone-submerged-smallglass-effervescenttabs',
  'punch-face-sonniss2017-4-sci-fi-water-hit-punch-impact-bubbles-granular-set-b-16',
  'punch-face-sonniss2017-5-cardboard-rumble-04-crumbling',
  'explosion-near-sonniss2017-3-weapon-bomb-explosion-sci-fi-plasma-04',
  'car-chase-engine-revving-sonniss2018-0-podracer-engine-start-accelerate06',
  'door-open-wood-sonniss2019-0-microwave-door-open-001',
  'door-creak-open-slow-sonniss2017-1-leather-creak-11',
  'river-water-lapping-dock-sonniss2019-5-cheer-clapping-small-group-in-theater-applause-soun',
  'wood-crash-furniture-break-sonniss2017-0-break-hit-celery-2',
  'phone-notification-ding-sonniss2019-0-owl-notification-005',
]
const keep = [
  'pistol-shots-rapid-three-sonniss2016-4-sig-p229-9mm-50m-behind-ehrlund-r1-clean-triple-sho',
  'pistol-shot-close-indoor-sonniss2017-0-gun-revolver-pistol-shot-04',
  'shotgun-blast-sonniss2016-1-shotgun-fire-slug-01',
  'body-falls-floor-sonniss2019-3-rl-bodyfall-concrete-generic-feet-mid-mono-med-impact-02',
  'punch-body-sonniss2017-0-punch-general-body-impact-03',
  'bullet-impacts-car-metal-sonniss2017-0-bullet-impact-metal-heavy-08',
  'police-siren-close-wail-sonniss2018-1-volvo-v70-t15-ext-fast-by-siren-twice-stop-css5',
  'phone-vibrate-buzz-table-sonniss2019-0-cell-phone-vibrate-alert-normal',
  'landline-ringing-old-sonniss2019-1-siemens-w48-wandapparat-1934-telephone-rings-once-03',
  'car-pass-by-fast-sonniss2018-0-pass-by-sports-car-single-080',
  'rain-on-street-sonniss2019-0-rain-on-concrete-in-alley-splattering-dripping',
  'door-lock-latch-sonniss2018-0-cabin-frontdoor-deadbolt-lock-latch-thick-open-hyper',
  'glass-bottle-smash-sonniss2017-0-glass-bottle-break-smash-messy',
  'police-radio-chatter-static-sonniss2016-1-walkie-talkie-kenwood-tk-3107-fm-radio-communica',
  'car-idle-1',
]

describe('SFX-PREFILTER-001 new batch', () => {
  test.each(reject)('removes %s', (id) => expect(prefilterCurated(id).decision).toBe('reject'))
  test.each(keep)('keeps for review %s', (id) => expect(prefilterCurated(id).decision).toBe('keep_for_review'))
})

describe('SFX-PREFILTER-001 first batch', () => {
  test.each([
    'bluezone-bc0284-soundwave-robot-footsteps-001',
    'magicpack2-electricityspells-spell2-002',
    'retro-vacuum-cleaner-activity-carpet-distant-ortf',
    'dsgnmisc-tibetan-bowl-hits-nightmare-2-344-audio-cymbals-from-hell-vol-3',
    'potato-gun-shot-apples-heavy-blast-ab',
  ])('removes %s', (id) => expect(prefilterFirstBatch(id).decision).toBe('reject'))
  test.each([
    'glock-17-firing-take-1-20m-in-front-ab-mkh8020',
    'vehsirn-ambulancesiren-sanojsounds-mkh416-2496-001',
    'doorknck-int-glass-frontdoor-knock-jse-do-distance-mono',
    'thun-insj-thunder-very-close-rain-03',
    'heavy-hit',
  ])('keeps %s', (id) => expect(prefilterFirstBatch(id).decision).toBe('keep_for_review'))
})
