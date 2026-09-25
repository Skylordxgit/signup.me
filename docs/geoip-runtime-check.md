# GeoIP runtime check

Keep the extracted GeoLite2-City.mmdb outside publicly served folders and Git.
Set GEOIP_DB_PATH to its absolute path as visible to the running Node process.
The file manager root is not evidence of the Node process's absolute path.
Do not infer that path from the hosting username.

Run in the deployed application's server terminal, with its runtime environment:

```sh
node scripts/check-geoip.mjs
```

This prints the configured path and working directory only in the terminal,
checks readability, opens the City database, and performs a public-IP lookup.
ENOENT means the runtime cannot see that path. EACCES means permissions prevent
reading it. Ask the host to identify a persistent directory mounted into the
Node runtime if the file manager upload is not visible there. Never fix this by
making the database publicly downloadable or granting world-write permissions.

The authenticated Master Admin health endpoint distinguishes unset configuration,
missing files, permissions, and invalid databases without exposing server paths.
Failed reader opens retry after five seconds. Successful readers are retained
until restart; restart after replacing a database to load the update.

Obtain updates from your MaxMind account using its licensed download/update
mechanism. Replace the file atomically and restart the application. The database
is a local lookup file; it does not replace the application's MySQL database.
