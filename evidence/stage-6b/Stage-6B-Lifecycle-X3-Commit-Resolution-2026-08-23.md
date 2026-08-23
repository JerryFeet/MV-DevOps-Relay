# Stage 6B lifecycle/X3 commit-resolution readback

**Readback date:** 2026-08-23  
**Verified implementation commit:** `113935541565160090fd760f0c6a118b3691f878`  
**Evidence-content commit:** `3771c7b9d033ffb53cc35e49400a2abb2291d76f`

## Commit-object resolution

```text
git rev-parse 3771c7b9d033ffb53cc35e49400a2abb2291d76f
3771c7b9d033ffb53cc35e49400a2abb2291d76f

git rev-parse 3771c7b9d033ffb53cc35e49400a2abb2291d76f^{commit}
3771c7b9d033ffb53cc35e49400a2abb2291d76f
```

## Evidence-tree blob resolution

```text
100644 blob a337525710e6e07032fddf37d98462394c28f4e5e  evidence/stage-6b/Stage-6B-Destructive-Mutation-Inventory-2026-08-23.md
100644 blob df14cd676dc6f6a74f732e62b96e6606858efc51e  evidence/stage-6b/Stage-6B-Lifecycle-X3-Evidence-Manifest-2026-08-23.sha256
100644 blob cbcc951eb9b0cb607597f6e8e94f785bae169a20e  evidence/stage-6b/Stage-6B-Lifecycle-X3-Verification-2026-08-23.md
```

## SHA-256 readback

```text
3a89fbe3009f04e83ede37fca7e73bbe9073a96e07c990a092474bf671e4f6a1  evidence/stage-6b/Stage-6B-Lifecycle-X3-Verification-2026-08-23.md
fed9ebb4e50b3e2e169f0504ceea8e962fbb04fdf6d40236113b43f331d52caa  evidence/stage-6b/Stage-6B-Destructive-Mutation-Inventory-2026-08-23.md
```

The two SHA-256 values match the dedicated manifest in the evidence-content commit. The manifest itself is resolved above as blob `df14cd676dc6f6a74f732e62b96e6606858efc51e`.