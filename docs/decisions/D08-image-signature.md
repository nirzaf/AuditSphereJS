# D08 — Image signature and firm seal

Decision date: 2026-10-02. Authority: direct user instruction, “use just image signature no need M365 eSignature.” This supersedes the earlier Microsoft 365 eSignature selection and the certificate-backed implementation default. CURRENT remains preserved; this document records the explicit change in assurance.

The selected implementation renders approved partner signature artwork and the official firm seal. It does not create a certificate-backed PDF signature or dispatch a Microsoft 365 eSignature request. MSAL remains the authentication library for Entra sign-in. Live signing-provider acceptance is no longer applicable under this instruction; live Entra, SharePoint and OneDrive acceptance remains required.

Partner authorization must still bind the exact report bytes (SHA-256), engagement, artifact version, partner identity, artwork version and approval instant. Authentication alone does not grant partner authority. Replacing artwork, editing report bytes or changing a report version requires a new explicit approval; approved artifacts remain immutable. Rendering belongs in the worker. Artwork and report files use the owned storage adapter, not browser-local credentials or public assets. A supplied PNG alone must not advance the engagement or satisfy other release gates.

The application's approval record verifies who approved which bytes. It must not describe the result as a cryptographically signed PDF. Microsoft 365 eSignature billing, signature dispatch, signing certificates, signing keys and certificate verification are excluded by this user decision. Reporting implementation and its positive/negative workflow tests are still pending; this decision is not completion evidence for T126.
