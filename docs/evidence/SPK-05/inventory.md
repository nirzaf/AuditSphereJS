# SPK-05 inventory — card dependencies of the remaining tasks

Generated 2026-10-08 from `docs/guides/01-execution-order.md` (dependency columns) and `docs/guides/13-execution-ledger.md` (statuses).
Rules applied mechanically: gates keep their edges (D20); the three edges removed by DN-13 are marked removed; edges whose dependency is already DONE or NOT_APPLICABLE are satisfied.
Every other edge is marked `review`: its data-or-sequencing classification needs the owner, card by card. No reason is invented for those edges.

Counts: removed 0, gate 32, satisfied 90, review 142. Remaining tasks: 114.

| Task | Depends on | Dependency status | Task status | Decision | Reason |
| --- | --- | --- | --- | --- | --- |
| T036 | T035 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T043 | T042 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T043 | T033 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T043 | T024 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T044 | T043 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T044 | T031 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T045 | T043 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T045 | T031 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T046 | T044 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T046 | T045 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T047 | T046 | IN_REVIEW | NOT_STARTED | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T047 | T010 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T047 | T022 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T048 | T047 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T049 | T048 | NOT_STARTED | IN_REVIEW | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T049 | T024 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T049 | T027 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T049 | T039 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T050 | T049 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T050 | T023 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T051 | T050 | IN_REVIEW | IN_REVIEW | keep (gate) | Gates keep their full dependencies (D20). |
| T051 | T014 | DONE | IN_REVIEW | keep (gate) | Gates keep their full dependencies (D20). |
| T052 | T018 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T053 | T052 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T053 | T037 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T054 | T052 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T054 | T028 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T055 | T053 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T055 | T054 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T055 | T028 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T056 | T055 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T056 | T036 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T057 | T056 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T057 | T021 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T058 | T056 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T058 | T057 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T059 | T057 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T059 | T058 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T059 | T025 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T060 | T055 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T060 | T036 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T060 | T002 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T061 | T060 | IN_REVIEW | NOT_STARTED | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T061 | T036 | IN_REVIEW | NOT_STARTED | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T062 | T061 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T062 | T053 | IN_REVIEW | NOT_STARTED | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T062 | T037 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T062 | T027 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T063 | T062 | NOT_STARTED | IN_REVIEW | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T063 | T059 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T063 | T024 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T064 | T059 | IN_REVIEW | NOT_STARTED | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T064 | T032 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T064 | T030 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T064 | T002 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T065 | T063 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T065 | T064 | NOT_STARTED | IN_REVIEW | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T065 | T036 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T065 | T004 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T070 | T069 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T070 | T065 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T070 | T030 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T071 | T070 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T071 | T027 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T071 | T067 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T072 | T071 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T072 | T035 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T072 | T037 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T073 | T072 | IN_REVIEW | NOT_STARTED | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T073 | T020 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T073 | T028 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T073 | T064 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T074 | T073 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T074 | T034 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T075 | T074 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T075 | T033 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T076 | T075 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T076 | T021 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T076 | T038 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T077 | T076 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T077 | T072 | IN_REVIEW | NOT_STARTED | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T077 | T034 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T077 | T002 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T078 | T051 | IN_REVIEW | NOT_STARTED | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T079 | T078 | NOT_STARTED | IN_REVIEW | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T079 | T023 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T080 | T079 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T080 | T046 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T081 | T080 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T081 | T049 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T081 | T028 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T082 | T081 | IN_REVIEW | NOT_STARTED | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T082 | T023 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T083 | T055 | IN_REVIEW | NOT_STARTED | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T083 | T021 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T084 | T083 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T084 | T040 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T085 | T081 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T085 | T003 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T086 | T085 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T086 | T023 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T087 | T086 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T087 | T003 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T088 | T087 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T088 | T084 | NOT_STARTED | IN_REVIEW | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T088 | T064 | NOT_STARTED | IN_REVIEW | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T088 | T028 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T089 | T088 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T090 | T089 | IN_REVIEW | NOT_STARTED | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T090 | T036 | IN_REVIEW | NOT_STARTED | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T091 | T090 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T091 | T088 | IN_REVIEW | NOT_STARTED | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T092 | T091 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T092 | T022 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T092 | T039 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T093 | T092 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T094 | T092 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T094 | T034 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T094 | T076 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T095 | T092 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T096 | T082 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T096 | T023 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T096 | T091 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T097 | T096 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T097 | T003 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T098 | T091 | NOT_STARTED | IN_REVIEW | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T098 | T003 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T098 | T081 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T099 | T098 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T099 | T023 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T100 | T098 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T101 | T098 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T102 | T099 | IN_REVIEW | NOT_STARTED | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T102 | T100 | IN_REVIEW | NOT_STARTED | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T102 | T101 | IN_REVIEW | NOT_STARTED | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T102 | T094 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T103 | T081 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T103 | T023 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T103 | T067 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T104 | T103 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T104 | T021 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T104 | T089 | IN_REVIEW | IN_REVIEW | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T105 | T104 | IN_REVIEW | NOT_STARTED | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T105 | T097 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T106 | T102 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T106 | T105 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T106 | T095 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T106 | T025 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T107 | T106 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T107 | T021 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T108 | T107 | NOT_STARTED | IN_PROGRESS | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T108 | T025 | DONE | IN_PROGRESS | satisfied | Dependency is DONE; no action for this edge. |
| T109 | T108 | IN_PROGRESS | NOT_STARTED | review | Dependency is IN_PROGRESS; data or sequencing not yet classified. |
| T109 | T028 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T110 | T109 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T110 | T087 | IN_REVIEW | NOT_STARTED | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T111 | T110 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T111 | T053 | IN_REVIEW | NOT_STARTED | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T111 | T032 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T112 | T111 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T112 | T037 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T112 | T040 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T113 | T112 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T113 | T037 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T113 | T035 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T114 | T110 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T114 | T105 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T114 | T113 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T115 | T114 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T116 | T115 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T117 | T116 | NOT_STARTED | NOT_STARTED | keep (gate) | Gates keep their full dependencies (D20). |
| T118 | T117 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T118 | T004 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T119 | T118 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T119 | T104 | IN_REVIEW | NOT_STARTED | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T119 | T036 | IN_REVIEW | NOT_STARTED | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T120 | T119 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T120 | T036 | IN_REVIEW | NOT_STARTED | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T121 | T117 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T121 | T036 | IN_REVIEW | NOT_STARTED | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T122 | T119 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T122 | T036 | IN_REVIEW | NOT_STARTED | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T122 | T002 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T123 | T122 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T123 | T075 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T124 | T113 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T124 | T114 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T124 | T037 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T125 | T069 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T125 | T119 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T125 | T002 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T126 | T120 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T126 | T123 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T126 | T004 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T127 | T126 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T127 | T121 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T127 | T124 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T127 | T125 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T127 | T031 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T128 | T127 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T128 | T116 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T129 | T128 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T129 | T028 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T129 | T027 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T130 | T129 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T130 | T077 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T130 | T037 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T131 | T130 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T131 | T040 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T131 | T004 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T132 | T131 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T132 | T026 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T133 | T132 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T133 | T006 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T134 | T133 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T134 | T132 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T135 | T134 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T135 | T021 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T136 | T134 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T136 | T034 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T137 | T136 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T137 | T002 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T137 | T004 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T138 | T137 | NOT_STARTED | NOT_STARTED | keep (gate) | Gates keep their full dependencies (D20). |
| T138 | T135 | NOT_STARTED | NOT_STARTED | keep (gate) | Gates keep their full dependencies (D20). |
| T140 | T139 | DONE | IN_REVIEW | satisfied | Dependency is DONE; no action for this edge. |
| T141 | T140 | IN_REVIEW | NOT_STARTED | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T142 | T084 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T142 | T141 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T143 | T142 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T143 | T069 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T147 | T071 | IN_REVIEW | NOT_STARTED | review | Dependency is IN_REVIEW; data or sequencing not yet classified. |
| T147 | T125 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T147 | T145 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T148 | T147 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T148 | T146 | DONE | NOT_STARTED | satisfied | Dependency is DONE; no action for this edge. |
| T148 | T143 | NOT_STARTED | NOT_STARTED | review | Dependency is NOT_STARTED; data or sequencing not yet classified. |
| T157 | T148 | NOT_STARTED | NOT_STARTED | keep (gate) | Gates keep their full dependencies (D20). |
| T157 | T138 | NOT_STARTED | NOT_STARTED | keep (gate) | Gates keep their full dependencies (D20). |
| T158 | T157 | NOT_STARTED | NOT_STARTED | keep (gate) | Gates keep their full dependencies (D20). |
| T159 | T157 | NOT_STARTED | NOT_STARTED | keep (gate) | Gates keep their full dependencies (D20). |
| T159 | T051 | IN_REVIEW | NOT_STARTED | keep (gate) | Gates keep their full dependencies (D20). |
| T160 | T159 | NOT_STARTED | NOT_STARTED | keep (gate) | Gates keep their full dependencies (D20). |
| T161 | T159 | NOT_STARTED | NOT_STARTED | keep (gate) | Gates keep their full dependencies (D20). |
| T161 | T160 | NOT_STARTED | NOT_STARTED | keep (gate) | Gates keep their full dependencies (D20). |
| T162 | T160 | NOT_STARTED | NOT_STARTED | keep (gate) | Gates keep their full dependencies (D20). |
| T162 | T161 | NOT_STARTED | NOT_STARTED | keep (gate) | Gates keep their full dependencies (D20). |
| T163 | T001 | DONE | NOT_STARTED | keep (gate) | Gates keep their full dependencies (D20). |
| T163 | T157 | NOT_STARTED | NOT_STARTED | keep (gate) | Gates keep their full dependencies (D20). |
| T164 | T163 | NOT_STARTED | NOT_STARTED | keep (gate) | Gates keep their full dependencies (D20). |
| T164 | T162 | NOT_STARTED | NOT_STARTED | keep (gate) | Gates keep their full dependencies (D20). |
| T165 | T161 | NOT_STARTED | NOT_STARTED | keep (gate) | Gates keep their full dependencies (D20). |
| T165 | T158 | NOT_STARTED | NOT_STARTED | keep (gate) | Gates keep their full dependencies (D20). |
| T165 | T016 | DONE | NOT_STARTED | keep (gate) | Gates keep their full dependencies (D20). |
| T166 | T165 | NOT_STARTED | NOT_STARTED | keep (gate) | Gates keep their full dependencies (D20). |
| T166 | T160 | NOT_STARTED | NOT_STARTED | keep (gate) | Gates keep their full dependencies (D20). |
| T167 | T166 | NOT_STARTED | NOT_STARTED | keep (gate) | Gates keep their full dependencies (D20). |
| T168 | T167 | NOT_STARTED | NOT_STARTED | keep (gate) | Gates keep their full dependencies (D20). |
| T168 | T162 | NOT_STARTED | NOT_STARTED | keep (gate) | Gates keep their full dependencies (D20). |
| T169 | T168 | NOT_STARTED | NOT_STARTED | keep (gate) | Gates keep their full dependencies (D20). |
| T169 | T164 | NOT_STARTED | NOT_STARTED | keep (gate) | Gates keep their full dependencies (D20). |
| T169 | T165 | NOT_STARTED | NOT_STARTED | keep (gate) | Gates keep their full dependencies (D20). |
| T170 | T169 | NOT_STARTED | NOT_STARTED | keep (gate) | Gates keep their full dependencies (D20). |
| T171 | T170 | NOT_STARTED | NOT_STARTED | keep (gate) | Gates keep their full dependencies (D20). |
