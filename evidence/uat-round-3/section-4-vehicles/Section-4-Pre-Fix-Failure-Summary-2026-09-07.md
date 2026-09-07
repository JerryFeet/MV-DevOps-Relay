# Round 3 Section 4 — pre-fix failure summary

The clean focused run used a dedicated Clerk identity and a fresh non-system
unit per test/retry. Prior marked fixture vehicles were preserved as inactive;
setup refuses unmarked active/pending vehicles.

| Case | Real browser result |
|---|---|
| 4a owner-workflow legacy parking | Failed twice. The real vehicle dialog selector omitted the unit's persisted legacy owner parking lot and its underground type. |
| 4b Istimara removal | Failed twice. The real dialog visibly rendered the Istimara field. |
| 4c outside-click preservation | Failed twice. Clicking outside cleared/unmounted the filled Make field instead of preserving the dialog and value. |
| 4d uncapped vehicles | Failed twice. The first vehicle was created and visibly showed its lot/type; the second vehicle using that same lot received HTTP 409 instead of 201. |
| 4e explicit owner parking decision | Failed twice. The real owner registration form contained no “No parking lot” option. |
| 4f tenant non-redeclaration | Passed. The real tenant registration form did not ask the tenant to declare parking. |

The product source was not changed before this evidence boundary.