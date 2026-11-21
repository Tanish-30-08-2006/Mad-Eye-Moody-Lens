# Issue map

Supply all five GitHub issue numbers in the eventual PR; this work does not open
issues or a PR. Link each with a separate `Closes #N` only once its acceptance
criteria and manual checklist pass.

| Issue | Owner | Resolving commit subject | Evidence (to be completed) |
| --- | --- | --- | --- |
| 1 Verify credential signatures and integrity | Team leader | feat(provenance): C2PA verification and trust states | SDK + c2patool cross-check; classification tests |
| 2 Extract image origin and editing declarations | Teammate | feat(provenance): origin and edit declarations | active-manifest extraction tests |
| 3 Verify bytes are the original file | User | feat(provenance): original-byte acquisition | input/output SHA-256 equality tests; source audit |
| 4 No test fixtures | User | feat(provenance): metadata reader and fixtures | documented signed, corrupt, untrusted, stripped, SD, malformed fixtures |
| 5 Invalid/untrusted signatures need their own state | User | feat(provenance): C2PA verification and trust states | distinct status tests and UI badges |

Seven commits, in order: design/contract; metadata/fixtures; original bytes;
verification/trust; declarations; UI integration; final documentation. Final
documentation records actual commit IDs and executed versus manual evidence.
