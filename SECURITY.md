# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration keeps and sends:

- The API key, or the user name and password, live in the configuration of
  the integration in Gladys (the password field is a secret field). They are
  sent to the Piwigo gallery only, in the `X-PIWIGO-API` header or to open a
  session, never logged and never written under `/data`.
- `/data` holds `piwigo-state.json`: the address of the gallery, the id of the
  last photo seen, and the photo count of each album. No photo, no name, no
  secret.
- Network: only the configured Piwigo gallery. Thumbnails are read only when
  the widget setting asks for them, for the photos the widget lists, and served
  to Gladys through its widget image proxy.
- The integration only reads: it never changes, uploads or deletes anything in
  Piwigo.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and Piwigo itself (see its
[security policy](https://github.com/Piwigo/Piwigo/security/policy)).
