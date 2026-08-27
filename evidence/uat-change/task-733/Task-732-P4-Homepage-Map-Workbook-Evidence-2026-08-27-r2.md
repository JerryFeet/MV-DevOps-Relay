# Task 732 P4 homepage-map workbook evidence — r2

## Result

PASS. The real public homepage iframe uses `24.8271875,46.7808125` with zoom `17`.

## Browser proof

- Desktop screenshot retained.
- 390 × 844 portrait screenshot retained.
- Resize to 844 × 844 retained.
- At each viewport the map iframe horizontal center matches the viewport center within 8 pixels.
- The iframe source continues to identify the Madain Village center after resize.

## Deliberate refusal

The browser test asserts that the previous unsupported coordinate `24.774265,46.738586` is not present. Passing means the legacy location is refused.

## Retained files

- `Task-730-732-browser-evidence-source-r2.ts`
- `Task-732-P4-map-desktop-r2.png`
- `Task-732-P4-map-390-r2.png`
- `Task-732-P4-map-resized-r2.png`