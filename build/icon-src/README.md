Icon sources. `lens.svg` is the master (no filters: gradients, opacity and strokes only, so every renderer agrees),
`lens-micro.svg` is the simplified master for 16-48 px, `lens.outlined.svg` is `lens.svg` with strokes expanded to
fills (VectorCraft: select.all + object.path.outlineStroke). `../icon.png` is the 1024 px export used by
electron-builder; `../icons/` holds the Linux sizes (micro master up to 48 px, full master from 64 px).
