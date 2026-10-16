# Automap fixture (Phase 4 smoke)

Minimal Tiled-style AutoMap setup:

- `rule_simple.tmj` — 3×3 rule map with `Regions`, `Input_Ground` (gid 5), `Output_Ground` (gid 9) at cell (1,1)
- `work.tmj` — 4×4 map, `Ground` has gid 5 at (1,1) and (3,2)
- `rules.txt` / `rules.json` — rule list

After `tiled-web automap work.tmj --rules rules.txt`, both matched cells become gid **9**.

## CLI subset limits

See main README Phase 4 notes: no live automap, no rule editor UI, no AutomappingRadius clipping, finite layers only.
