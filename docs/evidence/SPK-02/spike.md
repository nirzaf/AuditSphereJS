# SPK-02 — Retention and immutability on SharePoint for the archive

Status: options analysed from the repository's permission boundary and from public Microsoft 365 documentation. Nothing was tested in a tenant. Claims marked "unverified" must be checked in a test tenant before the owner relies on them.
Time box: 3 days. Feeds: T133, T134, T138.

## Question

After the 60-day lock, which Microsoft 365 control makes archived document versions undeletable and unmodifiable for the retention period, using only the permissions in `docs/microsoft365/permission-matrix.md` (or a reviewed addition)?

## Constraints from the repository

- The runtime storage permission is `Files.SelectedOperations.Selected`, with explicit `write` grants on named folders. Consent alone grants no access to any drive item (`permission-matrix.md`).
- Runtime SharePoint site and folder provisioning has no permission and is disabled. Setup is an administrator-operated procedure, not an API capability.
- Graph change notifications and webhooks are disabled.

Any option that needs the application to create a site, change site permissions, or apply a retention policy through an API that the matrix does not grant is therefore outside the boundary unless the matrix is amended.

## Options

| Option | What it is | Required permission and admin consent | How the application proves it is active | If a staff member is still a site member | Failure and recovery path | Cost |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| A. Retention label configured as a record on the archive library, applied at lock | A Microsoft Purview retention label with record behaviour, configured by an administrator | Administrator configures the label and its policy in Purview. The application needs no new runtime permission if labels are applied by the administrator procedure. Whether the application can read record status through Graph is unverified. | A label-status check against the sealed manifest at each read, if Graph exposes it (unverified). A content hash is recorded at lock regardless. | Record status and label behaviour depend on the label's default unlock setting and on whether users may unlock (sources differ). A member with edit rights may still change the file unless the record is locked (unverified). The content hash detects any change. | A changed file is an incident, not a silent state. Recovery depends on the Preservation Hold Library and administrator recovery (see sources). | Purview licensing for retention labels; the owner confirms the licence tier. |
| B. Separate archive site, read-only permissions applied at lock | At lock, the archive content moves to a separate site whose permissions are made read-only | Site creation and permission changes are administrator operations. The matrix grants the application no site or permission rights, so this needs an amendment and a reviewed addition. | The application cannot read the site permission state under the current grant. It would need a separate verification step run by an administrator. | Read-only permissions stop ordinary edits, but a site owner or administrator can change them back. | A permission rollback is possible and undetected unless verified separately. | Low licence cost; high administration cost. |
| C. Independent sealed copy in object storage with object lock | The sealed manifest and bytes are copied to an S3-compatible store with object lock (retention and legal hold) | The storage provider's credentials, handled as the existing storage adapter does (T032). Not a Microsoft 365 permission. | The application verifies each object's digest against the sealed manifest and checks the lock state through the provider API. | Not affected: the copy is outside the site. | A failed copy is retried by the existing outbox; a mismatch is an incident. Restoring from the copy is an application operation. | Provider storage and egress cost. |

## Sources (public Microsoft 365 and vendor documentation; read as search results, not as full pages)

- Microsoft Learn, record versioning in SharePoint and OneDrive: https://learn.microsoft.com/purview/record-versioning (record status, lock and unlock; regulatory records block editing).
- Microsoft Graph, `driveItem: lockOrUnlockRecord`: https://learn.microsoft.com/graph/api/driveitem-lockorunlockrecord.
- Office365ITPros on the Preservation Hold Library, retention and versions: https://office365itpros.com/2021/10/07/retention-changing-sharepoint-onlines-preservation-hold-library/.
- Gimmal, record locking with Microsoft 365 retention labels (a vendor's description of its setup, not Microsoft's): https://docs.gimmal.com/rm/Cloud/Cloud/record-locking-with-microsoft-365-retention-labels.
- SharePoint Maven, setting a document as a record through retention labels: https://sharepointmaven.com/how-to-properly-set-a-document-as-a-record-via-retention-labels-in-sharepoint-online/.

These sources disagree on whether members can edit a labelled file. The disagreement appears to depend on the label's default unlock setting and on whether users may unlock records. That is unverified for this tenant.

## Recommendation

1. Use option C as the independent control and proof. The sealed manifest and bytes are copied to object storage with object lock, and every read verifies digests against the manifest. This works within the existing storage boundary and does not depend on any Microsoft 365 administration.
2. Use option A as the in-place control for the retention period, applied by the administrator procedure in `docs/microsoft365/`. Its effect on member edits is unverified, so the application must not describe it as immutability until a test tenant shows the behaviour.
3. Do not adopt option B unless the owner amends the permission matrix to allow administrative site changes. It is the weakest of the three because a permission change reverses it silently.

## Draft decision (for owner approval)

Archived evidence is immutable through two independent controls: an object-locked sealed copy checked against the manifest (application-verified), and a retention label configured as a record on the archive library (administrator-configured, verified in a test tenant before use). Site-level read-only permissions are not used as the immutability control.

## Not verified here

- Whether the application can read record status through Graph under the current grant.
- The label's behaviour for members with edit rights, in the owner's tenant.
- The retention period and the licence tier.
- Any production behaviour: nothing in this spike was run against a tenant.
