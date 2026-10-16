# Automap fixture

Minimal Tiled-style AutoMap setup:

- `rule_simple.tmj` — 3×3 rule map with `Regions`, `Input_Ground` (gid 5), `Output_Ground` (gid 9) at cell (1,1)
- `work.tmj` — 4×4 map, `Ground` has gid 5 at (1,1) and (3,2)
- `rules.txt` / `rules.json` — rule list

After `tiled-web automap work.tmj --rules rules.txt`, both matched cells become gid **9**.

## Limits

The CLI applies rules in one batch (no live automap, no visual rule editor). Use `--radius N --x X --y Y` to limit the area.
