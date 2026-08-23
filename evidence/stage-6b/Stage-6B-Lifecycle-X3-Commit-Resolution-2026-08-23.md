# Stage 6B lifecycle/X3 commit-resolution readback

**Readback date:** 2026-08-23  
**Evidence repository:** GitHub relay repository `JerryFeet/MV-DevOps-Relay`, branch `main`.
**Workspace implementation commit (context only):** `113935541565160090fd760f0c6a118b3691f878`

The implementation commit above belongs to the workspace repository. The evidence commits below belong to the relay repository and are the externally verifiable provenance.

## Relay commit and blob resolution

Each relay publication was read back with the GitHub API commit endpoint and the `main`-branch contents endpoint. Every returned commit and blob resolved in `JerryFeet/MV-DevOps-Relay`.

| File | Relay publication commit | Relay blob |
|---|---|---|
| `Stage-6B-Lifecycle-X3-Verification-2026-08-23.md` | `fc2dd5dca59ef379e47d3ede65662692b1189db3` | `c78175fca409d036b53c643312efcca394189e8e` |
| `Stage-6B-Destructive-Mutation-Inventory-2026-08-23.md` | `13ed726e8c83102ac21bc6d28fcb5bfbed74ae24` | `a337525710e6e07032fddf37d98462394c28f4e5` |
| `Stage-6B-Lifecycle-X3-Evidence-Manifest-2026-08-23.sha256` | `f6da5ac934c5d696832f4ff1b9516b36b812bca5` | `72504cb4a1f39693cf9ab8a40786674870a6b78c` |

The resolution document itself is published as a separate relay commit after this mapping was prepared; its returned commit/blob are verified by the final publication readback.

## SHA-256 readback

```text
20f3dac081213aed61a2b93fc5b01c463eb24a7d303dd14c4fed06984c6e7308  evidence/stage-6b/Stage-6B-Lifecycle-X3-Verification-2026-08-23.md
fed9ebb4e50b3e2e169f0504ceea8e962fbb04fdf6d40236113b43f331d52caa  evidence/stage-6b/Stage-6B-Destructive-Mutation-Inventory-2026-08-23.md
```

The two SHA-256 values match the dedicated manifest in the relay publication commit shown above.

## Publication assertions

The publication process uses `assertRelayPublication`, which fails closed unless:

- every commit and blob ID matches exactly `^[0-9a-f]{40}$`;
- every path is inside the evidence tree;
- the repository is exactly `JerryFeet/MV-DevOps-Relay`; and
- the commit and blob have both resolved successfully in that relay repository.