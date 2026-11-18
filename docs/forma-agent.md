# Forma meal agent

Write only the owner's supplied or approved meal information. Do not infer missing quantities as zero. Get the site's origin and `INGEST_SECRET` from the owner's private configuration; never include them in conversation logs or commits.

Use the full endpoint `https://dash.example.com/api/ingest/meals`, replacing the origin with the owner's site, with:

```text
Authorization: Bearer <INGEST_SECRET>
Content-Type: application/json
```

In bearer-only mode, no Access credentials are needed. If the owner has enabled Access, also send their `CF-Access-Client-Id` and `CF-Access-Client-Secret`; keep the bearer header.

POST shape (explicitly synthetic example; omit `source:"test"` for owner records):

```json
{
  "source":"test",
  "entries":[{"id":"synthetic-meal-a","day":"2040-01-01","meal":"pranzo","time":"12:00","title":"Synthetic meal A","kcal":500,"protein":20,"carbs":80,"fat":10}],
  "days":[{"day":"2040-01-01","day_type":"riposo"}]
}
```

Use stable IDs, for example `<local-day>:<meal>:<owner-entry-key>`. Retry with the same ID to update rather than duplicate. Keep the owner's local calendar day (`YYYY-MM-DD`), with optional `HH:MM` time. Meal keys are `colazione, spuntino, pranzo, merenda, cena, altro, giornata`. Default day types are `riposo, allenamento`; ask for the owner's configured `DAY_TYPES` if different. Do not invent a day type; it can be omitted. Unknown configured day types display their raw name.

Each entry may include notes, `items:[{f:"banana",g:100}]`, supplement items `{s:<key>,n:<units>}`, unmapped items `{x:<name>,why:<reason>}`, and explicit `nutrients:{fiber:10}`. Food/supplement keys and units are in `src/nutrition/foods.json`. The starter set has no supplements; the owner must add their own reference entries before using supplement items. Titles do not infer supplement identities or quantities. Values and examples are generic reference information, not a personal plan. Omitting `items` or `nutrients` preserves previously stored detail; `[]` and `{}` clear it. Other entry fields are replaced by the upsert, so include the complete desired entry.

Do not change global targets unless the owner asked. An optional `targets` object replaces `kv.meal_targets`; it overrides deployment defaults. Example synthetic shape: `{"riposo":2000,"protein":[100,140]}` or `{"estimates":{"cycling":2400},"protein":{"base":100,"cap":140}}`. Supplement plans, if authorized, use `supp_plan:[{s,n|g,label,when}]`.

Always inspect the JSON response: HTTP 200 can contain `ok:false` and validation errors with partial writes. Read back with `GET /api/ingest/meals?day=2040-01-01` and the same bearer. It returns `{day,entries,summary,targets}`. Verify IDs, totals and dates before reporting success. A 401 means bad/missing bearer; 503 means ingest is not configured; with optional Access a 403 means its extra gate failed.

Deletion requires the owner's instruction: DELETE `?id=<id>` removes one meal; `?day=<YYYY-MM-DD>` removes that day's meals and summary. DELETE `?source=test` removes synthetic test meals and summaries only. A dashboard session cookie does not authorize ingest. Do not use browser authentication as a substitute for the agent's own credentials.
