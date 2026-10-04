# Chromium PDF worker seccomp profile

The PDF smoke runs under `config/seccomp-chromium.json`, derived from the Moby seccomp default profile at commit [`2ceae35d351c156cb5a8efc0fdc4a08cf94569d8`](https://github.com/moby/profiles/commit/2ceae35d351c156cb5a8efc0fdc4a08cf94569d8). The unmodified source is retained at `config/moby-seccomp-default.json` (SHA-256 `6416b47770785a41ac59073cdc77d9fe98517df2799dc83ef207e622de3053f6`), and its Apache-2.0 license is included at `licenses/MOBY-PROFILES-APACHE-2.0.txt`.

The profile keeps the upstream default-deny syscall action and changes only the rules needed by Chromium's Linux namespace sandbox:

- `clone` may create user, PID and network namespaces; mount, UTS, IPC and cgroup namespaces remain denied by seccomp.
- `unshare` is allowed only when its flags equal `CLONE_NEWUSER`.
- `chroot` is allowed because Chromium enters its empty sandbox root after creating the unprivileged user namespace. The worker retains no container capabilities, and no mount syscall is opened by this profile.
- All syscalls not admitted by the upstream allowlist or these three reviewed rules return `EPERM`. `clone3` retains the upstream `ENOSYS` fallback behavior.

The profile is not used alone. The verified invocation also runs as image user `node`, drops all capabilities, enables `no-new-privileges`, makes the image root read-only, grants only bounded temporary filesystems, limits the process count to 128, applies 1 GiB / 1 CPU bounds, and disconnects the container network. The renderer separately disables JavaScript and aborts every page resource request. Do not weaken any of these controls to work around an environment that lacks unprivileged user-namespace support.

The generated profile is verified against the pinned upstream bytes and the exact reviewed transformations:

```powershell
node scripts/verify-chromium-seccomp.mjs
pnpm verify:task -- T035
```

To update the baseline, pin a reviewed Moby profiles commit, refresh the upstream source and hash in `scripts/verify-chromium-seccomp.mjs`, then regenerate with `node scripts/verify-chromium-seccomp.mjs --write`. Review every upstream syscall change and rerun the real Chromium container smoke before accepting the update.

The current local Docker Desktop 29.8.1 Linux engine and GitHub's Ubuntu runner have passed the constrained smoke. Linux hosts that restrict unprivileged user namespaces through AppArmor or kernel policy need the host's documented user-namespace setting enabled for this dedicated worker. The application deployment target is still unselected; production kernel, AppArmor, Docker/container-runtime and orchestration acceptance remain release gates. This file does not select a production host or claim production acceptance.
