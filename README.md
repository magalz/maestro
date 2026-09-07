# Maestro

Maestro's development repository: <https://github.com/magalz/maestro>.
This repository currently contains setup documentation and exclusions only.
There is no application, installed toolchain, CI or verified branch protection yet.

## Obtain the repository

Clone into a new development directory beside an unused `maestro` directory:

```sh
git clone --branch dev https://github.com/magalz/maestro.git maestro-dev
cd maestro-dev
git worktree add ../maestro main
```

The primary non-bare repository and its `.git` directory stay in `maestro-dev`,
normally on `dev`. The linked `maestro` worktree stays on `main` as a clean
production reference. These are two working trees sharing one repository;
do not move `.git`, overwrite existing directories or develop in the reference.

`main` is the default stable branch. Propose changes from `feature/*` or `fix/*`
branches into `dev`. Promotion to `main` requires explicit human acceptance.
See [CONTRIBUTING.md](CONTRIBUTING.md) on `dev` for the contribution and refresh
instructions as they are introduced through the initial development PR.

Private planning, installed agent tooling, uncleared branding, credentials and
generated local state stay outside tracked source. Review each file before
explicitly staging it; ignore rules alone do not establish publication safety.
