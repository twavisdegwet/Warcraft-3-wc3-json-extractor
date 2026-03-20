# W3X Map Extractor

Extracts Warcraft III `.w3x` and `.w3m` map files into readable JSON.

## Setup

```bash
npm install
```

## Usage

```bash
node extract-map.js "path/to/map.w3x"
```

Or use npx:

```bash
npx w3x-extract "path/to/map.w3x"
```

This creates a folder named `<mapname>_extracted/` with:
- `raw/` — the original binary files from inside the MPQ archive
- `json/` — translated JSON versions of each file

## Output Files

| JSON file | Contents |
|-----------|----------|
| info.json | Map name, author, description, player slots |
| terrain.json | Tile data, heights, water |
| doodads.json | Trees, rocks, decorations |
| units.json | All placed units on the map |
| units-objects.json | Custom unit definitions |
| abilities-objects.json | Custom abilities |
| items-objects.json | Custom items |
| destructables-objects.json | Destructible objects |
| doodads-objects.json | Doodad definitions |
| cameras.json | Camera positions |
| regions.json | Named regions/rectangles |
| sounds.json | Sound definitions |
| strings.json | Trigger strings and localization |
| war3map.j | JASS trigger script (copied as-is) |

## Known Issues

- Some maps with newer Warcraft III patch formats may fail to parse `war3map.doo` (doodads). The raw binary is preserved in this case.
- Older map formats may fall back to basic parsing for `war3map.w3i` (map info).

## Credits

Uses [stormlib-js](https://github.com/lyeferny/node-stormlib) for MPQ extraction and [wc3maptranslator](https://github.com/ChiefOfGxBxL/WC3MapTranslator) for file parsing.
