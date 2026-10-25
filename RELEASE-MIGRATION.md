# Release repository consolidation — 2026-10-25

Downloads now live in the public [source repository](https://github.com/diegoami/balloons-JS/releases).
All eight historical releases from diegoami/balloons-js-releases were copied.
Their APK names, labels, titles and prerelease status are retained. No historical
binary was rebuilt or modified. v2.8 is the new latest release, published from
annotated source tag v2.8 at 46785cfa2d6d7a68fbb976a5f276b70723e07a9e.

[RELEASE-ASSETS.json](RELEASE-ASSETS.json) records the eight original asset
sizes and SHA-256 values. Original downloads were checked against GitHub asset
digests when available; independent destination downloads were hashed and
compared with the originals. New release/asset IDs and publication timestamps
are unavoidable. The original publication times and notes are retained in
[RELEASE-LEGACY.json](RELEASE-LEGACY.json).

The old notes used relative blob/main/README.md installation links. The source
repository's default branch is master, so copied notes resolve those links to
their original repository URL. All other note text is retained. The archived
README keeps the installation anchor and directs users to current canonical
downloads. The original raw Markdown remains in RELEASE-LEGACY.json.

| Release | Original publication (UTC) | Tag treatment |
|---|---|---|
| v2.0 | 2026-09-19 18:29:33 | original legacy README tag imported unchanged |
| v2.1 | 2026-09-19 20:55:36 | original legacy README tag imported unchanged |
| v2.2 | 2026-09-22 08:19:06 | original legacy README tag imported unchanged |
| v2.3 | 2026-09-22 22:19:41 | original legacy README tag imported unchanged |
| v2.4 | 2026-09-22 23:57:17 | existing source tag reused unchanged |
| v2.5 | 2026-09-23 20:03:47 | existing source tag reused unchanged |
| v2.6 | 2026-09-24 19:06:05 | existing source tag reused unchanged |
| v2.7 | 2026-09-26 20:42:53 | existing source tag reused unchanged |

## Legacy provenance

There were no source release tags for v2.0–v2.3. Their original lightweight
tags were imported unchanged: v2.0 points to README snapshot
7e592ac0e54c23c7717ea87544f04522ac8e458d; v2.1–v2.3 point to
133cc66fa9c8d430f26ed56be3c235131da51c97. These are historical release
anchors, **not verified app-source commits**. GitHub's generated source
archives for those four tags consequently contain the legacy snapshot.
No unverified source commit was inferred from a binary.

Existing annotated source tags v2.4–v2.7 were reused without moving them.
AGENTS.md explains the retrospective v2.4 source-tag decision. Future
publication requires an existing annotated source tag and --verify-tag.

## Retired repository and compatibility

The old repository contained only its public README. Its original text is
preserved in RELEASE-LEGACY.json, with current game/install/credit material in
[DOWNLOADS.md](DOWNLOADS.md). The former repository is archived with all eight
releases, tags and APK assets intact. No repository rename or deletion was
performed. Its README, description/homepage and latest old release now point
to the canonical source releases; the latter adds a relocation banner above
the original notes. Old direct APK URLs still work.

The reviewed v2.8 binaries were published before the link-only source cleanup,
so those immutable packages retain the legacy About/download address. Its
archived landing page points to the new releases. Merging the cleanup changes
the live website and future packages; the v2.8 tag and historical binaries
are not rewritten. This is post-release source work for a later milestone.

The owner explicitly deferred the v2.8 real-phone check until after publication
on milestone [#91](https://github.com/diegoami/balloons-JS/issues/91). It is not
recorded as passed; the independent verdict for the exact tag was AGREE.
