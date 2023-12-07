# Run test suite locally

Tests and formatter check are enforced on pull requests.

The following command can be ran locally if you want to check your changes before commit.

```
docker run -it --rm --name auto-power-profile -w /app/tests -v "$PWD/..":/app:Z node:18 bash -c "yarn install --non-interactive && yarn test && yarn fmtcheck"
```
