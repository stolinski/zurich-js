/**
 * `?index` — the deck as a list.
 *
 * Every slide as a card: number, id, what kind of glass it is (chart, quote,
 * harness…), which set it stands in, flat or tube, and a line of what the glass
 * says, each linking to `?slide=` and `?flat&slide=`. Built from the slide list
 * and the visual catalog at render time, so it cannot fall behind the deck.
 * Presenter tooling like `?flat` and `?hud`: DOM, and never on for a room.
 */
export const INDEX =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('index')
