# Governance

Doc Bridge is maintained in public by the AgentsKit organization. Emerson Braun
is the primary maintainer. Repository maintainers are responsible for triage,
reviews, releases, security response, and enforcing the contribution and conduct
policies.

## Decisions

Bug reports, feature proposals, and implementation decisions belong in public
issues and pull requests whenever they do not involve a vulnerability or private
data. Maintainers decide by documented technical merit, compatibility with the
deterministic handoff contracts, maintenance cost, and evidence from tests or
reproducible examples.

Small, focused changes may proceed directly through a pull request. Contributors
should open an issue before a large architectural or contract change. Maintainers
have final merge authority and may decline changes that expand scope without
sufficient evidence or a sustainable maintenance path.

Security reports follow [SECURITY.md](SECURITY.md) and remain private until
coordinated disclosure is appropriate. Conduct matters follow
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Releases

Stable releases are cut from `master` using immutable semantic-version tags.
The repository release workflow reruns security, test, coverage, package,
dogfood, Marketplace, and documentation conformance checks before publishing
the npm package with provenance. It verifies the registry result, uploads the
package artifact to a GitHub Release draft, and leaves final GitHub Release
publication to a maintainer.

The detailed release procedure and recovery path are documented in
[docs/RELEASE.md](docs/RELEASE.md). Maintainer or release-process changes are
documented in this file through the same pull request workflow.
